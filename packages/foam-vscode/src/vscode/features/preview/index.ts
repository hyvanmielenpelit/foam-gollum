/*global markdownit:readonly*/

import * as vscode from 'vscode';
import { Config, Foam, URI, createRenderContext } from '@foam/core';
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { createFoamMarkdownIt } from './foam-markdown-it';
import { createVsCodeLinkResolver } from './link-resolvers';
import { getFoamVsCodeConfig, updateFoamVsCodeConfig } from '../../config';
import { isVirtualWorkspace } from '../../services/editor';
import { CONFIG_EMBED_NOTE_TYPE } from './wikilink-embed';
import { CONFIG_FOOTNOTES_ENABLE } from '../navigation/navigation-provider';
import {
  CONFIG_PREVIEW_COLOR_SCHEME,
  CONFIG_SHOW_COLOR_SCHEME_SWITCH,
  ColorScheme,
  getEffectiveColorScheme,
  getForcedColorScheme,
  markdownItColorSchemeSwitch,
} from './color-scheme-switch';

export const USE_LIGHT_COLOR_SCHEME_COMMAND =
  'foam-vscode.preview.color-scheme:light';
export const USE_DARK_COLOR_SCHEME_COMMAND =
  'foam-vscode.preview.color-scheme:dark';
const COLOR_SCHEME_CONTEXT_KEY = 'foam-vscode.preview.color-scheme';

export default async function activate(
  context: vscode.ExtensionContext,
  foamPromise: Promise<Foam>
) {
  // Registered before the workspace loads, so the toolbar switch works meanwhile.
  const updateColorSchemeContext = () => {
    const kind = vscode.window.activeColorTheme.kind;
    const isLightTheme =
      kind === vscode.ColorThemeKind.Light ||
      kind === vscode.ColorThemeKind.HighContrastLight;
    vscode.commands.executeCommand(
      'setContext',
      COLOR_SCHEME_CONTEXT_KEY,
      getEffectiveColorScheme(
        getFoamVsCodeConfig(CONFIG_PREVIEW_COLOR_SCHEME),
        isLightTheme
      )
    );
  };
  const useColorScheme = (scheme: ColorScheme) => () =>
    updateFoamVsCodeConfig(
      CONFIG_PREVIEW_COLOR_SCHEME,
      scheme,
      vscode.ConfigurationTarget.Global
    );

  updateColorSchemeContext();
  context.subscriptions.push(
    vscode.commands.registerCommand(
      USE_LIGHT_COLOR_SCHEME_COMMAND,
      useColorScheme('light')
    ),
    vscode.commands.registerCommand(
      USE_DARK_COLOR_SCHEME_COMMAND,
      useColorScheme('dark')
    ),
    vscode.window.onDidChangeActiveColorTheme(updateColorSchemeContext),
    vscode.workspace.onDidChangeConfiguration(e => {
      const schemeChanged = e.affectsConfiguration(
        'foam.' + CONFIG_PREVIEW_COLOR_SCHEME
      );
      if (schemeChanged) {
        updateColorSchemeContext();
      }
      if (
        schemeChanged ||
        e.affectsConfiguration('foam.' + CONFIG_SHOW_COLOR_SCHEME_SWITCH)
      ) {
        vscode.commands.executeCommand('markdown.preview.refresh');
      }
    })
  );

  const foam = await foamPromise;

  // Refresh the markdown preview whenever the workspace changes so that
  // foam-query embed blocks show up-to-date results in real time.
  context.subscriptions.push(
    foam.workspace.onDidAdd(() =>
      vscode.commands.executeCommand('markdown.preview.refresh')
    ),
    foam.workspace.onDidUpdate(() =>
      vscode.commands.executeCommand('markdown.preview.refresh')
    ),
    foam.workspace.onDidDelete(() =>
      vscode.commands.executeCommand('markdown.preview.refresh')
    )
  );

  return {
    extendMarkdownIt: (md: markdownit) => {
      const ws = foam.workspace;
      const graph = foam.graph;
      const parser = foam.services.parser;

      // One render context per `extendMarkdownIt` call — shared between the
      // embed and query plugins so embed↔query cycles get caught.
      const renderContext = createRenderContext();

      // For `$current` in foam-query and for self-fragment embeds. The
      // context's top wins so a foam-query inside note B's body sees B,
      // not the active editor's note.
      const getCurrentResource = () => {
        const stack = renderContext.current();
        if (stack.length > 0) {
          return ws.find(stack[stack.length - 1]) ?? null;
        }
        const editor = vscode.window.activeTextEditor;
        return editor ? ws.find(fromVsCodeUri(editor.document.uri)) : null;
      };

      const result = createFoamMarkdownIt(
        {
          workspace: ws,
          graph,
          parser,
          linkResolver: createVsCodeLinkResolver(),
          // Read once, like the markdown provider's copy in extension.ts.
          directoryMode: Config.getLinksDirectoryMode(),
          getCurrentResource,
          isTrusted: () => vscode.workspace.isTrusted,
          // Build the full href shape the preview webview expects:
          // a leading-slash workspace-relative path, percent-encoded.
          // The URI's fragment is dropped here because foam-query result
          // titles always link to the note as a whole — they don't carry a
          // section target. If that changes, append `#${uri.fragment}`.
          toHref: (uri: URI) =>
            encodeURI(
              `/${vscode.workspace.asRelativePath(toVsCodeUri(uri), false)}`
            ),
          isVirtualWorkspace: () => isVirtualWorkspace(),
          getEmbedNoteType: () =>
            getFoamVsCodeConfig<string>(CONFIG_EMBED_NOTE_TYPE),
          // VS Code builds the preview engine once, so this is read once:
          // a change takes effect after a window reload.
          footnotes: getFoamVsCodeConfig<boolean>(
            CONFIG_FOOTNOTES_ENABLE,
            true
          ),
          renderContext,
          // By render time `md` carries every extension's plugins and VS
          // Code's own, so embedded content renders with all of them.
          createInnerMd: () => withoutSourceMap(md),
        },
        md
      );

      // Read at render time, so a change applies on the next preview refresh.
      return markdownItColorSchemeSwitch(result, {
        getForcedColorScheme: () =>
          getForcedColorScheme(
            getFoamVsCodeConfig(CONFIG_PREVIEW_COLOR_SCHEME),
            getFoamVsCodeConfig<boolean>(CONFIG_SHOW_COLOR_SCHEME_SWITCH, true)
          ),
        isTopLevel: () => renderContext.current().length === 0,
      });
    },
  };
}

/**
 * `md`, rendering without the `data-line` attribute and `code-line` class
 * that VS Code's preview puts on block tokens to sync scrolling with the
 * editor. Line numbers from embedded content index another note, so the
 * preview would map them onto the wrong lines of the open document.
 */
function withoutSourceMap(md: markdownit): markdownit {
  const inner: markdownit = Object.create(md);
  inner.render = (src: string, env: any = {}) => {
    const tokens = md.parse(src, env);
    for (const token of tokens) {
      token.attrs = token.attrs?.filter(([name]) => name !== 'data-line');
      const classes = token
        .attrGet('class')
        ?.split(' ')
        .filter(c => c !== 'code-line');
      if (classes?.length) {
        token.attrSet('class', classes.join(' '));
      } else if (classes) {
        token.attrs = token.attrs.filter(([name]) => name !== 'class');
      }
    }
    return md.renderer.render(tokens, md.options, env);
  };
  return inner;
}
