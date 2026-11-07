/*global markdownit:readonly*/

import { FoamWorkspace } from '@foam/core';
import { Resource, ResourceParser, Block } from '@foam/core';
import { MarkdownLink } from '@foam/core';
import { URI } from '@foam/core';
import { Position } from '@foam/core';
import { TextEdit } from '@foam/core';
import { isNone, isSome } from '@foam/core';
import { Config } from '@foam/core';

export const WIKILINK_EMBED_REGEX =
  /((?:(?:full|content)-(?:inline|card)|full|content|inline|card)?!\[\[[^[\]]+?\]\])/;
// we need another regex because md.use(regex, replace) only permits capturing one group
// so we capture the entire possible wikilink item (ex. content-card![[note]]) using WIKILINK_EMBED_REGEX and then
// use WIKILINK_EMBED_REGEX_GROUPER to parse it into the modifier(content-card) and the wikilink(note)
export const WIKILINK_EMBED_REGEX_GROUPS =
  /((?:\w+)|(?:(?:\w+)-(?:\w+)))?!\[\[([^|[\]]+?)(\|[^[\]]+?)?\]\]/;
export const CONFIG_EMBED_NOTE_TYPE = 'preview.embedNoteType';

export function withLinksRelativeToWorkspaceRoot(
  noteUri: URI,
  noteText: string,
  parser: ResourceParser,
  workspace: FoamWorkspace
): string {
  // Re-parse only to pick up link positions inside `noteText` — the URI is
  // just stamped onto `Resource.uri`, which we don't read.
  const note = parser.parse(noteUri, noteText);
  const isGollum = Config.getWikilinksSyntax() === 'gollum';
  const edits = note.links
    .map(link => {
      if (isGollum) {
        // A Gollum path is relative to the embedded note's folder, so it is
        // rewritten relative to the wiki root: `/folder/note`
        if (link.type === 'external') {
          return null;
        }
        const targetUri = workspace.resolveLink(note, link);
        if (!targetUri || targetUri.isPlaceholder()) {
          return null;
        }
        const rootPath = workspace.relativePath(targetUri);
        const stripExtension =
          link.type === 'wikilink' &&
          rootPath.endsWith(workspace.defaultExtension);
        return MarkdownLink.createUpdateLinkEdit(link, {
          target: stripExtension
            ? rootPath.slice(0, -workspace.defaultExtension.length)
            : rootPath,
        });
      }
      const info = MarkdownLink.analyzeLink(link);
      const resource = workspace.find(info.target, noteUri);
      // embedded notes that aren't created are still collected
      // return null so it can be filtered in the next step
      if (isNone(resource)) {
        return null;
      }
      // `createUpdateLinkEdit` preserves the link's existing fragment when
      // only `target` is provided, so `[[beta#Section]]` rewrites to
      // `[[/path/to/beta.md#Section]]`.
      return MarkdownLink.createUpdateLinkEdit(link, {
        target: resource.uri.path,
      });
    })
    .filter(linkEdits => !isNone(linkEdits))
    .sort((a, b) => Position.compareTo(b.range.start, a.range.start));
  const text = edits.reduce(
    (text, edit) => TextEdit.apply(text, edit),
    noteText
  );
  return text;
}

export function retrieveNoteConfig(
  explicitModifier: string | undefined,
  getEmbedNoteType: () => string
): {
  noteScope: string;
  noteStyle: string;
} {
  const config = getEmbedNoteType(); // ex. full-inline
  let [noteScope, noteStyle] = config.split('-');

  // an explicit modifier will always override corresponding user setting
  if (explicitModifier !== undefined) {
    if (['full', 'content'].includes(explicitModifier)) {
      noteScope = explicitModifier;
    } else if (['card', 'inline'].includes(explicitModifier)) {
      noteStyle = explicitModifier;
    } else {
      [noteScope, noteStyle] = explicitModifier.split('-');
    }
  }
  return { noteScope, noteStyle };
}

/**
 * Extracts the content of a block from note text.
 * For heading blocks, returns the section content (heading + body).
 * For other blocks, returns the block content with block anchor markers stripped.
 */
