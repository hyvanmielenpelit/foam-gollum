import {
  computeWikilinkRenameEdits,
  computeDirectoryWikilinkRenameEdits,
  listDirectoryRenamePairs,
} from './link-integrity';
import {
  createNoteFromMarkdown,
  createTestNote,
  createTestWorkspace,
} from '../../test/test-utils';
import { FoamGraph } from '../model/graph';
import { URI } from '../model/uri';
import { Resource } from '../model/note';
import { Config, DefaultFoamConfig } from '../config';
import { createMarkdownParser } from './markdown-parser';
import { TextEdit, WorkspaceTextEdit } from './text-edit';

const root = URI.file('/workspace');

function createWorkspaceAndGraph(...notes: Resource[]) {
  const workspace = createTestWorkspace([root]);
  notes.forEach(n => workspace.set(n));
  const graph = FoamGraph.fromWorkspace(workspace);
  return { workspace, graph };
}

describe('computeWikilinkRenameEdits', () => {
  it('returns empty array when the note has no backlinks', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const { workspace, graph } = createWorkspaceAndGraph(noteA);

    const edits = computeWikilinkRenameEdits(
      workspace,
      graph,
      noteA.uri,
      root.resolve('renamed.md')
    );

    expect(edits).toEqual([]);
  });

  it('updates the wikilink identifier when a note is renamed', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('renamed-note-a.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    expect(edits).toHaveLength(1);
    expect(edits[0].uri).toEqual(noteB.uri);
    expect(edits[0].edit.newText).toEqual('[[renamed-note-a]]');
  });

  it('uses the best identifier based on the new note location', () => {
    const noteA = createNoteFromMarkdown(
      'refactor/wikilink/first/note-a.md',
      'Content of A',
      root
    );
    const noteB = createNoteFromMarkdown(
      'refactor/wikilink/second/note-b.md',
      'Content of B',
      root
    );
    const noteC = createNoteFromMarkdown(
      'note-c.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB, noteC);
    // Rename note-a to first/note-b — now ambiguous with second/note-b
    const newUri = root.resolve('refactor/wikilink/first/note-b.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    expect(edits[0].edit.newText).toEqual('[[first/note-b]]');
  });

  it('uses the best identifier when moving a note to another directory', () => {
    const noteA = createNoteFromMarkdown(
      'refactor/wikilink/first/note-a.md',
      'Content of A',
      root
    );
    const noteB = createNoteFromMarkdown(
      'refactor/wikilink/second/note-b.md',
      'Content of B',
      root
    );
    const noteC = createNoteFromMarkdown(
      'note-c.md',
      'Link to [[note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB, noteC);
    // Moving note-a into second/ — still unique, so short identifier suffices
    const newUri = root.resolve('refactor/wikilink/second/note-a.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    expect(edits[0].edit.newText).toEqual('[[note-a]]');
  });

  it('preserves the alias when updating a wikilink', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a|Alias]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('new-note-a.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    expect(edits[0].edit.newText).toEqual('[[new-note-a|Alias]]');
  });

  it('preserves the section when updating a wikilink', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a#Section]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('new-note-with-section.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    expect(edits[0].edit.newText).toEqual('[[new-note-with-section#Section]]');
  });

  it('does not return edits for markdown links (delegated to VS Code built-in)', () => {
    const noteA = createNoteFromMarkdown('note-a.md', 'Content of A', root);
    const noteB = createNoteFromMarkdown(
      'note-b.md',
      'Link to [[note-a]] and [direct](./note-a.md)',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteB);
    const newUri = root.resolve('renamed.md');

    const edits = computeWikilinkRenameEdits(workspace, graph, noteA.uri, newUri);

    // Only the wikilink should produce an edit; the markdown link should be skipped
    expect(edits).toHaveLength(1);
    expect(edits[0].edit.newText).toEqual('[[renamed]]');
  });
});

describe('computeDirectoryWikilinkRenameEdits', () => {
  it('returns empty array when no Foam resources are inside the directory', () => {
    const outside = createNoteFromMarkdown('outside.md', 'Content', root);
    const { workspace, graph } = createWorkspaceAndGraph(outside);
    const oldDirUri = URI.file('/empty-folder');
    const newDirUri = URI.file('/renamed-folder');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits).toEqual([]);
  });

  it('updates qualified wikilinks pointing to files inside the renamed folder', () => {
    // note-a exists in two folders, so it must be qualified as [[folderA/note-a]]
    const noteA = createNoteFromMarkdown(
      'folderA/note-a.md',
      'Content of A',
      root
    );
    const conflict = createNoteFromMarkdown(
      'other/note-a.md',
      'Conflicting note',
      root
    );
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Link to [[folderA/note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, conflict, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits).toHaveLength(1);
    expect(edits[0].uri).toEqual(outside.uri);
    expect(edits[0].edit.newText).toEqual('[[folderB/note-a]]');
  });

  it('produces a no-op edit for unique wikilinks that remain unique after rename', () => {
    // unique-note has no basename conflicts — link is [[unique-note]] before and after
    const noteA = createNoteFromMarkdown(
      'folderA/unique-note.md',
      'Content',
      root
    );
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Link to [[unique-note]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits).toHaveLength(1);
    expect(edits[0].edit.newText).toEqual('[[unique-note]]');
  });

  it('correctly disambiguates files within the renamed folder that share a basename', () => {
    // Both files have basename 'note', forcing path-qualified identifiers
    const noteA = createNoteFromMarkdown(
      'folderA/note.md',
      'Content of A',
      root
    );
    const noteSub = createNoteFromMarkdown(
      'folderA/sub/note.md',
      'Content of Sub',
      root
    );
    // Current identifiers: [[folderA/note]] and [[sub/note]]
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Links to [[folderA/note]] and [[sub/note]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, noteSub, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    // With the future workspace, folderB/note and folderB/sub/note correctly
    // compete with each other — the naive exclude-only approach would return
    // 'note' for both (ambiguous).
    expect(edits.some(e => e.edit.newText === '[[folderB/note]]')).toBe(true);
    expect(edits.every(e => e.edit.newText !== '[[note]]')).toBe(true);
  });

  it('updates wikilinks inside the folder pointing to other files inside the same folder', () => {
    const noteA = createNoteFromMarkdown(
      'folderA/note-a.md',
      'Content of A',
      root
    );
    const conflict = createNoteFromMarkdown(
      'other/note-a.md',
      'Conflicting',
      root
    );
    // noteB is inside folderA and links to noteA (also inside folderA)
    const noteB = createNoteFromMarkdown(
      'folderA/note-b.md',
      'Link to [[folderA/note-a]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, conflict, noteB);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    // The edit goes to noteB's old URI (it will be renamed to folderB/note-b.md by VS Code)
    expect(edits).toHaveLength(1);
    expect(edits[0].uri).toEqual(noteB.uri);
    expect(edits[0].edit.newText).toEqual('[[folderB/note-a]]');
  });

  it('updates directory-style wikilinks [[folderA]] → [[folderB]] when the directory is renamed', () => {
    // folderA/index.md is the directory index, so it can be linked as [[folderA]]
    const index = createNoteFromMarkdown(
      'folderA/index.md',
      'Index of folderA',
      root
    );
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Link to [[folderA]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(index, outside);
    const oldDirUri = index.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits).toHaveLength(1);
    expect(edits[0].edit.newText).toEqual('[[folderB]]');
  });

  it('does not produce edits for links from inside the folder pointing outside', () => {
    // noteA links to outside, but we only care about backlinks of noteA (there are none)
    const noteA = createNoteFromMarkdown(
      'folderA/note-a.md',
      'Link to [[outside]]',
      root
    );
    const outside = createNoteFromMarkdown('outside.md', 'Content', root);
    const { workspace, graph } = createWorkspaceAndGraph(noteA, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits).toEqual([]);
  });

  it('preserves aliases when updating wikilinks to files inside the renamed folder', () => {
    const noteA = createNoteFromMarkdown(
      'folderA/note-a.md',
      'Content of A',
      root
    );
    const conflict = createNoteFromMarkdown(
      'other/note-a.md',
      'Conflicting',
      root
    );
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Link to [[folderA/note-a|My Alias]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, conflict, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits[0].edit.newText).toEqual('[[folderB/note-a|My Alias]]');
  });

  it('preserves section anchors when updating wikilinks to files inside the renamed folder', () => {
    const noteA = createNoteFromMarkdown(
      'folderA/note-a.md',
      'Content of A',
      root
    );
    const conflict = createNoteFromMarkdown(
      'other/note-a.md',
      'Conflicting',
      root
    );
    const outside = createNoteFromMarkdown(
      'outside.md',
      'Link to [[folderA/note-a#Section]]',
      root
    );
    const { workspace, graph } = createWorkspaceAndGraph(noteA, conflict, outside);
    const oldDirUri = noteA.uri.getDirectory();
    const newDirUri = URI.file('/folderB');

    const edits = computeDirectoryWikilinkRenameEdits(
      workspace,
      graph,
      oldDirUri,
      newDirUri
    );

    expect(edits[0].edit.newText).toEqual('[[folderB/note-a#Section]]');
  });
});

describe('listDirectoryRenamePairs', () => {
  it('maps every resource under the directory to its path after the move', () => {
    const noteA = createNoteFromMarkdown('folderA/note-a.md', 'A', root);
    const noteB = createNoteFromMarkdown('folderA/note-b.md', 'B', root);
    const outside = createNoteFromMarkdown('elsewhere/note-c.md', 'C', root);
    const { workspace } = createWorkspaceAndGraph(noteA, noteB, outside);

    const pairs = listDirectoryRenamePairs(
      workspace,
      URI.file('/folderA'),
      URI.file('/folderB')
    );

    expect(pairs.map(p => p.newUri.path).sort()).toEqual([
      '/folderB/note-a.md',
      '/folderB/note-b.md',
    ]);
    expect(pairs.map(p => p.oldResource.uri.path).sort()).toEqual([
      '/folderA/note-a.md',
      '/folderA/note-b.md',
    ]);
  });

  it('preserves nested sub-directory structure under the new path', () => {
    const nested = createNoteFromMarkdown(
      'folderA/sub/deep/note.md',
      'nested',
      root
    );
    const { workspace } = createWorkspaceAndGraph(nested);

    const pairs = listDirectoryRenamePairs(
      workspace,
      URI.file('/folderA'),
      URI.file('/parent/folderB')
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0].newUri.path).toEqual('/parent/folderB/sub/deep/note.md');
  });

  it('does not match sibling directories that share a name prefix', () => {
    const inside = createNoteFromMarkdown('notes/a.md', 'inside', root);
    const sibling = createNoteFromMarkdown('notes-archive/b.md', 'sibling', root);
    const { workspace } = createWorkspaceAndGraph(inside, sibling);

    const pairs = listDirectoryRenamePairs(
      workspace,
      URI.file('/notes'),
      URI.file('/journal')
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0].newUri.path).toEqual('/journal/a.md');
  });

  it('returns an empty list for a directory with no indexed resources', () => {
    const outside = createNoteFromMarkdown('outside.md', 'Content', root);
    const { workspace } = createWorkspaceAndGraph(outside);

    const pairs = listDirectoryRenamePairs(
      workspace,
      URI.file('/empty-folder'),
      URI.file('/renamed-folder')
    );

    expect(pairs).toEqual([]);
  });
});

describe('wikilink rename edits with Gollum syntax', () => {
  const wikiRoot = URI.file('/wiki');
  const parser = createMarkdownParser([]);
  const note = (path: string, text = '') => parser.parse(URI.file(path), text);

  beforeEach(() => {
    Config.setDefaultConfig(
      Object.assign(new DefaultFoamConfig(), {
        getWikilinksSyntax: () => 'gollum' as const,
        getWikilinksCaseInsensitive: () => false,
      })
    );
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  function createWikiAndGraph(...resources: Resource[]) {
    const workspace = createTestWorkspace([wikiRoot]);
    resources.forEach(r => workspace.set(r));
    const graph = FoamGraph.fromWorkspace(workspace);
    return { workspace, graph };
  }

  /**
   * Where the first link of `text`, written by the note at `oldPath`, points
   * once its edits are applied and it lives at `newPath`, in a workspace that
   * holds `others` as they are after the rename.
   */
  function resolveAfterRename(
    edits: WorkspaceTextEdit[],
    text: string,
    oldPath: string,
    newPath: string,
    others: Resource[]
  ) {
    const rewritten = TextEdit.apply(
      text,
      edits.filter(e => e.uri.path === oldPath).map(e => e.edit)
    );
    const moved = note(newPath, rewritten);
    const workspace = createTestWorkspace([wikiRoot]);
    [...others, moved].forEach(r => workspace.set(r));
    return workspace.resolveLink(moved, moved.links[0]);
  }

  describe('computeWikilinkRenameEdits with Gollum syntax', () => {
    it('renames the target of a link in the same folder', () => {
      const old = note('/wiki/a/Old.md');
      const text = 'Link to [[Old]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const renamed = note('/wiki/a/New.md');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        renamed.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].uri).toEqual(source.uri);
      expect(edits[0].edit.newText).toEqual('[[New]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/a/Src.md', [
          renamed,
        ])
      ).toEqual(renamed.uri);
    });

    it('writes a relative path when the note moves into a deeper folder', () => {
      const old = note('/wiki/Note.md');
      const text = 'Link to [[Note]]';
      const source = note('/wiki/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = note('/wiki/a/b/Note.md');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[a/b/Note]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/Src.md', '/wiki/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });

    it('writes a relative path with ../ when the note moves into a shallower folder', () => {
      const old = note('/wiki/a/b/Note.md');
      const text = 'Link to [[Note]]';
      const source = note('/wiki/a/b/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = note('/wiki/Note.md');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[../../Note]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/b/Src.md', '/wiki/a/b/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });

    it('writes a relative path with ../ when the note moves into a sibling folder', () => {
      const old = note('/wiki/a/Note.md');
      const text = 'Link to [[Note]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = note('/wiki/b/Note.md');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[../b/Note]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/a/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });

    it('keeps a root-relative link root-relative', () => {
      const old = note('/wiki/a/Note.md');
      const text = 'Link to [[/a/Note]]';
      const source = note('/wiki/x/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = note('/wiki/b/Note.md');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[/b/Note]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/x/Src.md', '/wiki/x/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });

    it('keeps the alias first and the section of the link', () => {
      const old = note('/wiki/a/Note.md', '# Sec\n\nContent');
      const text = 'Link to [[Text|Note#sec]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = note('/wiki/b/Note.md', '# Sec\n\nContent');

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[Text|../b/Note#sec]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/a/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri.with({ fragment: 'sec' }));
    });

    it('keeps the image properties and the extension of an image link', () => {
      const old = createTestNote({ uri: '/wiki/a/img.png', type: 'image' });
      const text = 'Image [[img.png|frame|align=center]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(old, source);
      const moved = createTestNote({ uri: '/wiki/b/img.png', type: 'image' });

      const edits = computeWikilinkRenameEdits(
        workspace,
        graph,
        old.uri,
        moved.uri
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual(
        '[[../b/img.png|frame|align=center]]'
      );
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/a/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });
  });

  describe('computeDirectoryWikilinkRenameEdits with Gollum syntax', () => {
    it('updates links from notes inside and outside the renamed folder', () => {
      const target = note('/wiki/a/Note.md');
      const siblingText = 'Link to [[Note]]';
      const sibling = note('/wiki/a/Sib.md', siblingText);
      const atRootText = 'Link to [[a/Note]]';
      const atRoot = note('/wiki/Out.md', atRootText);
      const elsewhereText = 'Link to [[../a/Note]]';
      const elsewhere = note('/wiki/o/Other.md', elsewhereText);
      const { workspace, graph } = createWikiAndGraph(
        target,
        sibling,
        atRoot,
        elsewhere
      );
      const moved = note('/wiki/b/c/Note.md');

      const edits = computeDirectoryWikilinkRenameEdits(
        workspace,
        graph,
        URI.file('/wiki/a'),
        URI.file('/wiki/b/c')
      );

      const newTextFor = (path: string) =>
        edits.filter(e => e.uri.path === path).map(e => e.edit.newText);
      expect(edits).toHaveLength(3);
      expect(newTextFor('/wiki/a/Sib.md')).toEqual(['[[Note]]']);
      expect(newTextFor('/wiki/Out.md')).toEqual(['[[b/c/Note]]']);
      expect(newTextFor('/wiki/o/Other.md')).toEqual(['[[../b/c/Note]]']);

      expect(
        resolveAfterRename(
          edits,
          siblingText,
          '/wiki/a/Sib.md',
          '/wiki/b/c/Sib.md',
          [moved]
        )
      ).toEqual(moved.uri);
      expect(
        resolveAfterRename(edits, atRootText, '/wiki/Out.md', '/wiki/Out.md', [
          moved,
        ])
      ).toEqual(moved.uri);
      expect(
        resolveAfterRename(
          edits,
          elsewhereText,
          '/wiki/o/Other.md',
          '/wiki/o/Other.md',
          [moved]
        )
      ).toEqual(moved.uri);
    });

    it('keeps a working relative link between notes moved together into a deeper folder', () => {
      const target = note('/wiki/a/sub/Note.md');
      const text = 'Link to [[sub/Note]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(target, source);
      const moved = note('/wiki/x/y/sub/Note.md');

      const edits = computeDirectoryWikilinkRenameEdits(
        workspace,
        graph,
        URI.file('/wiki/a'),
        URI.file('/wiki/x/y')
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[sub/Note]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/x/y/Src.md', [
          moved,
        ])
      ).toEqual(moved.uri);
    });

    it('keeps the alias first and the section of the link', () => {
      const target = note('/wiki/a/Note.md', '# Sec\n\nContent');
      const text = 'Link to [[Text|a/Note#sec]]';
      const source = note('/wiki/Out.md', text);
      const { workspace, graph } = createWikiAndGraph(target, source);
      const moved = note('/wiki/b/Note.md', '# Sec\n\nContent');

      const edits = computeDirectoryWikilinkRenameEdits(
        workspace,
        graph,
        URI.file('/wiki/a'),
        URI.file('/wiki/b')
      );

      expect(edits).toHaveLength(1);
      expect(edits[0].edit.newText).toEqual('[[Text|b/Note#sec]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/Out.md', '/wiki/Out.md', [
          moved,
        ])
      ).toEqual(moved.uri.with({ fragment: 'sec' }));
    });

    it('rewrites the relative links of a moved note to the notes that stay put', () => {
      const stays = note('/wiki/Top.md');
      const text = 'Up to [[Alias|../Top]] and [[/Top]]';
      const source = note('/wiki/a/Src.md', text);
      const { workspace, graph } = createWikiAndGraph(stays, source);

      const edits = computeDirectoryWikilinkRenameEdits(
        workspace,
        graph,
        URI.file('/wiki/a'),
        URI.file('/wiki/x/y')
      );

      // The link from the wiki root keeps working as it is
      expect(edits).toHaveLength(1);
      expect(edits[0].uri).toEqual(source.uri);
      expect(edits[0].edit.newText).toEqual('[[Alias|../../Top]]');
      expect(
        resolveAfterRename(edits, text, '/wiki/a/Src.md', '/wiki/x/y/Src.md', [
          stays,
        ])
      ).toEqual(stays.uri);
    });

    it('leaves the relative links of a note renamed within its folder alone', () => {
      const stays = note('/wiki/Top.md');
      const source = note('/wiki/a/Src.md', 'Up to [[../Top]]');
      const { workspace, graph } = createWikiAndGraph(stays, source);

      expect(
        computeDirectoryWikilinkRenameEdits(
          workspace,
          graph,
          URI.file('/wiki/a'),
          URI.file('/wiki/b')
        )
      ).toEqual([]);
    });
  });
});
