import * as vscode from 'vscode';
import { Emitter, Foam, FoamGraph } from '@foam/core';
import { createTestNote, createTestWorkspace } from '../../../test/test-utils';
import { MapBasedMemento } from '../../utils/vsc-utils';
import activate, { OrphanTreeView } from './orphans';

/**
 * Stubs tree view creation the way the VS Code extension host routes it: one
 * view per id, and visibility changes go to the view created last for that id
 * (`registerTreeDataProvider` creates a view too).
 */
function stubTreeViews() {
  const latest = new Map<string, { setVisible: (visible: boolean) => void }>();
  const create = (id: string) => {
    const visibility = new Emitter<{ visible: boolean }>();
    const noop = () => ({ dispose: () => {} });
    const view = {
      visible: false,
      title: 'Orphans',
      onDidChangeVisibility: visibility.event,
      onDidChangeSelection: noop,
      onDidExpandElement: noop,
      onDidCollapseElement: noop,
      dispose: () => {},
      setVisible: (visible: boolean) => {
        view.visible = visible;
        visibility.fire({ visible });
      },
    };
    latest.set(id, view);
    return view;
  };
  const createTreeView = vi
    .spyOn(vscode.window, 'createTreeView')
    .mockImplementation(((id: string) => create(id)) as any);
  const registerTreeDataProvider = vi
    .spyOn(vscode.window, 'registerTreeDataProvider')
    .mockImplementation(((id: string) => {
      create(id);
      return { dispose: () => {} };
    }) as any);
  return {
    show: (id: string) => latest.get(id).setVisible(true),
    restore: () => {
      createTreeView.mockRestore();
      registerTreeDataProvider.mockRestore();
    },
  };
}

describe('Orphans panel activation', () => {
  it('refreshes after a note is added once the panel is shown', async () => {
    const views = stubTreeViews();
    const workspace = createTestWorkspace();
    const graph = FoamGraph.fromWorkspace(workspace, true);
    const context = {
      subscriptions: [],
      globalState: new MapBasedMemento(),
    } as any;
    const refresh = vi.spyOn(OrphanTreeView.prototype, 'refresh');
    try {
      await activate(
        context,
        Promise.resolve({ workspace, graph } as unknown as Foam)
      );
      vi.useFakeTimers();
      refresh.mockClear();

      workspace.set(createTestNote({ uri: '/new-note.md' }));
      views.show('foam-vscode.orphans');
      vi.runAllTimers();

      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      refresh.mockRestore();
      context.subscriptions.forEach(d => d.dispose());
      graph.dispose();
      workspace.dispose();
      views.restore();
    }
  });
});
