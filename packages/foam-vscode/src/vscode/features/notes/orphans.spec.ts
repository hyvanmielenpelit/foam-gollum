import * as vscode from 'vscode';
import { AlwaysIncludeMatcher } from '@foam/core';
import { FoamGraph } from '@foam/core';
import {
  createNoteFromMarkdown,
  createTestWorkspace,
} from '../../../test/test-utils';
import {
  GOLLUM_SYNTAX,
  MEDIAWIKI_SYNTAX,
  useFoamConfiguration,
} from '../../../test/test-utils-vscode';
import {
  fromVsCodeUri,
  MapBasedMemento,
  toVsCodeUri,
} from '../../utils/vsc-utils';
import { OrphanTreeView } from './orphans';

/**
 * Returns the notes the Orphans panel lists for a workspace holding `notes`
 * (workspace-relative path to text), as sorted workspace-relative paths.
 */
const orphansAmong = (notes: Record<string, string>) => {
  const root = fromVsCodeUri(vscode.workspace.workspaceFolders[0].uri);
  const workspace = createTestWorkspace([root]);
  for (const [path, text] of Object.entries(notes)) {
    workspace.set(createNoteFromMarkdown(root.joinPath(path).path, text));
  }
  const graph = FoamGraph.fromWorkspace(workspace);
  // The running extension has registered the panel's commands already
  const registerCommand = vi
    .spyOn(vscode.commands, 'registerCommand')
    .mockReturnValue(new vscode.Disposable(() => {}));
  let panel: OrphanTreeView;
  try {
    panel = new OrphanTreeView(
      new MapBasedMemento(),
      workspace,
      graph,
      new AlwaysIncludeMatcher()
    );
  } finally {
    registerCommand.mockRestore();
  }
  try {
    return panel
      .getValues()
      .map(uri => vscode.workspace.asRelativePath(toVsCodeUri(uri), false))
      .sort();
  } finally {
    panel.dispose();
    graph.dispose();
    workspace.dispose();
  }
};

describe('Orphans panel', () => {
  useFoamConfiguration(MEDIAWIKI_SYNTAX);

  it('lists the notes with no links to or from them', () => {
    expect(
      orphansAmong({
        'orphans/lonely.md': '# Lonely',
        'orphans/a.md': '# A\n\n[[b]]',
        'orphans/b.md': '# B',
      })
    ).toEqual(['orphans/lonely.md']);
  });

  it('does not list a note linked to by name from another folder', () => {
    expect(
      orphansAmong({
        'orphans-a/target.md': '# Target',
        'orphans-b/source.md': '# Source\n\n[[target]]',
      })
    ).toEqual([]);
  });

  it('does not list a note linked to with the alias after the target', () => {
    expect(
      orphansAmong({
        'orphans/target.md': '# Target',
        'orphans/source.md': '# Source\n\n[[target|An alias]]',
      })
    ).toEqual([]);
  });
});

describe('Orphans panel with Gollum syntax', () => {
  useFoamConfiguration(GOLLUM_SYNTAX);

  it('lists the notes with no links to or from them', () => {
    expect(
      orphansAmong({
        'orphans/lonely.md': '# Lonely',
        'orphans/a.md': '# A\n\n[[b]]',
        'orphans/b.md': '# B',
      })
    ).toEqual(['orphans/lonely.md']);
  });

  it('lists a note that a same-named link from another folder does not reach', () => {
    expect(
      orphansAmong({
        'orphans-a/target.md': '# Target',
        'orphans-b/source.md': '# Source\n\n[[target]]',
      })
    ).toEqual(['orphans-a/target.md']);
  });

  it('does not list a note linked to with the alias before the target', () => {
    expect(
      orphansAmong({
        'orphans/target.md': '# Target',
        'orphans/source.md': '# Source\n\n[[An alias|target]]',
      })
    ).toEqual([]);
  });

  it('does not list notes linked to with ../ or from the root', () => {
    expect(
      orphansAmong({
        'orphans-a/target.md': '# Target',
        'top.md': '# Top',
        'orphans-b/source.md': '# Source\n\n[[../orphans-a/target]] [[/top]]',
      })
    ).toEqual([]);
  });
});
