/*
 * This file depends on VS Code as it's used for integration/e2e tests
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import { TextDecoder, TextEncoder } from 'util';
import { fromVsCodeUri, toVsCodeUri } from '../vscode/utils/vsc-utils';
import { Logger } from '@foam/core';
import { URI } from '@foam/core';
import { Resource } from '@foam/core';
import {
  FOAM_EXTENSION_ID,
  randomString,
  removeTestFolder,
  wait,
} from './test-utils';
import { Foam } from '@foam/core';
import { FoamWorkspace } from '@foam/core';

Logger.setLevel('error');

/**
 * Creates a minimal Foam mock with a workspace rooted at all VS Code workspace folders.
 * Shared by spec files that need a Foam instance without a full bootstrap.
 */
export function makeFoamMock() {
  const roots = vscode.workspace.workspaceFolders.map(f =>
    fromVsCodeUri(f.uri)
  );
  return { workspace: new FoamWorkspace(roots) } as any;
}

const POLL_INTERVAL_MS = 10;

const waitUntil = async (
  condition: () => boolean,
  timeout: number,
  timeoutMessage: () => string
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) {
      return true;
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(timeoutMessage());
};

/**
 * Deletes all files in the workspace, except for .vscode and .keep files.
 * Optionally waits for the Foam workspace to be empty after the cleanup.
 *
 * @param timeout if > 0, wait for the Foam workspace to be empty after cleanup, with this timeout
 * @returns a promise that resolves when the cleanup (and optional wait) is complete
 */
export const cleanWorkspace = async (timeout = 0) => {
  const files = await vscode.workspace.findFiles('**', '{.vscode,.keep}');
  await Promise.all(files.map(f => deleteFile(fromVsCodeUri(f))));
  if (timeout > 0) {
    await waitForEmptyFoamWorkspace(timeout);
  }
};

export const showInEditor = async (uri: URI) => {
  const doc = await vscode.workspace.openTextDocument(toVsCodeUri(uri));
  const editor = await vscode.window.showTextDocument(doc);
  return { doc, editor };
};

export const closeEditors = async () => {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await waitUntil(
    () =>
      vscode.window.activeTextEditor === undefined &&
      vscode.window.tabGroups.all.every(g => g.tabs.length === 0),
    2000,
    () => 'Timeout waiting for all editors to close'
  );
};

export const deleteFile = async (file: URI | { uri: URI }) => {
  const uri = 'uri' in file ? file.uri : file;
  // Deleted through a WorkspaceEdit rather than `fs.delete` so that VS Code
  // fires its file-operation events, the way the explorer does.
  const edit = new vscode.WorkspaceEdit();
  edit.deleteFile(toVsCodeUri(uri), {
    recursive: true,
    ignoreIfNotExists: true,
  });
  // A refused edit resolves `false` rather than throwing, so a delete that did
  // not happen is otherwise only noticed by whatever trips over the leftover.
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    Logger.error(`deleteFile: VS Code refused to delete ${uri.path}`);
  }
};

/**
 * Generates a URI within the workspace, either randomly
 * or by using the provided path components
 *
 * @param filepath optional path components for the URI
 * @returns a URI within the workspace
 */
export const getUriInWorkspace = (...filepath: string[]) => {
  const rootUri = fromVsCodeUri(vscode.workspace.workspaceFolders[0].uri);
  filepath = filepath.length > 0 ? filepath : [randomString() + '.md'];
  const uri = rootUri.joinPath(...filepath);
  return uri;
};

export const getFoamFromVSCode = async (): Promise<Foam> => {
  const extension = vscode.extensions.getExtension(FOAM_EXTENSION_ID);

  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  if (!exports || !exports.foam) {
    throw new Error('Foam not available in extension exports');
  }

  return exports.foam;
};

export const waitForNoteInFoamWorkspace = async (uri: URI, timeout = 5000) => {
  const foam = await getFoamFromVSCode();
  const workspace = foam.workspace;
  return waitUntil(
    () => !!workspace.find(uri.path),
    timeout,
    () => `Timeout waiting for note ${uri.toString()} in Foam workspace`
  );
};

export const waitForNoteRemovedFromFoamWorkspace = async (
  uri: URI,
  timeout = 5000
) => {
  const foam = await getFoamFromVSCode();
  const workspace = foam.workspace;
  return waitUntil(
    () => !workspace.find(uri.path),
    timeout,
    () =>
      `Timeout waiting for note ${uri.toString()} to be removed from Foam workspace`
  );
};

export const waitForEmptyFoamWorkspace = async (timeout = 5000) => {
  const foam = await getFoamFromVSCode();
  const workspace = foam.workspace;
  return waitUntil(
    () => workspace.list().length === 0,
    timeout,
    () => {
      const remaining = workspace.list().map(r => r.uri.path);
      return `Timeout waiting for Foam workspace to be empty (${
        remaining.length
      } resources remaining): ${remaining.join(', ')}`;
    }
  );
};

/**
 * Creates a file with a some content.
 *
 * @param content the file content
 * @param path relative file path
 * @returns an object containing various information about the file created
 */
export const createFile = async (content: string, filepath: string[] = []) => {
  const uri = getUriInWorkspace(...filepath);
  const filenameComponents = path.parse(uri.toFsPath());
  await vscode.workspace.fs.writeFile(
    toVsCodeUri(uri),
    new TextEncoder().encode(content)
  );
  return { uri, content, ...filenameComponents };
};

export const renameFile = (from: URI, to: URI) => {
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(toVsCodeUri(from), toVsCodeUri(to));
  return vscode.workspace.applyEdit(edit);
};

