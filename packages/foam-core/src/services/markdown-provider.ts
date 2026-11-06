import {
  NoteLinkDefinition,
  Resource,
  ResourceLink,
  ResourceParser,
} from '../model/note';
import { isNone, isSome } from '../utils';
import { Logger } from '../utils/log';
import { URI, percentDecode } from '../model/uri';
import { FoamWorkspace } from '../model/workspace';
import { IDisposable } from '../common/lifecycle';
import { ResourceProvider } from '../model/provider';
import { MarkdownLink } from './markdown-link';
import { IDataStore } from './datastore';
import { uniqBy } from 'lodash';
import { Config } from '../config';
import { isPathWithin, joinPath } from '../utils/path';

export class MarkdownResourceProvider implements ResourceProvider {
  private disposables: IDisposable[] = [];

  constructor(
    private readonly dataStore: IDataStore,
    private readonly parser: ResourceParser,
    public readonly noteExtensions: string[] = ['.md'],
    private readonly directoryMode: 'disabled' | 'resolve' = 'resolve'
  ) {}

  supports(uri: URI) {
    return this.noteExtensions.includes(uri.getExtension());
  }

  async readAsMarkdown(uri: URI): Promise<string | null> {
    let content = await this.dataStore.read(uri);
    if (isSome(content) && uri.fragment) {
      const resource = this.parser.parse(uri, content);
      const rows = content.split('\n');

      if (uri.fragment.startsWith('^')) {
        const blockId = uri.fragment.slice(1);
        const block = Resource.findBlock(resource, blockId);
        if (isSome(block)) {
          let range = block.range;
          // For heading blocks, use the section's content range instead
          if (block.type === 'heading') {
            const headingText = rows[block.range.start.line];
            const headingLabel = headingText
              .replace(/^#+\s*/, '')
              .replace(/\s\^[a-zA-Z0-9-]+$/, '');
            const section = Resource.findSection(resource, headingLabel);
            if (isSome(section)) {
              range = section.range;
              // Section ranges are exclusive at end (next heading start line)
              content = rows
                .slice(range.start.line, range.end.line)
                .join('\n')
                .replace(/\s\^[a-zA-Z0-9-]+$/gm, '');
            } else {
              // Fallback: just the heading line
              content = rows[block.range.start.line].replace(
                /\s\^[a-zA-Z0-9-]+$/,
                ''
              );
            }
          } else {
            // AST node ranges are inclusive at end, so use end.line + 1
            const sliced = rows
              .slice(range.start.line, range.end.line + 1)
              .join('\n');
            content = sliced.replace(/\s\^[a-zA-Z0-9-]+$/gm, '');
          }
        }
      } else {
        const section = Resource.findSection2(
          resource,
          uri.fragment,
          Config.getWikilinksSyntax() === 'gollum'
        );
        if (isSome(section)) {
          content = rows
            .slice(section.range.start.line, section.range.end.line)
            .join('\n');
        }
      }
    }
    return content;
  }

  async fetch(uri: URI) {
    const content = await this.dataStore.read(uri);
    return isSome(content) ? this.parser.parse(uri, content) : null;
  }

  resolveLink(
    workspace: FoamWorkspace,
    resource: Resource,
    link: ResourceLink
  ) {
    let targetUri: URI | undefined;
    if (link.type === 'external') {
      const url =
        typeof link.definition === 'string'
          ? link.definition
          : ResourceLink.isResolvedReference(link)
          ? link.definition.url
          : link.rawText;
      return URI.parse(url, 'external');
    }
    // Gollum links are paths, never directory identifiers
    if (Config.getWikilinksSyntax() === 'gollum') {
      return this.resolveGollumLink(workspace, resource, link);
    }
    const { target, section, blockId } = MarkdownLink.analyzeLink(link);
    switch (link.type) {
      case 'wikilink': {
        if (ResourceLink.isResolvedReference(link)) {
          const definedUri = resource.uri.resolve(link.definition.url);
          targetUri =
            workspace.find(definedUri, resource.uri)?.uri ??
            URI.placeholder(definedUri.path);
          if (definedUri.fragment) {
            targetUri = targetUri.with({ fragment: definedUri.fragment });
          }
        } else {
          targetUri =
            target === ''
              ? resource.uri
              : workspace.find(target, resource.uri)?.uri ??
                this._resolveDirectoryByIdentifier(workspace, target)?.uri ??
                URI.placeholder(target);
          if (blockId) {
            targetUri = targetUri.with({ fragment: `^${blockId}` });
          } else if (section) {
            targetUri = targetUri.with({ fragment: section });
          }
        }
        break;
      }
      case 'link': {
        if (ResourceLink.isUnresolvedReference(link)) {
          // Reference-style link with unresolved reference - treat as placeholder
          targetUri = URI.placeholder(link.definition);
          break;
        }

        // Handle reference-style links first; strip trailing slash (directory links)
        const targetPath = (
          ResourceLink.isResolvedReference(link) ? link.definition.url : target
        ).replace(/\/$/, '');

        let path: string;

        if (targetPath.startsWith('/')) {
          // Link targets are URLs, so `/My%20Note.md` points to `My Note.md`.
          // The literal target comes second, for file names containing `%`.
          // Decoding `%23` would give `find` a `#`, which it splits off as a
          // section (`/C%23.md` would open `C.md`), so those targets are only
          // looked up literally.
          const decodedPath = targetPath.includes('%23')
            ? targetPath
            : percentDecode(targetPath);
          const resolvedUri = workspace.resolveUri(targetPath, resource.uri);
          for (const candidate of new Set([decodedPath, targetPath])) {
            targetUri ??=
              workspace.find(candidate, resource.uri)?.uri ??
              workspace.roots
                .map(root =>
                  this._resolveAsDirectory(workspace, root.joinPath(candidate))
                )
                .find(Boolean)?.uri;
          }
          targetUri ??= URI.placeholder(resolvedUri.path);
        } else {
          // Handle relative paths and non-root paths
          path =
            targetPath.startsWith('./') || targetPath.startsWith('../')
              ? targetPath
              : './' + targetPath;
          // Use getDirectory().joinPath() rather than URI.resolve() to avoid
          // inheriting the parent's .md extension on files with no extension
          // (e.g. dotfiles like .editorconfig, where posix.extname returns '').
          // See: https://github.com/foambubble/foam/issues/1379
          const directResolvedUri = resource.uri.getDirectory().joinPath(path);
          targetUri =
            workspace.find(path, resource.uri)?.uri ??
            this._resolveAsDirectory(workspace, directResolvedUri)?.uri ??
            URI.placeholder(directResolvedUri.path);
        }

        if (section && !targetUri.isPlaceholder()) {
          targetUri = targetUri.with({ fragment: section });
        }
        break;
      }
    }
    return targetUri;
  }

  /**
   * Resolves a Gollum link: a path relative to the linking note's folder, or
   * to the wiki root when it starts with `/`. Returns `undefined` when `../`
   * climbs above the root.
   */
  private resolveGollumLink(
    workspace: FoamWorkspace,
    resource: Resource,
    link: ResourceLink
  ): URI | undefined {
    const { target, section, blockId, isRoot, parentCount } =
      MarkdownLink.analyzeLink(link);
    const location = getResourceSubDir(
      resource.uri.path,
      parentCount ?? 0,
      workspace.roots
    );
    if (location?.parentOverCount) {
      return undefined;
    }
    const subdir = location?.subdir ?? '';
    const workspaceRootPath = location?.workspaceRootPath ?? '';
    const filePathFor = (t: string) =>
      this.getFilePathForTarget(
        t,
        subdir,
        isRoot ?? false,
        workspaceRootPath,
        workspace
      );

    let targetUri: URI;
    if (link.type === 'wikilink') {
      if (ResourceLink.isResolvedReference(link)) {
        const definedUri = resource.uri.resolve(link.definition.url);
        targetUri =
          workspace.find(definedUri, resource.uri)?.uri ??
          URI.placeholder(definedUri.path);
        if (definedUri.fragment) {
          targetUri = targetUri.with({ fragment: definedUri.fragment });
        }
        return targetUri;
      }
      const filePath = filePathFor(target);
      targetUri =
        target === ''
          ? resource.uri
          : workspace.find2(filePath)?.uri ?? URI.placeholder(filePath);
      if (blockId) {
        targetUri = targetUri.with({ fragment: `^${blockId}` });
      } else if (section) {
        targetUri = targetUri.with({ fragment: section });
      }
      return targetUri;
    }

    if (ResourceLink.isUnresolvedReference(link)) {
      return URI.placeholder(link.definition);
    }
    // A link target is a URL, so `My%20Page.md` points to `My Page.md`; the
    // literal target is tried second. `%23` stays encoded, see `resolveLink`.
    const decodedTarget = target.includes('%23')
      ? target
      : percentDecode(target);
    for (const candidate of new Set([decodedTarget, target])) {
      targetUri ??= workspace.find2(filePathFor(candidate))?.uri;
    }
    targetUri ??= URI.placeholder(filePathFor(decodedTarget));
    if (section && !targetUri.isPlaceholder()) {
      targetUri = targetUri.with({ fragment: section });
    }
    return targetUri;
  }

  getFilePathForTarget(
    target: string,
    subdir: string,
    isRoot: boolean,
    workspaceRootPath: string,
    workspace: FoamWorkspace
  ) {
    let filePath = isRoot
      ? joinPath(workspaceRootPath, target)
      : joinPath(workspaceRootPath, subdir ?? '', target);
    const validExtension = this.getValidExtension(filePath);
    if (validExtension === '') {
      filePath += workspace.defaultExtension;
    }
    return filePath;
  }

  private validExtensionRegExp = new RegExp(/\.(\w+)$/);
  getValidExtension(p: string) {
    const result = this.validExtensionRegExp.exec(p);
    if (result !== null) {
      return result[1];
    }
    return '';
  }

  private _resolveAsDirectory(
    workspace: FoamWorkspace,
    resolvedDirUri: URI
  ): Resource | null {
    if (this.directoryMode !== 'resolve') return null;
    return workspace.findByDirectory(resolvedDirUri.path);
  }

  private _resolveDirectoryByIdentifier(
    workspace: FoamWorkspace,
    identifier: string
  ): Resource | null {
    if (this.directoryMode !== 'resolve') return null;
    return workspace.listByDirectoryIdentifier(identifier)[0] ?? null;
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

/**
 * Finds the workspace root that holds `filePath`, and the file's folder
 * relative to it (with a trailing `/`) after climbing `parentCount` folders.
 * `parentOverCount` is set when that climbs above the root. Returns
 * `undefined` when no root holds the file.
 */
export function getResourceSubDir(
  filePath: string,
  parentCount: number,
  workspaceRoots: URI[]
) {
  // A root may end in `/`, as the filesystem root `/` does
  const root = workspaceRoots.find(r =>
    isPathWithin(filePath, r.path.replace(/\/$/, ''))
  );
  if (!root) {
    return undefined;
  }
  const workspaceRootPath = root.path;

  const relativePath = filePath
    .substring(workspaceRootPath.length)
    .replace(/^\//, '')
    .replace(/\\/g, '/');
  let dir: string = relativePath;
  const dirLastIndexOfSlash = dir.lastIndexOf('/');
  if (dirLastIndexOfSlash >= 0) {
    dir = dir.substring(0, dirLastIndexOfSlash);
  } else {
    dir = '';
  }

  let count = 0;
  let parentOverCount = false;
  while (count < parentCount) {
    count++;
    if (dir === '') {
      parentOverCount = true;
      break;
    }
    const lastIndexOfSlash = dir.lastIndexOf('/');
    if (lastIndexOfSlash < 0) {
      dir = '';
      if (parentCount > count) {
        parentOverCount = true;
      }
      break;
    }
    dir = dir.substring(0, lastIndexOfSlash);
  }

  if (dir !== '') {
    dir += '/';
  }

  return {
    subdir: dir,
    parentOverCount: parentOverCount,
    workspaceRootPath: workspaceRootPath,
  };
}

export function createMarkdownReferences(
  workspace: FoamWorkspace,
  source: Resource | URI,
  includeExtension: boolean
): NoteLinkDefinition[] {
  const resource = source instanceof URI ? workspace.find(source) : source;
  if (!resource) {
    return [];
  }

  const definitions = resource.links
    .filter(link => ResourceLink.isReferenceStyleLink(link))
    .map(link => {
      if (link.type === 'external') {
        // no need to create definitions for external links
        return null;
      }

      if (ResourceLink.isResolvedReference(link)) {
        return link.definition;
      }

      const targetUri = workspace.resolveLink(resource, link);
      // A Gollum link that climbs above the wiki root resolves to nothing
      if (!targetUri) {
        return null;
      }
      const target = workspace.find(targetUri);
      if (isNone(target)) {
        Logger.warn(
          `Link ${targetUri.toString()} in ${resource.uri.toString()} is not valid.`
        );
        return null;
      }
      if (target.type === 'placeholder') {
        // no need to create definitions for placeholders
        return null;
      }

      // Special handling for same-file section links (e.g., [[#section]])
      if (target.uri.isEqual(resource.uri) && targetUri.fragment) {
        return {
          label: link.rawText.substring(
            link.isEmbed ? 3 : 2,
            link.rawText.length - 2
          ),
          url: `#${targetUri.fragment}`,
          title: target.title,
        };
      }

      let relativeUri = target.uri.relativeTo(resource.uri.getDirectory());
      if (
        !includeExtension &&
        relativeUri.path.endsWith(workspace.defaultExtension)
      ) {
        relativeUri = relativeUri.changeExtension('*', '');
      }

      // Extract base path and link name separately.
      const basePath = relativeUri.path.split('/').slice(0, -1).join('/');
      const linkName = relativeUri.path.split('/').pop();

      const encodedURL = encodeURIComponent(linkName).replace(/%20/g, ' ');

      // [wikilink-text]: path/to/file.md "Page title"
      // Build the base URL
      let url = `${basePath ? basePath + '/' : ''}${encodedURL}`;

      // Append fragment from targetUri if it exists
      if (targetUri.fragment) {
        url += `#${targetUri.fragment}`;
      }

      // [wikilink-text]: path/to/file.md#section "Page title"
      return {
        // embedded looks like ![[note-a]]
        // regular note looks like [[note-a]]
        label: link.rawText.substring(
          link.isEmbed ? 3 : 2,
          link.rawText.length - 2
        ),
        url: url,
        title: target.title,
      };
    })
    .filter(isSome);
  return uniqBy(definitions, def => NoteLinkDefinition.format(def));
}
