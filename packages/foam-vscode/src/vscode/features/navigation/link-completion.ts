import * as vscode from 'vscode';
import { Foam } from '@foam/core';
import { FoamGraph } from '@foam/core';
import { Resource } from '@foam/core';
import { URI } from '@foam/core';
import { FoamWorkspace } from '@foam/core';
import { getFoamVsCodeConfig } from '../../config';
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { getNoteTooltip, getFoamDocSelectors } from '../../services/editor';
import { getContentCacheFor } from '../../services/content-cache';
import { CONVERT_WIKILINK_TO_MDLINK } from '../editing/convert-links';
import { Config, completionAt } from '@foam/core';
import { MarkdownLink } from '@foam/core';
import * as path from 'path';

export const aliasCommitCharacters = ['#'];
export const linkCommitCharacters = ['#', '|'];
export const sectionCommitCharacters = ['|'];

const COMPLETION_CURSOR_MOVE = {
  command: 'foam-vscode.completion-move-cursor',
  title: 'Foam: Move cursor after completion',
};

/**
 * How far to move the cursor back after a completion moved it two characters
 * right, past the closing `]]`, given where the selection then changed to.
 * Returns 0 when it stays.
 */
export function cursorMoveBack(params: {
  isGollum: boolean;
  completion: { line: number; character: number };
  selection: { line: number; character: number };
  /** The text of the selection's line */
  lineText: string;
}): number {
  const { isGollum, completion, selection, lineText } = params;
  const preChar = lineText.charAt(selection.character - 1);
  if (!isGollum) {
    return linkCommitCharacters.includes(preChar) &&
      selection.line === completion.line &&
      selection.character === completion.character + 1
      ? 2
      : 0;
  }
  const preChar2 =
    selection.character - 2 >= 0 ? lineText.charAt(selection.character - 2) : '';
  const afterChar = lineText.charAt(selection.character);
  const afterChar2 = lineText.charAt(selection.character + 1);
  if (selection.line === completion.line) {
    if (
      preChar === ']' &&
      preChar2 === ']' &&
      selection.character === completion.character + 2
    ) {
      return 2;
    }
    if (
      linkCommitCharacters.includes(preChar) &&
      selection.character === completion.character + 1
    ) {
      return 2;
    }
    if (
      (afterChar !== ']' || afterChar2 !== ']') &&
      selection.character === completion.character + 2
    ) {
      return 2;
    }
  } else if (
    selection.line === completion.line + 1 &&
    selection.character === 0
  ) {
    return 1;
  }
  return 0;
}

export default async function activate(
  context: vscode.ExtensionContext,
  foamPromise: Promise<Foam>
) {
  const foam = await foamPromise;
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      getFoamDocSelectors(),
      new WikilinkCompletionProvider(foam.workspace, foam.graph),
      '[',
      '|'
    ),
    vscode.languages.registerCompletionItemProvider(
      getFoamDocSelectors(),
      new SectionCompletionProvider(foam.workspace),
      '#',
      '^'
    ),

    /**
     * always jump to the closing bracket, but jump back the cursor when commit
     * by alias divider `|` and section divider `#`
     * See https://github.com/foambubble/foam/issues/962,
     */
    vscode.commands.registerCommand(
      COMPLETION_CURSOR_MOVE.command,
      async () => {
        const activeEditor = vscode.window.activeTextEditor;
        // Without a text editor there is no cursor to move
        if (!activeEditor) {
          return;
        }
        const document = activeEditor.document;
        const currentPosition = activeEditor.selection.active;
        const cursorChange = vscode.window.onDidChangeTextEditorSelection(
          async e => {
            const changedPosition = e.selections[0].active;
            const moveBack = cursorMoveBack({
              isGollum: Config.getWikilinksSyntax() === 'gollum',
              completion: currentPosition,
              selection: changedPosition,
              lineText: document.lineAt(changedPosition.line).text,
            });

            cursorChange.dispose();
            if (moveBack > 0) {
              await vscode.commands.executeCommand('cursorMove', {
                to: 'left',
                by: 'character',
                value: moveBack,
              });
            }
          }
        );

        await vscode.commands.executeCommand('cursorMove', {
          to: 'right',
          by: 'character',
          value: 2,
        });
      }
    )
  );
}