export function extractBlockContent(
  noteText: string,
  note: Resource,
  block: Block
): string {
  const rows = noteText.split('\n');
  if (block.type === 'heading') {
    const headingText = rows[block.range.start.line];
    // Find the section by start line rather than reconstructing the label from
    // raw markdown, which would retain inline formatting (e.g. **bold**) and
    // fail to match the AST-parsed plain-text label stored in Resource.sections.
    const section = note.sections.find(
      s => s.range.start.line === block.range.start.line
    );
    if (isSome(section)) {
      return rows
        .slice(section.range.start.line, section.range.end.line)
        .join('\n')
        .replace(/\s\^[a-zA-Z0-9-]+$/m, '');
    }
    return headingText.replace(/\s\^[a-zA-Z0-9-]+$/, '');
  }
  return rows
    .slice(block.range.start.line, block.range.end.line + 1)
    .join('\n')
    .replace(/\s\^[a-zA-Z0-9-]+$/gm, '');
}

export interface ImageParameters {
  filename: string;
  width?: string;
  height?: string;
  align?: 'center' | 'left' | 'right';
  alt?: string;
}

export function parseImageParameters(
  wikilink: string,
  parametersString?: string
): ImageParameters {
  const result: ImageParameters = {
    filename: wikilink,
  };

  if (!parametersString) {
    return result;
  }

  // Remove the leading pipe and split by remaining pipes
  const params = parametersString.slice(1).split('|');

  if (params.length === 0) {
    return result;
  }

  // First parameter is always size
  const sizeParam = params[0]?.trim();
  if (sizeParam) {
    // Parse size parameter: could be "300", "300x200", "50%", "300px", etc.
    // Check for width x height format (but not if it's just a unit like "px")
    const dimensionMatch = sizeParam.match(
      /^(\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?)\s*x\s*(\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?)$/i
    );
    if (dimensionMatch) {
      // Width x Height format
      result.width = dimensionMatch[1]?.trim();
      result.height = dimensionMatch[2]?.trim();
    } else {
      // Width only
      result.width = sizeParam;
    }
  }

  // Second parameter could be alignment
  const alignParam = params[1]?.trim().toLowerCase();
  if (alignParam && ['center', 'left', 'right'].includes(alignParam)) {
    result.align = alignParam as 'center' | 'left' | 'right';
  } else if (alignParam) {
    // If not alignment, treat as alt text
    result.alt = params.slice(1).join('|').trim();
  }

  // Third parameter onwards is alt text (if second wasn't alt text)
  if (result.align && params.length > 2) {
    result.alt = params.slice(2).join('|').trim();
  }

  return result;
}

export function generateImageStyles(
  params: ImageParameters,
  md: markdownit
): string {
  const { filename, width, height, align, alt } = params;

  // Build CSS styles for the image
  const styles: string[] = [];

  const cssWidth = toCssDimension(width);
  const cssHeight = toCssDimension(height);

  if (cssWidth) {
    styles.push(`width: ${cssWidth}`);

    // If only width is specified, set height to auto to maintain aspect ratio
    if (!cssHeight) {
      styles.push('height: auto');
    }
  }

  if (cssHeight) {
    styles.push(`height: ${cssHeight}`);
  }

  const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : ' alt=""';

  // Generate the image HTML
  const imageHtml = `<img src="${md.normalizeLink(
    filename
  )}"${styleAttr}${altAttr}>`;

  // Wrap with alignment if specified
  if (align) {
    return `<div style="text-align: ${align};">${imageHtml}</div>`;
  }

  return imageHtml;
}

/**
 * Validates a size parameter and returns it as a CSS dimension, or
 * `undefined` when it isn't one.
 *
 * These values are interpolated into a `style="..."` attribute, so anything
 * that isn't a plain dimension is dropped rather than emitted: a value
 * carrying a quote (`100" onload="alert(1)`) would otherwise close the
 * attribute and inject an event handler, and a value carrying a `;` could
 * append further declarations. The accepted forms mirror the width x height
 * parser above.
 */
function toCssDimension(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (!/^\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?$/i.test(value)) {
    return undefined;
  }
  // If no unit is specified and it's a pure number, add 'px'
  return /^\d+(?:\.\d+)?$/.test(value) ? value + 'px' : value;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
