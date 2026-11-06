import { FoamGraph } from '../model/graph';
import { Resource } from '../model/note';
import { URI } from '../model/uri';
import { FoamWorkspace } from '../model/workspace';
import { MarkdownLink } from './markdown-link';
import { WorkspaceTextEdit } from './text-edit';
import { Config } from '../config';
import { relativeTo } from '../utils/path';

/**
 * Builds a future-state workspace reflecting the given renames.
 * Old URIs are removed and new URIs are added, so that getIdentifier correctly
 * disambiguates renamed files against each other and against the rest of the workspace.
 */
function buildFutureWorkspace(
  workspace: FoamWorkspace,
  renames: Array<{ oldResource: Resource; newUri: URI }>
): FoamWorkspace {
  const future = new FoamWorkspace(workspace.roots, workspace.defaultExtension);
  for (const resource of workspace.list()) {
    future.set(resource);
  }
  for (const { oldResource, newUri } of renames) {
    future.delete(oldResource.uri);
    future.set({ ...oldResource, uri: newUri });
  }
  return future;
}

/**
 * `getDirectoryIdentifier` normalizes paths to lowercase for case-insensitive
 * matching, so its return value is always lowercase. This helper restores
 * the correct casing by matching the identifier's segments against the actual
 * path segments of the directory URI.
 *
 * Example: lowerId='folderb', dirPath='/folderB' → 'folderB'
 * Example: lowerId='parent/folderb', dirPath='/parent/folderB' → 'parent/folderB'
 */
function toCorrectCase(lowerId: string, dirUri: URI): string {
  const idSegments = lowerId.split('/');
  const pathSegments = dirUri.path.split('/').filter(Boolean);
  return pathSegments.slice(-idSegments.length).join('/');
}

/**
 * Core computation: given a list of (oldResource → newUri) pairs, computes
 * all wikilink edits needed in files that link to those resources.
 *
 * Uses a future-state workspace for identifier computation, so that:
 * - Files being renamed don't compete with their own old paths.
 * - Files within the same batch (e.g. a directory rename) correctly disambiguate
 *   against each other in the post-rename state.
 * - Directory-style identifiers (e.g. [[folderA]] → [[folderB]]) are preserved.
 */
function computeRenameEditsForPairs(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  renames: Array<{ oldResource: Resource; newUri: URI }>
): WorkspaceTextEdit[] {
  if (renames.length === 0) {
    return [];
  }

  if (Config.getWikilinksSyntax() === 'gollum') {
    return computeGollumRenameEdits(workspace, graph, renames);
  }

  const futureWorkspace = buildFutureWorkspace(workspace, renames);
  const allEdits: WorkspaceTextEdit[] = [];

  for (const { oldResource, newUri } of renames) {
    const connections = graph.getBacklinks(oldResource.uri);
    // getDirectoryIdentifier normalizes to lowercase; comparison must be case-insensitive
    const oldDirIdentifier = workspace.getDirectoryIdentifier(oldResource.uri);

    for (const connection of connections) {
      if (connection.link.type !== 'wikilink') {
        continue;
      }
      // A single unparsable link must not abort the whole rename
      try {
        const { target: linkTarget } = MarkdownLink.analyzeLink(
          connection.link
        );
        let identifier: string;
        if (
          oldDirIdentifier &&
          linkTarget.toLocaleLowerCase() === oldDirIdentifier
        ) {
          // Link uses a directory-style identifier (e.g. [[folderA]]). Compute the
          // new directory identifier and restore its correct casing from the URI.
          const newDirUri = newUri.getDirectory();
          const lowerId = futureWorkspace.getDirectoryIdentifier(newUri);
          identifier = lowerId
            ? toCorrectCase(lowerId, newDirUri)
            : futureWorkspace.getIdentifier(newUri);
        } else {
          identifier = futureWorkspace.getIdentifier(newUri);
        }

        const edit = MarkdownLink.createUpdateLinkEdit(connection.link, {
          target: identifier,
        });
        allEdits.push({ uri: connection.source, edit });
      } catch {
        continue;
      }
    }
  }

  return allEdits;
}

/**
 * The Gollum path a link from `sourceUri` writes to reach `targetUri`: from
 * the wiki root (`/folder/note`) when `fromRoot`, else relative to the
 * source's folder (`../folder/note`). A note path has no extension.
 */