export class SectionCompletionProvider
  implements vscode.CompletionItemProvider<vscode.CompletionItem>
{
  constructor(private ws: FoamWorkspace) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem>> {
    const syntax = Config.getWikilinksSyntax();
    const isGollum = syntax === 'gollum';
    const context = completionAt(
      document.getText(),
      document.offsetAt(position),
      syntax
    );
    if (context?.kind !== 'section' && context?.kind !== 'block') {
      return null;
    }

    // A Gollum target is a path, which may start with `/` or `../`
    const target = isGollum
      ? MarkdownLink.convertGollumTarget(context.target).target
      : context.target;
    const resource = this.ws.find(
      target === '' ? fromVsCodeUri(document.uri) : target
    );
    const aliasLength =
      context.alias !== undefined ? context.alias.length + 1 : 0;
    // From after the `#` that follows `[[`, any alias, and the target
    const replacementRange = new vscode.Range(
      document.positionAt(
        context.start + 2 + aliasLength + context.target.length + 1
      ),
      position
    );
    if (resource) {
      if (context.kind === 'block') {
        // Block anchor completions
        const items = resource.blocks.map(b => {
          const label = `^${b.id}`;
          const item = new ResourceCompletionItem(
            label,
            vscode.CompletionItemKind.Text,
            resource.uri.with({ fragment: `^${b.id}` })
          );
          item.detail = b.type;
          item.sortText = String(b.range.start.line).padStart(5, '0');
          item.range = replacementRange;
          item.commitCharacters = sectionCommitCharacters;
          item.command = COMPLETION_CURSOR_MOVE;
          return item;
        });
        return new vscode.CompletionList(items);
      }
      // Section completions; a Gollum link names a section by its slug
      const items = resource.sections.map(b => {
        const anchor = isGollum ? Resource.convertAnchor(b.label) : b.label;
        const item = new ResourceCompletionItem(
          b.label,
          vscode.CompletionItemKind.Text,
          resource.uri.with({ fragment: anchor })
        );
        item.sortText = String(b.range.start.line).padStart(5, '0');
        item.range = replacementRange;
        item.commitCharacters = sectionCommitCharacters;
        item.command = COMPLETION_CURSOR_MOVE;
        if (isGollum) {
          item.insertText = anchor;
        }
        return item;
      });
      return new vscode.CompletionList(items);
    }
  }

  resolveCompletionItem(
    item: ResourceCompletionItem | vscode.CompletionItem
  ): vscode.ProviderResult<vscode.CompletionItem> {
    if (item instanceof ResourceCompletionItem) {
      return getContentCacheFor(this.ws)
        .readAsMarkdown(item.resourceUri)
        .then(text => {
          item.documentation = getNoteTooltip(text);
          return item;
        });
    }
    return item;
  }
}

