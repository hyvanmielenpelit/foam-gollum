import {
  NoteLinkDefinition,
  Resource,
  ResourceLink,
  ResourceParser,
} from '../model/note';
import { isNone, isSome } from '../utils';
import { Logger } from '../utils/log';
import { URI } from '../model/uri';
import { FoamWorkspace } from '../model/workspace';
import { IDisposable } from '../common/lifecycle';
import { ResourceProvider } from '../model/provider';
import { MarkdownLink } from './markdown-link';
import { IDataStore } from './datastore';
import { uniqBy } from 'lodash';
import * as path from 'path';
import { Config } from '../config';

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
                .replace(/\s\^[a-zA-Z0-9-]+$/m, '');
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
        const section = Resource.findSection2(resource, uri.fragment, Config.getWikilinksSyntax() === 'gollum');
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
    const analyzed = MarkdownLink.analyzeLink(link);
    const target = analyzed.target;
    const section = analyzed.section;
    const blockId = analyzed.blockId;
    const isRoot = (analyzed as any).isRoot;
    const parentCount = (analyzed as any).parentCount;

    const wikiLinkSyntax = Config.getWikilinksSyntax();

    switch (link.type) {
      case 'wikilink': {
        if (wikiLinkSyntax === 'gollum') {
          let subdir = '';
          const retValue = getResourceSubDir(resource.uri.path, parentCount ?? 0, workspace.roots);
          let workspaceRootPath = '';
          if (retValue) {
            subdir = retValue.subdir;
            workspaceRootPath = retValue.workspaceRootPath;
            if (retValue.parentOverCount) {
              return undefined;
            }
          }

          if (ResourceLink.isResolvedReference(link)) {
            const definedUri = resource.uri.resolve(link.definition.url);
            targetUri =
              workspace.find(definedUri, resource.uri)?.uri ??
              URI.placeholder(definedUri.path);
            if (definedUri.fragment) {
              targetUri = targetUri.with({ fragment: definedUri.fragment });
            }
          } else {
            const filePath = this.getFilePathForTarget(target, subdir, isRoot ?? false, workspaceRootPath, workspace);
            targetUri =
              target === ''
                ? resource.uri
                : workspace.find2(filePath)?.uri ??
                  URI.placeholder(filePath);
            if (blockId) {
              targetUri = targetUri.with({ fragment: `^${blockId}` });
            } else if (section) {
              targetUri = targetUri.with({ fragment: section });
            }
          }
        } else {
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
        }
        break;
      }
      case 'link': {
        if (wikiLinkSyntax === 'gollum') {
          let subdir = '';
          const retValue = getResourceSubDir(resource.uri.path, parentCount ?? 0, workspace.roots);
          let workspaceRootPath = '';
          if (retValue) {
            subdir = retValue.subdir;
            workspaceRootPath = retValue.workspaceRootPath;
            if (retValue.parentOverCount) {
              return undefined;
            }
          }

          if (ResourceLink.isUnresolvedReference(link)) {
            targetUri = URI.placeholder(link.definition);
            break;
          }

          const filePath = this.getFilePathForTarget(target, subdir, isRoot ?? false, workspaceRootPath, workspace);
          targetUri = workspace.find2(filePath)?.uri ?? URI.placeholder(filePath);

          if (section && !targetUri.isPlaceholder()) {
            targetUri = targetUri.with({ fragment: section });
          }
        } else {
          if (ResourceLink.isUnresolvedReference(link)) {
            // Reference-style link with unresolved reference - treat as placeholder
            targetUri = URI.placeholder(link.definition);
            break;
          }

          // Handle reference-style links first; strip trailing slash (directory links)
          const targetPath = (
            ResourceLink.isResolvedReference(link) ? link.definition.url : target
          ).replace(/\/$/, '');

          let pathStr: string;

          if (targetPath.startsWith('/')) {
            const resolvedUri = workspace.resolveUri(targetPath, resource.uri);
            targetUri =
              workspace.find(targetPath, resource.uri)?.uri ??
              workspace.roots
                .map(root =>
                  this._resolveAsDirectory(workspace, root.joinPath(targetPath))
                )
                .find(Boolean)?.uri ??
              URI.placeholder(resolvedUri.path);
          } else {
            // Handle relative paths and non-root paths
            pathStr =
              targetPath.startsWith('./') || targetPath.startsWith('../')
                ? targetPath
                : './' + targetPath;
            // Use getDirectory().joinPath() rather than URI.resolve() to avoid
            // inheriting the parent's .md extension on files with no extension
            // (e.g. dotfiles like .editorconfig, where posix.extname returns '').
            // See: https://github.com/foambubble/foam/issues/1379
            const directResolvedUri = resource.uri.getDirectory().joinPath(pathStr);
            targetUri =
              workspace.find(pathStr, resource.uri)?.uri ??
              this._resolveAsDirectory(workspace, directResolvedUri)?.uri ??
              URI.placeholder(directResolvedUri.path);
          }

          if (section && !targetUri.isPlaceholder()) {
            targetUri = targetUri.with({ fragment: section });
          }
        }
        break;
      }
    }
    return targetUri;
  }

  getFilePathForTarget(target: string, subdir: string, isRoot: boolean, workspaceRootPath: string, workspace: FoamWorkspace) {
    let filePath: string;
    if (isRoot) {
      filePath = path.join(workspaceRootPath, target).replace(/\\/g, "/");
    } else {
      const resourceSubDir = (subdir ?? '').length > 0 ? subdir : '';
      filePath = path.join(workspaceRootPath, resourceSubDir, target).replace(/\\/g, "/");
    }
    const validExtension = this.getValidExtension(filePath);
    if(validExtension === '') {
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

export function getResourceSubDir(filePath: string, parentCount: number, workspaceRoots: URI[]) {
  // Find workspace root for this file
  let workspaceRootPath = '';
  for (const root of workspaceRoots) {
    if (filePath.startsWith(root.path)) {
      workspaceRootPath = root.path;
      break;
    }
  }
  if (!workspaceRootPath) {
    return undefined;
  }

  const relativePath = filePath.substring(workspaceRootPath.length).replace(/^\//, '').replace(/\\/g, '/');
  let dir: string = relativePath;
  let dirLastIndexOfSlash = dir.lastIndexOf('/');
  if (dirLastIndexOfSlash >= 0) {
    dir = dir.substring(0, dirLastIndexOfSlash);
  } else {
    dir = '';
  }

  let count: number = 0;
  let parentOverCount: boolean = false;
  while (count < parentCount) {
    count++;
    if (dir === '') {
      parentOverCount = true;
      break;
    }
    let lastIndexOfSlash = dir.lastIndexOf('/');
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
    workspaceRootPath: workspaceRootPath
  };
}

export function createMarkdownReferences(
  workspace: FoamWorkspace,
  source: Resource | URI,
  includeExtension: boolean
): NoteLinkDefinition[] {
  const resource = source instanceof URI ? workspace.find(source) : source;

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
    .filter(isSome)
    .sort();
  return uniqBy(definitions, def => NoteLinkDefinition.format(def));
}
