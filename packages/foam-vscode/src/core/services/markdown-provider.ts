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
import { getFoamVsCodeConfig } from '../../services/config';
import * as vscode from 'vscode';
import * as path from 'path';
import { getExtension } from '../utils/path';

export class MarkdownResourceProvider implements ResourceProvider {
  private disposables: IDisposable[] = [];
  private validExtensionRegExp = new RegExp(
    /(\.[a-zA-Z0-9]+)$/
  );

  constructor(
    private readonly dataStore: IDataStore,
    private readonly parser: ResourceParser,
    public readonly noteExtensions: string[] = ['.md'],
    private readonly workspaceRoots: URI[] = []
  ) {}

  supports(uri: URI) {
    return this.noteExtensions.includes(uri.getExtension());
  }

  async readAsMarkdown(uri: URI): Promise<string | null> {
    let content = await this.dataStore.read(uri);
    if (isSome(content) && uri.fragment) {
      const resource = this.parser.parse(uri, content);
      const section = Resource.findSection(resource, uri.fragment);
      if (isSome(section)) {
        const rows = content.split('\n');
        content = rows
          .slice(section.range.start.line, section.range.end.line)
          .join('\n');
      }
    }
    return content;
  }

  async fetch(uri: URI) {
    const content = await this.dataStore.read(uri);
    return isSome(content) ? this.parser.parse(uri, content) : null;
  }

  getFilePathForTarget(target: string, resourceSubDir: string, isRoot: boolean, workspace: FoamWorkspace)
  {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceFolderPath = workspaceFolder.uri.fsPath;
    let filePath = ''; 
    if(isRoot) {
      filePath = path.join(workspaceFolderPath, target).replace(/\\/g, "/");
    } else {
      filePath = path.join(workspaceFolderPath, resourceSubDir, target).replace(/\\/g, "/");
    }
    const validExtension = this.getValidExtension(filePath);
    if(validExtension === '') {
      filePath += workspace.defaultExtension;
    }
    return filePath;
  }

  getValidExtension(path: string) {
    const result = this.validExtensionRegExp.exec(path);
    if (result !== null) {
      return result[1];
    }
    return '';
  }

  resolveLink(
    workspace: FoamWorkspace,
    resource: Resource,
    link: ResourceLink
  ) {
    let targetUri: URI | undefined;
    const isGollum = getFoamVsCodeConfig('wikilinks.syntax') === 'gollum';
    let { target, section, alias, isRoot, parentCount, imageProperties } = MarkdownLink.analyzeLink(link);
    const { subdir, parentOverCount } = getResourceSubDir(resource.uri.path, parentCount);
       
    if (isGollum) {
      if (parentOverCount) {
        return undefined;
      }
      if (!isRoot && (subdir ?? '').length > 0) {
        target = subdir + target;
      }
    }
    
    switch (link.type) {
      case 'wikilink': {
        let definitionUri = undefined;
        for (const def of resource.definitions) {
          if (def.label === target) {
            definitionUri = def.url;
            break;
          }
        }
        if (isSome(definitionUri)) {
          const definedUri = resource.uri.resolve(definitionUri);
          targetUri =
            workspace.find(definedUri, resource.uri)?.uri ??
            URI.placeholder(definedUri.path);
        } else {
          if (isGollum) {
            if (target === '') {
              targetUri = resource.uri;
            } else {
              const filePath = this.getFilePathForTarget(target, subdir, isRoot, workspace);
              const targetResource = workspace.find2(filePath);
              if (!targetResource) {
                targetUri = URI.placeholder(target);
              } else {
                targetUri = targetResource.uri;
              }
            }
            if (section) {
              targetUri = targetUri.with({ fragment: section });
            }
          } else {
            targetUri = target === '' ? resource.uri : 
              workspace.find(target, resource.uri)?.uri ??
                URI.placeholder(target);
            if (section) {
              targetUri = targetUri.with({ fragment: section });
            }
          }
        }
        break;
      }
      case 'link': {
        if (isGollum) {
          const filePath = this.getFilePathForTarget(target, subdir, isRoot, workspace);
          const targetResource = workspace.find2(filePath);
          if (!targetResource) {
            targetUri = URI.placeholder(target);
          } else {
            targetUri = targetResource.uri;
          }
          if (section) {
            targetUri = targetUri.with({ fragment: section });
          }
        } else {
          let path: string;
          let foundResource: Resource | null = null;

          if (target.startsWith('/')) {
            // Handle workspace-relative paths (root-path relative)
            if (this.workspaceRoots.length > 0) {
              // Try to resolve against each workspace root
              for (const workspaceRoot of this.workspaceRoots) {
                const candidatePath = target.substring(1); // Remove leading '/'
                const absolutePath = workspaceRoot.joinPath(candidatePath);
                const found = workspace.find(absolutePath);
                if (found) {
                  foundResource = found;
                  break;
                }
              }

              if (!foundResource) {
                // Not found in any workspace root, create placeholder relative to first workspace root
                const firstRoot = this.workspaceRoots[0];
                const candidatePath = target.substring(1);
                const absolutePath = firstRoot.joinPath(candidatePath);
                targetUri = URI.placeholder(absolutePath.path);
              } else {
                targetUri = foundResource.uri;
              }
            } else {
              // No workspace roots provided, fall back to existing behavior
              path = target;
              targetUri =
                workspace.find(path, resource.uri)?.uri ??
                URI.placeholder(resource.uri.resolve(path).path);
            }
          } else {
            // Handle relative paths and non-root paths
            path =
              target.startsWith('./') || target.startsWith('../')
                ? target
                : './' + target;
            targetUri =
              workspace.find(path, resource.uri)?.uri ??
              URI.placeholder(resource.uri.resolve(path).path);
          }

          if (section && !targetUri.isPlaceholder()) {
            targetUri = targetUri.with({ fragment: section });
          }
          break;
        }
      }
    }
    return targetUri;
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

export function createMarkdownReferences(
  workspace: FoamWorkspace,
  source: Resource | URI,
  includeExtension: boolean
): NoteLinkDefinition[] {
  const resource = source instanceof URI ? workspace.find(source) : source;

  const definitions = resource.links
    .filter(link => link.type === 'wikilink')
    .map(link => {
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
      return {
        // embedded looks like ![[note-a]]
        // regular note looks like [[note-a]]
        label: link.rawText.substring(
          link.isEmbed ? 3 : 2,
          link.rawText.length - 2
        ),
        url: `${basePath ? basePath + '/' : ''}${encodedURL}`,
        title: target.title,
      };
    })
    .filter(isSome)
    .sort();
  return uniqBy(definitions, def => NoteLinkDefinition.format(def));
}

export function getResourceSubDir(filePath: string, parentCount: number) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!workspaceFolder) {
      return undefined; // File is not under any workspace folder
  }

  const relativePath = (path.relative(workspaceFolder.uri.path, filePath) ?? '').replace(/\\/g, '/');
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

  if (dir ?? '' !== '') {
    dir += '/';
  }

  return { 
    subdir: dir, 
    parentOverCount: parentOverCount
  };
}
