import * as vscode from 'vscode';
import { URI } from '@foam/core';
import { waitForExpect } from '../../../test/test-utils';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  expectSameUri,
  getFoamFromVSCode,
  showInEditor,
  waitForNoteInFoamWorkspace,
} from '../../../test/test-utils-vscode';
import { MapBasedMemento } from '../../utils/vsc-utils';
import { ResourceTreeItem } from '../../utils/tree-views/tree-view-utils';
import activateConnections, { ConnectionsTreeDataProvider } from './connections';

/**
 * Activates a Connections panel over the running Foam and returns its
 * provider. The running extension has registered the panel's view and
 * commands already, so those registrations are stood in for.
 */
const activatePanel = async () => {
  const foam = await getFoamFromVSCode();
  const noEvent = () => new vscode.Disposable(() => {});
  let provider: ConnectionsTreeDataProvider;
  const createTreeView = vi
    .spyOn(vscode.window, 'createTreeView')
    .mockImplementation((_viewId: string, options: any) => {
      provider = options.treeDataProvider;
      return {
        title: 'Connections',
        onDidChangeVisibility: noEvent,
        onDidChangeSelection: noEvent,
        dispose: () => {},
      } as any;
    });
  const registerCommand = vi
    .spyOn(vscode.commands, 'registerCommand')
    .mockReturnValue(new vscode.Disposable(() => {}));
  const context = {
    subscriptions: [] as vscode.Disposable[],
    globalState: new MapBasedMemento(),
  };
  try {
    await activateConnections(context as any, Promise.resolve(foam));
  } finally {
    createTreeView.mockRestore();
    registerCommand.mockRestore();
  }
  return {
    provider,
    dispose: () => context.subscriptions.forEach(d => d.dispose()),
  };
};

/** The notes the panel lists, as lower-case paths */
const listedNotes = async (provider: ConnectionsTreeDataProvider) =>
  ((await provider.getChildren()) as ResourceTreeItem[]).map(item =>
    item.resource.uri.path.toLowerCase()
  );

const pathOf = (uri: URI) => uri.path.toLowerCase();

describe('Connections panel', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await closeEditors();
    await cleanWorkspace();
  });

  it('shows the connections of the note in the active editor', async () => {
    const noteA = await createFile('# Connections A\n', [
      'connections-panel',
      'note-a.md',
    ]);
    const noteB = await createFile('# Connections B\n\n[[note-a]]\n', [
      'connections-panel',
      'note-b.md',
    ]);
    await waitForNoteInFoamWorkspace(noteA.uri);
    await waitForNoteInFoamWorkspace(noteB.uri);
    const panel = await activatePanel();

    try {
      await showInEditor(noteA.uri);
      await waitForExpect(async () => {
        expectSameUri(panel.provider.target, noteA.uri);
        expect(await listedNotes(panel.provider)).toEqual([pathOf(noteB.uri)]);
      });

      await showInEditor(noteB.uri);
      await waitForExpect(async () => {
        expectSameUri(panel.provider.target, noteB.uri);
        expect(await listedNotes(panel.provider)).toEqual([pathOf(noteA.uri)]);
      });
    } finally {
      panel.dispose();
    }
  });

  it('keeps showing the last note when the active editor is closed', async () => {
    const note = await createFile('# Connections C\n', [
      'connections-panel',
      'note-c.md',
    ]);
    await waitForNoteInFoamWorkspace(note.uri);
    const panel = await activatePanel();

    try {
      await showInEditor(note.uri);
      await waitForExpect(() => {
        expectSameUri(panel.provider.target, note.uri);
      });

      await closeEditors();

      expectSameUri(panel.provider.target, note.uri);
    } finally {
      panel.dispose();
    }
  });
});