function gollumLinkTarget(
  workspace: FoamWorkspace,
  sourceUri: URI,
  targetUri: URI,
  fromRoot: boolean
): string {
  const path = fromRoot
    ? workspace.relativePath(targetUri)
    : relativeTo(targetUri.path, sourceUri.getDirectory().path);
  return path.endsWith(workspace.defaultExtension)
    ? path.slice(0, -workspace.defaultExtension.length)
    : path;
}

/**
 * Gollum links are paths, so a rename rewrites them from where each linking
 * note will be: every wikilink to a renamed note, and the relative wikilinks
 * of a note that moves to another folder. A link from the wiki root stays
 * one. Edits are reported under the linking notes' current URIs.
 */
function computeGollumRenameEdits(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  renames: Array<{ oldResource: Resource; newUri: URI }>
): WorkspaceTextEdit[] {
  const futureUris = new Map(
    renames.map(({ oldResource, newUri }) => [oldResource.uri.path, newUri])
  );
  const futureUriOf = (uri: URI) => futureUris.get(uri.path) ?? uri;
  const caseInsensitive = Config.getWikilinksCaseInsensitive();
  const sameTarget = (a: string, b: string) =>
    caseInsensitive ? a.toLocaleLowerCase() === b.toLocaleLowerCase() : a === b;
  const allEdits: WorkspaceTextEdit[] = [];

  for (const { oldResource, newUri } of renames) {
    for (const connection of graph.getBacklinks(oldResource.uri)) {
      if (connection.link.type !== 'wikilink') {
        continue;
      }
      // A single unparsable link must not abort the whole rename
      try {
        const { isRoot } = MarkdownLink.analyzeLink(connection.link);
        const target = gollumLinkTarget(
          workspace,
          futureUriOf(connection.source),
          newUri,
          isRoot ?? false
        );
        allEdits.push({
          uri: connection.source,
          edit: MarkdownLink.createUpdateLinkEdit(connection.link, { target }),
        });
      } catch {
        continue;
      }
    }

    // A note moved to another folder keeps reaching the notes that stay put
    if (newUri.getDirectory().isEqual(oldResource.uri.getDirectory())) {
      continue;
    }
    for (const link of oldResource.links) {
      if (link.type !== 'wikilink') {
        continue;
      }
      try {
        const { target, isRoot, rawTarget } = MarkdownLink.analyzeLink(link);
        if (isRoot || target === '') {
          continue;
        }
        const targetUri = workspace.resolveLink(oldResource, link);
        if (
          !targetUri ||
          targetUri.isPlaceholder() ||
          futureUris.has(targetUri.path)
        ) {
          continue;
        }
        const newTarget = gollumLinkTarget(
          workspace,
          newUri,
          targetUri.asPlain(),
          false
        );
        if (sameTarget(newTarget, rawTarget ?? target)) {
          continue;
        }
        allEdits.push({
          uri: oldResource.uri,
          edit: MarkdownLink.createUpdateLinkEdit(link, { target: newTarget }),
        });
      } catch {
        continue;
      }
    }
  }

  return allEdits;
}

export function computeWikilinkRenameEdits(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  oldUri: URI,
  newUri: URI
): WorkspaceTextEdit[] {
  const oldResource = workspace.find(oldUri);
  if (!oldResource) {
    return [];
  }
  return computeRenameEditsForPairs(workspace, graph, [
    { oldResource, newUri },
  ]);
}

/**
 * Lists every resource indexed under `oldDirUri`, paired with the URI it will
 * live at once the directory has been moved to `newDirUri`.
 *
 * Used both to rewrite the links pointing into the directory and to migrate the
 * workspace entries themselves, so the two always agree on what is moving.
 */
export function listDirectoryRenamePairs(
  workspace: FoamWorkspace,
  oldDirUri: URI,
  newDirUri: URI
): Array<{ oldResource: Resource; newUri: URI }> {
  // The trailing slash keeps a sibling that merely shares a name prefix
  // (`notes-archive` next to `notes`) out of the list.
  const oldDirPrefix = oldDirUri.path + '/';
  return workspace
    .list()
    .filter(r => r.uri.path.startsWith(oldDirPrefix))
    .map(r => ({
      oldResource: r,
      newUri: newDirUri.joinPath(r.uri.path.slice(oldDirPrefix.length)),
    }));
}

export function computeDirectoryWikilinkRenameEdits(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  oldDirUri: URI,
  newDirUri: URI
): WorkspaceTextEdit[] {
  return computeRenameEditsForPairs(
    workspace,
    graph,
    listDirectoryRenamePairs(workspace, oldDirUri, newDirUri)
  );
}
