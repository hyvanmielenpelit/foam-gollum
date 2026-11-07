import * as vscode from 'vscode';
import { createMarkdownParser } from '@foam/core';
import { FoamTags } from '@foam/core';
import { URI } from '@foam/core';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  getFoamFromVSCode,
  showInEditor,
  waitForNoteInFoamWorkspace,
} from '../../../test/test-utils-vscode';
import { createTestWorkspace, waitForExpect } from '../../../test/test-utils';
import { toVsCodeUri } from '../../utils/vsc-utils';
import { RENAME_TAG_COMMAND } from './rename-tag';
import { TagRenameProvider } from './tag-rename-provider';

/** The text of the note, including edits not yet saved */
const textOf = async (uri: URI) =>
  (await vscode.workspace.openTextDocument(toVsCodeUri(uri))).getText();

/** Saves the edits made to the notes, so that they can be deleted */
const saveAll = async (...uris: URI[]) => {
  for (const uri of uris) {
    await (await vscode.workspace.openTextDocument(toVsCodeUri(uri))).save();
  }
};

/** Waits until the running Foam knows `count` occurrences of `tag` */
const waitForTag = async (tag: string, count: number) => {
  const foam = await getFoamFromVSCode();
  await waitForExpect(() => {
    expect(foam.tags.tags.get(tag)?.length).toEqual(count);
  });
};

describe('rename-tag command', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await closeEditors();
    await cleanWorkspace();
  });

  it('renames the given tag in every note that has it', async () => {
    const noteA = await createFile('# Note A\n\nSome text #rename-spec-old.\n');
    const noteB = await createFile('# Note B\n\n#rename-spec-old at the start\n');
    await waitForNoteInFoamWorkspace(noteA.uri);
    await waitForNoteInFoamWorkspace(noteB.uri);
    await waitForTag('rename-spec-old', 2);
    const info = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined);

    try {
      await vscode.commands.executeCommand(
        RENAME_TAG_COMMAND.command,
        'rename-spec-old',
        'rename-spec-new'
      );

      expect(await textOf(noteA.uri)).toEqual(
        '# Note A\n\nSome text #rename-spec-new.\n'
      );
      expect(await textOf(noteB.uri)).toEqual(
        '# Note B\n\n#rename-spec-new at the start\n'
      );
      expect(info).toHaveBeenCalledWith(
        'Renamed tag "rename-spec-old" to "rename-spec-new" (2 occurrences across 2 files)'
      );
    } finally {
      info.mockRestore();
      await saveAll(noteA.uri, noteB.uri);
    }
  });

  it('renames the tag under the cursor to the name typed in', async () => {
    const note = await createFile('# Note\n\nSome text #cursor-spec-old.\n');
    await waitForNoteInFoamWorkspace(note.uri);
    await waitForTag('cursor-spec-old', 1);
    const { editor } = await showInEditor(note.uri);
    editor.selection = new vscode.Selection(2, 13, 2, 13);
    const input = vi
      .spyOn(vscode.window, 'showInputBox')
      .mockResolvedValue('#cursor-spec-new');
    const info = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined);

    try {
      await vscode.commands.executeCommand(RENAME_TAG_COMMAND.command);

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'cursor-spec-old' })
      );
      expect(editor.document.getText()).toEqual(
        '# Note\n\nSome text #cursor-spec-new.\n'
      );
    } finally {
      input.mockRestore();
      info.mockRestore();
      await saveAll(note.uri);
    }
  });

  it('asks before merging into an existing tag, and changes nothing when declined', async () => {
    const text = '# Note\n\n#merge-spec-a and #merge-spec-b\n';
    const note = await createFile(text);
    await waitForNoteInFoamWorkspace(note.uri);
    await waitForTag('merge-spec-a', 1);
    await waitForTag('merge-spec-b', 1);
    const warning = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue(undefined);
    const error = vi
      .spyOn(vscode.window, 'showErrorMessage')
      .mockResolvedValue(undefined);

    try {
      await vscode.commands.executeCommand(
        RENAME_TAG_COMMAND.command,
        'merge-spec-a',
        'merge-spec-b'
      );

      expect(String(warning.mock.calls[0][0])).toMatch(
        /^Tag "merge-spec-b" already exists/
      );
      expect(error).toHaveBeenCalledWith(
        'Failed to rename tag: Tag merge cancelled by user'
      );
      expect(await textOf(note.uri)).toEqual(text);
    } finally {
      warning.mockRestore();
      error.mockRestore();
    }
  });
});

describe('TagRenameProvider', () => {
  const parser = createMarkdownParser([]);
  const token = new vscode.CancellationTokenSource().token;

  /** A Foam-like object holding the given notes, for the provider */
  const foamWith = (...notes: { uri: URI; content: string }[]) => {
    const workspace = createTestWorkspace();
    for (const note of notes) {
      workspace.set(parser.parse(note.uri, note.content));
    }
    return { workspace, tags: FoamTags.fromWorkspace(workspace) } as any;
  };

  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await closeEditors();
    await cleanWorkspace();
  });

  it('prepares the rename with the range of the tag and its label', async () => {
    const note = await createFile('Some text #mytag here.\n');
    const provider = new TagRenameProvider(foamWith(note));

    const { doc } = await showInEditor(note.uri);
    const result = (await provider.prepareRename(
      doc,
      new vscode.Position(0, 12),
      token
    )) as { range: vscode.Range; placeholder: string };

    expect(result.placeholder).toEqual('mytag');
    expect(result.range.start.character).toEqual('Some text '.length);
    expect(result.range.end.character).toEqual('Some text #mytag'.length);
  });

  it('refuses to prepare a rename when the cursor is not on a tag', async () => {
    const note = await createFile('Some text #mytag here.\n');
    const provider = new TagRenameProvider(foamWith(note));

    const { doc } = await showInEditor(note.uri);

    expect(() =>
      provider.prepareRename(doc, new vscode.Position(0, 2), token)
    ).toThrow('Cannot rename: cursor is not on a tag');
  });

  it('renames the tag in every note, dropping a # typed before the new name', async () => {
    const noteA = await createFile('Some text #mytag here.\n');
    const noteB = await createFile('#mytag at the start\n');
    const provider = new TagRenameProvider(foamWith(noteA, noteB));

    const { doc } = await showInEditor(noteA.uri);
    const edits = (await provider.provideRenameEdits(
      doc,
      new vscode.Position(0, 12),
      '#newtag',
      token
    )) as vscode.WorkspaceEdit;

    expect(edits.get(toVsCodeUri(noteA.uri)).map(e => e.newText)).toEqual([
      '#newtag',
    ]);
    expect(edits.get(toVsCodeUri(noteB.uri)).map(e => e.newText)).toEqual([
      '#newtag',
    ]);
  });

  it('refuses to merge into an existing tag', async () => {
    const note = await createFile('#mytag and #othertag\n');
    const provider = new TagRenameProvider(foamWith(note));

    const { doc } = await showInEditor(note.uri);

    expect(() =>
      provider.provideRenameEdits(
        doc,
        new vscode.Position(0, 2),
        'othertag',
        token
      )
    ).toThrow(/^Tag "othertag" already exists/);
  });
});
