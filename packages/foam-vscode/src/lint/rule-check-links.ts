import { Block, LintIssue, Resource, ResourceLink } from '@foam/core';
import { Range } from '@foam/core';
import { FoamWorkspace } from '@foam/core';
import { MarkdownLink } from '@foam/core';
import { isNone } from '@foam/core';
import { Config } from '@foam/core';

export const AMBIGUOUS_IDENTIFIER_CODE = 'ambiguous-identifier';
export const UNKNOWN_SECTION_CODE = 'unknown-section';
export const UNKNOWN_BLOCK_CODE = 'unknown-block';
export const DUPLICATE_BLOCK_ID_CODE = 'duplicate-block-id';

/**
 * Checks all wikilinks in a resource for semantic issues:
 * - ambiguous identifiers (multiple targets)
 * - unknown sections
 * - unknown block anchors
 *
 * Returns LintIssue[] with no `fix` (these require human judgment).
 * `relatedInfo` carries candidate targets/sections/blocks for the VS Code adapter
 * to surface as code actions.
 */
export function checkLinks(
  resource: Resource,
  workspace: FoamWorkspace
): LintIssue[] {
  const issues: LintIssue[] = [];
  const wikiLinkSyntax = Config.getWikilinksSyntax();

  for (const link of resource.links || []) {
    if (link.type !== 'wikilink') {
      continue;
    }

    const { target, section, blockId } = MarkdownLink.analyzeLink(link);
    
    let targetResource: Resource | undefined = undefined;
    let isAmbiguous = false;
    let ambiguousTargets: Resource[] = [];

    if (wikiLinkSyntax === 'gollum') {
      try {
        const targetUri = workspace.resolveLink(resource, link);
        if (targetUri && !targetUri.isPlaceholder()) {
          targetResource = workspace.find(targetUri.asPlain()) ?? undefined;
        }
      } catch (e) {
        // provider not found or other error
      }
    } else {
      const targets = workspace.listByIdentifier(target);
      if (targets.length > 1) {
        isAmbiguous = true;
        ambiguousTargets = targets;
      } else if (targets.length === 1) {
        targetResource = targets[0];
      }
    }

    if (isAmbiguous) {
      issues.push({
        code: AMBIGUOUS_IDENTIFIER_CODE,
        message: 'Resource identifier is ambiguous',
        range: link.range,
        relatedInfo: ambiguousTargets.map(t => ({
          uri: t.uri,
          range: Range.create(0, 0, 0, 0),
          message: `Possible target: ${t.uri.path}`,
        })),
      });
    }

    if (section && targetResource) {
      const currentTarget = targetResource;
      if (isNone(Resource.findSection2(currentTarget, section, wikiLinkSyntax === 'gollum'))) {
        issues.push({
          code: UNKNOWN_SECTION_CODE,
          message: `Cannot find section "${section}" in document, available sections are:`,
          range: getFragmentRange(link, section),
          relatedInfo: (currentTarget.sections || []).map(s => ({
            uri: currentTarget.uri,
            range: s.range,
            message: s.label,
          })),
        });
      }
    }

    if (blockId && targetResource) {
      const currentTarget = targetResource;
      if (isNone(Resource.findBlock(currentTarget, blockId))) {
        issues.push({
          code: UNKNOWN_BLOCK_CODE,
          message: `Cannot find block "^${blockId}" in document, available blocks are:`,
          range: getFragmentRange(link, `^${blockId}`),
          relatedInfo: (currentTarget.blocks || []).map(b => ({
            uri: currentTarget.uri,
            range: b.markerRange,
            message: `^${b.id}`,
          })),
        });
      }
    }
  }

  return issues;
}

/**
 * Checks a resource for duplicate block IDs within the same document.
 * Returns LintIssue[] with no `fix`.
 */
export function checkDuplicateBlocks(resource: Resource): LintIssue[] {
  const issues: LintIssue[] = [];
  const blocksByID = new Map<string, Block[]>();

  for (const block of resource.blocks || []) {
    if (!blocksByID.has(block.id)) {
      blocksByID.set(block.id, []);
    }
    blocksByID.get(block.id)!.push(block);
  }

  for (const [id, blocks] of blocksByID) {
    if (blocks.length < 2) {
      continue;
    }
    // Only flag duplicates (2nd occurrence onwards); the first is fine.
    for (const block of blocks.slice(1)) {
      issues.push({
        code: DUPLICATE_BLOCK_ID_CODE,
        message: `Duplicate block ID "^${id}" - ignored`,
        range: block.markerRange,
        relatedInfo: blocks
          .filter(b => b !== block)
          .map(b => ({
            uri: resource.uri,
            range: b.markerRange,
            message: `Other occurrence of "^${id}"`,
          })),
      });
    }
  }

  return issues;
}

/**
 * Returns the range covering `#fragment` within a wikilink's raw text.
 * Starts at `#` and ends immediately after the fragment, before any `|` or `]]`.
 */
function getFragmentRange(link: ResourceLink, fragment: string): Range {
  const hashPos = link.rawText.indexOf('#');
  if (hashPos < 0) {
    return Range.create(
      link.range.end.line,
      link.range.end.character,
      link.range.end.line,
      link.range.end.character
    );
  }
  return Range.create(
    link.range.start.line,
    link.range.start.character + hashPos,
    link.range.end.line,
    link.range.start.character + hashPos + 1 + fragment.length
  );
}