export class WikilinkCompletionProvider
  implements vscode.CompletionItemProvider<vscode.CompletionItem>
{
  constructor(private ws: FoamWorkspace, private graph: FoamGraph) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem>> {
    const syntax = Config.getWikilinksSyntax();
    const isGollum = syntax === 'gollum';
    const context = completionAt(
      document.getText(),
      document.offsetAt(position),
      syntax
    );
    if (context?.kind !== 'link') {
      return null;
    }
    // A Gollum alias is already typed, so only the target is completed
    const afterAlias = context.alias !== undefined;

    const labelStyle = getCompletionLabelSetting();
    const aliasSetting = getCompletionAliasSetting();
    const linkFormat = getCompletionLinkFormatSetting();

    // Use safe range that VS Code accepts - replace content inside brackets
    // only, after any Gollum alias and its `|`
    const replacementRange = new vscode.Range(
      document.positionAt(
        context.start + 2 + (afterAlias ? context.alias.length + 1 : 0)
      ),
      position
    );

    // The inserted text never moves the start of the replacement range, so
    // the link is still there when the command runs.
    const convertToMarkdownLink: vscode.Command = {
      ...CONVERT_WIKILINK_TO_MDLINK,
      arguments: [document.uri, replacementRange.start],
    };

    const directoryMode = Config.getLinksDirectoryMode();

    const documentHasSubDir =
      vscode.workspace.asRelativePath(document.uri).indexOf('/') > 0;
    // The Gollum link to a resource: its path from the wiki root, without
    // the note extension. A note at the root, linked from the root, has no `/`.
    const gollumPath = (resource: Resource, resourceIsDocument: boolean) => {
      const relativePath = vscode.workspace.asRelativePath(
        toVsCodeUri(resource.uri)
      );
      const resourceHasSubDir = relativePath.indexOf('/') > 0;
      const rootSlash =
        documentHasSubDir || resourceHasSubDir || !resourceIsDocument
          ? '/'
          : '';
      const absolutePath = rootSlash + relativePath;
      return path.extname(absolutePath) === this.ws.defaultExtension
        ? absolutePath.slice(0, -this.ws.defaultExtension.length)
        : absolutePath;
    };

    const resources = this.ws.list().map(resource => {
      const resourceIsDocument =
        ['attachment', 'image'].indexOf(resource.type) === -1;

      // For index files (index.md, README.md), prefer the directory name as the completion
      // identifier (e.g. [[bar]] instead of [[bar/index]]), unless a regular file already
      // claims that name (e.g. bar.md exists), in which case fall back to the file identifier.
      const directoryIdentifier =
        resourceIsDocument && directoryMode === 'resolve'
          ? this.ws.getDirectoryIdentifier(resource.uri)
          : null;
      const identifier =
        directoryIdentifier && !this.ws.find(directoryIdentifier)
          ? directoryIdentifier
          : this.ws.getIdentifier(resource.uri);
      const relativePath = vscode.workspace.asRelativePath(
        toVsCodeUri(resource.uri)
      );
      const linkPath = isGollum
        ? gollumPath(resource, resourceIsDocument)
        : undefined;

      const label = isGollum
        ? linkPath
        : !resourceIsDocument
        ? identifier
        : labelStyle === 'path'
        ? relativePath
        : labelStyle === 'title'
        ? resource.title
        : identifier;

      const item = new ResourceCompletionItem(
        label,
        vscode.CompletionItemKind.File,
        resource.uri
      );

      item.detail = isGollum ? linkPath : relativePath;
      item.sortText = resourceIsDocument
        ? `0-${item.label}`
        : `1-${item.label}`;
      // A path label starts with its folders, so a filter that only matches
      // from the start could not find the note by the identifier it links
      // with. The path follows for filters that match anywhere.
      if (resourceIsDocument && (isGollum || labelStyle === 'path')) {
        item.filterText = `${identifier} ${label}`;
      }

      const useAlias =
        resourceIsDocument &&
        linkFormat !== 'link' &&
        aliasSetting !== 'never' &&
        wikilinkRequiresAlias(resource, this.ws.defaultExtension);

      if (isGollum) {
        item.insertText =
          useAlias && !afterAlias ? `${resource.title}|${linkPath}` : linkPath;
      } else {
        item.insertText = useAlias
          ? `${identifier}|${resource.title}`
          : identifier;
      }
      // When using aliases or markdown link format, don't allow commit characters
      // since we either have the full text or will convert it
      item.commitCharacters =
        useAlias || linkFormat === 'link' ? [] : linkCommitCharacters;
      item.range = replacementRange;
      item.command =
        linkFormat === 'link' ? convertToMarkdownLink : COMPLETION_CURSOR_MOVE;
      return item;
    });
    const aliases = this.ws.list().flatMap(resource =>
      resource.aliases.map(a => {
        const item = new ResourceCompletionItem(
          a.title,
          vscode.CompletionItemKind.Reference,
          resource.uri
        );

        if (isGollum) {
          const linkPath = gollumPath(resource, true);
          item.insertText = afterAlias ? linkPath : `${a.title}|${linkPath}`;
        } else {
          const identifier = this.ws.getIdentifier(resource.uri);
          item.insertText = `${identifier}|${a.title}`;
        }
        // When using markdown link format, don't allow commit characters
        item.commitCharacters =
          linkFormat === 'link' ? [] : aliasCommitCharacters;
        item.range = replacementRange;

        // If link format is enabled, convert after completion
        item.command =
          linkFormat === 'link'
            ? convertToMarkdownLink
            : COMPLETION_CURSOR_MOVE;

        item.detail = `Alias of ${vscode.workspace.asRelativePath(
          toVsCodeUri(resource.uri)
        )}`;
        return item;
      })
    );
    // A Gollum placeholder has no path to complete
    const placeholders = isGollum
      ? []
      : Array.from(this.graph.placeholders.values()).map(uri => {
          const item = new vscode.CompletionItem(
            uri.path,
            vscode.CompletionItemKind.Interface
          );
          item.insertText = uri.path;
          item.command = COMPLETION_CURSOR_MOVE;
          item.range = replacementRange;
          return item;
        });

    return new vscode.CompletionList([
      ...resources,
      ...aliases,
      ...placeholders,
    ]);
  }

  resolveCompletionItem(
    item: ResourceCompletionItem | vscode.CompletionItem
  ): vscode.ProviderResult<vscode.CompletionItem> {
    if (item instanceof ResourceCompletionItem) {
      return getContentCacheFor(this.ws)
        .readAsMarkdown(item.resourceUri)
        .then(text => {
          item.documentation = getNoteTooltip(text);
          return item;
        });
    }
    return item;
  }
}

/**
 * A CompletionItem related to a Resource
 */
class ResourceCompletionItem extends vscode.CompletionItem {
  constructor(
    label: string,
    type: vscode.CompletionItemKind,
    public resourceUri: URI
  ) {
    super(label, type);
  }
}

function getCompletionLabelSetting() {
  const labelStyle: 'path' | 'title' | 'identifier' =
    getFoamVsCodeConfig('completion.label');
  return labelStyle;
}

function getCompletionAliasSetting() {
  const aliasStyle: 'never' | 'whenPathDiffersFromTitle' = getFoamVsCodeConfig(
    'completion.useAlias'
  );
  return aliasStyle;
}

function getCompletionLinkFormatSetting() {
  const linkFormat: 'wikilink' | 'link' = getFoamVsCodeConfig(
    'completion.linkFormat'
  );
  return linkFormat;
}

const normalize = (text: string) => text.toLocaleLowerCase().trim();
function wikilinkRequiresAlias(resource: Resource, defaultExtension: string) {
  // Compare filename (without extension) to title
  const nameWithoutExt = resource.uri.getName();
  const titleWithoutExt = resource.title.endsWith(defaultExtension)
    ? resource.title.slice(0, -defaultExtension.length)
    : resource.title;
  return normalize(nameWithoutExt) !== normalize(titleWithoutExt);
}