const decoder = new TextDecoder('utf-8');
export const readFile = async (uri: URI) => {
  const content = await vscode.workspace.fs.readFile(toVsCodeUri(uri));
  return decoder.decode(content);
};

export const createNote = (r: Resource) => {
  const content = `# ${r.title}

  some content and ${r.links
    .map(l => l.rawText)
    .join(' some content between links.\n')}
  last line.
`;
  return vscode.workspace.fs.writeFile(
    toVsCodeUri(r.uri),
    new TextEncoder().encode(content)
  );
};

export const runCommand = async <T>(command: string, args: T = undefined) =>
  vscode.commands.executeCommand(command, args);

/**
 * Runs a function with a modified configuration and
 * restores the original configuration afterwards
 *
 * @param key the key of the configuration to modify
 * @param value the value to set the configuration to
 * @param fn the function to execute
 */
export const withModifiedConfiguration = async (
  key,
  value,
  fn: () => void | Promise<void>
) => {
  const old = vscode.workspace.getConfiguration().inspect(key);
  await vscode.workspace.getConfiguration().update(key, value);
  try {
    await fn();
  } finally {
    await vscode.workspace.getConfiguration().update(key, old.workspaceValue);
  }
};

/**
 * Runs a function with a modified Foam configuration and
 * restores the original configuration afterwards
 *
 * @param key the key of the Foam configuration to modify
 * @param value the value to set the configuration to
 * @param fn the function to execute
 */
export const withModifiedFoamConfiguration = (
  key,
  value,
  fn: () => void | Promise<void>
) => withModifiedConfiguration(`foam.${key}`, value, fn);

/** The view type of VS Code's built-in Markdown Editor. */
export const MARKDOWN_EDITOR_VIEW_TYPE = 'vscode.markdown.editor';

/**
 * Runs `fn` with `*.md` associated with the built-in Markdown Editor, and
 * restores the original associations afterwards.
 */
export const withMarkdownEditorAssociation = (fn: () => void | Promise<void>) =>
  withModifiedConfiguration(
    'workbench.editorAssociations',
    { '*.md': MARKDOWN_EDITOR_VIEW_TYPE },
    fn
  );

/**
 * The view type of the editor showing the active tab, or `undefined` when it
 * is a text editor.
 */
export const getActiveTabViewType = (): string | undefined =>
  (
    vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
      viewType?: string;
    }
  )?.viewType;

/**
 * Runs `fn` as if a fresh temporary directory were a second workspace root,
 * after the real one: both the unit mock and the e2e host open one folder.
 */
export async function withSecondRoot(fn: (root: URI) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foam-second-root-'));
  const root = URI.file(dir);
  const [first] = vscode.workspace.workspaceFolders;
  const folders = vi
    .spyOn(vscode.workspace, 'workspaceFolders', 'get')
    .mockReturnValue([
      first,
      { uri: toVsCodeUri(root), name: 'notes', index: 1 },
    ]);
  try {
    await fn(root);
  } finally {
    folders.mockRestore();
    removeTestFolder(dir);
  }
}

/**
 * Runs `fn` and returns the folders that `workspace.findFiles` was asked to
 * search for `pattern`, as file system paths.
 *
 * Only the calls using that glob are reported: the spy is on the `workspace`
 * object the running extension shares, and the extension lists folders with
 * `findFiles` of its own whenever one appears (`listFilesInFolder` in
 * extension.ts), so its calls land in the same recording.
 */
export async function foldersSearchedFor(
  pattern: string,
  fn: () => Promise<unknown>
): Promise<string[]> {
  const findFiles = vi.spyOn(vscode.workspace, 'findFiles');
  try {
    await fn();
    return findFiles.mock.calls
      .map(([include]) => include)
      .filter(
        (include): include is vscode.RelativePattern =>
          include instanceof vscode.RelativePattern &&
          include.pattern === pattern
      )
      .map(include => include.baseUri.fsPath);
  } finally {
    findFiles.mockRestore();
  }
}

/**
 * Foam settings for MediaWiki-style wikilinks (`[[target|alias]]`, case
 * sensitive), the syntax the upstream Foam specs are written in.
 */
export const MEDIAWIKI_SYNTAX = {
  'wikilinks.syntax': 'mediawiki',
  'wikilinks.caseInsensitive': false,
};

/**
 * Foam settings for Gollum-style wikilinks (`[[alias|target]]`, case
 * insensitive), the extension's default syntax.
 */
export const GOLLUM_SYNTAX = {
  'wikilinks.syntax': 'gollum',
  'wikilinks.caseInsensitive': true,
};

/**
 * Applies Foam settings for every test of the enclosing `describe` block and
 * restores the previous workspace values afterwards.
 *
 * @param settings Foam setting keys (without the `foam.` prefix) and values
 */
export const useFoamConfiguration = (settings: Record<string, unknown>) => {
  const previous: Record<string, unknown> = {};
  beforeAll(async () => {
    const config = vscode.workspace.getConfiguration();
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = config.inspect(`foam.${key}`)?.workspaceValue;
      await config.update(`foam.${key}`, value);
    }
  });
  afterAll(async () => {
    const config = vscode.workspace.getConfiguration();
    for (const key of Object.keys(settings)) {
      await config.update(`foam.${key}`, previous[key]);
    }
  });
};

/**
 * Utility function to check if two URIs are the same.
 * It has the goal of supporting Uri and URI, and dealing with
 * inconsistencies in the way they are represented (especially the
 * drive letter in Windows)
 *
 * @param actual the actual value
 * @param expected the expected value
 */
export const expectSameUri = (
  actual: vscode.Uri | URI,
  expected: vscode.Uri | URI
) => {
  expect(actual.path.toLocaleLowerCase()).toEqual(
    expected.path.toLocaleLowerCase()
  );
};
