/* @unit-ready */

import * as vscode from 'vscode';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  showInEditor,
  waitForNoteInFoamWorkspace,
  GOLLUM_SYNTAX,
  MEDIAWIKI_SYNTAX,
  useFoamConfiguration,
} from '../../../test/test-utils-vscode';
import { deleteFile } from '../../services/editor';
import { Logger } from '@foam/core';
import {
  CONVERT_WIKILINK_TO_MDLINK,
  CONVERT_MDLINK_TO_WIKILINK,
} from './convert-links';

Logger.setLevel('error');

describe('Link Conversion Commands', () => {
  useFoamConfiguration(MEDIAWIKI_SYNTAX);

  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  describe('foam-vscode.convert-wikilink-to-markdown', () => {
    it('should convert wikilink to markdown link', async () => {
      const noteA = await createFile('# Note A', ['note-a.md']);
      const { uri } = await createFile('Text before [[note-a]] text after');
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(noteA.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);

      const result = editor.document.getText();
      expect(result).toBe('Text before [Note A](note-a.md) text after');

      await deleteFile(noteA.uri);
      await deleteFile(uri);
    });

    it('should position cursor at end of converted text', async () => {
      const noteA = await createFile('# Note A', ['note-a.md']);
      const { uri } = await createFile('Text before [[note-a]] text after');
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(noteA.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);

      // Cursor should be at the end of the converted markdown link
      const expectedPosition = 'Text before [Note A](note-a.md)'.length;
      expect(editor.selection.active).toEqual(
        new vscode.Position(0, expectedPosition)
      );

      await deleteFile(noteA.uri);
      await deleteFile(uri);
    });

    it('should use title#section as alias when wikilink has a section', async () => {
      const noteA = await createFile('# Note A\n## Introduction', ['note-a.md']);
      const { uri } = await createFile(
        'Text before [[note-a#Introduction]] text after'
      );
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(noteA.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);

      const result = editor.document.getText();
      expect(result).toBe(
        'Text before [Note A#Introduction](note-a.md#Introduction) text after'
      );

      await deleteFile(noteA.uri);
      await deleteFile(uri);
    });

    it('should convert a directory wikilink to its resolved index file', async () => {
      const readme = await createFile('# My Folder Index', [
        'my-folder',
        'README.md',
      ]);
      const { uri } = await createFile('Text before [[my-folder]] text after');
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(readme.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);

      const result = editor.document.getText();
      expect(result).toBe(
        'Text before [My Folder Index](my-folder/README.md) text after'
      );

      await deleteFile(readme.uri);
      await deleteFile(uri);
    });

    it('should show info message when no wikilink at cursor', async () => {
      const { uri } = await createFile('Text with no wikilinks');
      const { editor } = await showInEditor(uri);

      editor.selection = new vscode.Selection(0, 5, 0, 5);

      const showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage');

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);

      expect(showInfoSpy).toHaveBeenCalledWith(
        'No wikilink found at cursor position'
      );

      showInfoSpy.mockRestore();
      await deleteFile(uri);
    });

    it('should show error when resource not found', async () => {
      const { uri } = await createFile(
        'Text before [[nonexistent-file]] text after'
      );
      const { editor } = await showInEditor(uri);

      editor.selection = new vscode.Selection(0, 20, 0, 20);

      const showErrorSpy = vi
        .spyOn(vscode.window, 'showErrorMessage')
        .mockResolvedValue(undefined);

      Logger.setLevel('off');
      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);
      Logger.setLevel('error');

      expect(showErrorSpy).toHaveBeenCalled();

      showErrorSpy.mockRestore();
      await deleteFile(uri);
    });
  });

  describe('foam-vscode.convert-markdown-to-wikilink', () => {
    it('should convert markdown link to wikilink', async () => {
      const noteA = await createFile('# Note A', ['note-a.md']);
      const { uri } = await createFile(
        'Text before [Note A](note-a.md) text after'
      );
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(noteA.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_MDLINK_TO_WIKILINK.command);

      const result = editor.document.getText();
      expect(result).toBe('Text before [[note-a]] text after');

      await deleteFile(uri);
      await deleteFile(noteA.uri);
    });

    it('should position cursor at end of converted text', async () => {
      const noteA = await createFile('# Note A', ['note-a.md']);
      const { uri } = await createFile(
        'Text before [Note A](note-a.md) text after'
      );
      const { editor } = await showInEditor(uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);
      await waitForNoteInFoamWorkspace(noteA.uri);

      await vscode.commands.executeCommand(CONVERT_MDLINK_TO_WIKILINK.command);

      // Cursor should be at the end of the converted wikilink
      const expectedPosition = 'Text before [[note-a]]'.length;
      expect(editor.document.getText()).toBe(
        'Text before [[note-a]] text after'
      );
      expect(editor.selection.active).toEqual(
        new vscode.Position(0, expectedPosition)
      );

      await deleteFile(uri);
      await deleteFile(noteA.uri);
    });

    it('should drop alias when it equals title#section default', async () => {
      const noteA = await createFile('# Note A', ['note-a.md']);
      const { uri } = await createFile(
        'Text before [Note A#Introduction](note-a.md#Introduction) text after'
      );
      const { editor } = await showInEditor(uri);
      await waitForNoteInFoamWorkspace(noteA.uri);

      editor.selection = new vscode.Selection(0, 15, 0, 15);

      await vscode.commands.executeCommand(CONVERT_MDLINK_TO_WIKILINK.command);

      const result = editor.document.getText();
      expect(result).toBe('Text before [[note-a#Introduction]] text after');

      await deleteFile(uri);
      await deleteFile(noteA.uri);
    });

    it('should show info message when no markdown link at cursor', async () => {
      const { uri } = await createFile('Text with no markdown links');
      const { editor } = await showInEditor(uri);

      editor.selection = new vscode.Selection(0, 5, 0, 5);

      const showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage');

      await vscode.commands.executeCommand(CONVERT_MDLINK_TO_WIKILINK.command);

      expect(showInfoSpy).toHaveBeenCalledWith(
        'No markdown link found at cursor position'
      );

      showInfoSpy.mockRestore();
      await deleteFile(uri);
    });
  });

  describe('Command registration', () => {
    it('should handle no active editor gracefully', async () => {
      await closeEditors();

      await vscode.commands.executeCommand(CONVERT_WIKILINK_TO_MDLINK.command);
      await vscode.commands.executeCommand(CONVERT_MDLINK_TO_WIKILINK.command);

      expect(true).toBe(true);
    });
  });
});

describe('Link Conversion Commands with Gollum syntax', () => {
  useFoamConfiguration(GOLLUM_SYNTAX);

  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  /** Runs `command` with the cursor inside the link of a new note's text */
  const convertAt = async (
    command: string,
    text: string,
    filepath: string[] = []
  ) => {
    const { uri } = await createFile(text, filepath);
    const { editor } = await showInEditor(uri);
    editor.selection = new vscode.Selection(0, 15, 0, 15);
    await vscode.commands.executeCommand(command);
    const result = editor.document.getText();
    await deleteFile(uri);
    return result;
  };

  describe('foam-vscode.convert-wikilink-to-markdown', () => {
    it('should keep the alias as the link text', async () => {
      const note = await createFile('# Note Title', ['note.md']);
      await waitForNoteInFoamWorkspace(note.uri);

      expect(
        await convertAt(
          CONVERT_WIKILINK_TO_MDLINK.command,
          'Text before [[Alias|note]] text after'
        )
      ).toBe('Text before [Alias](note.md) text after');

      await deleteFile(note.uri);
    });

    it('should turn a link from the root into a path relative to the note', async () => {
      const note = await createFile('# Sub Note', ['sub', 'note.md']);
      await waitForNoteInFoamWorkspace(note.uri);

      expect(
        await convertAt(
          CONVERT_WIKILINK_TO_MDLINK.command,
          'Text before [[/sub/note]] text after'
        )
      ).toBe('Text before [Sub Note](sub/note.md) text after');

      await deleteFile(note.uri);
    });

    it('should show an error instead of converting a link to a directory', async () => {
      const index = await createFile('# Folder Index', ['folder', 'index.md']);
      await waitForNoteInFoamWorkspace(index.uri);
      const showErrorSpy = vi
        .spyOn(vscode.window, 'showErrorMessage')
        .mockResolvedValue(undefined);

      Logger.setLevel('off');
      const text = 'Text before [[folder]] text after';
      const result = await convertAt(CONVERT_WIKILINK_TO_MDLINK.command, text);
      Logger.setLevel('error');

      expect(result).toBe(text);
      expect(showErrorSpy).toHaveBeenCalled();

      showErrorSpy.mockRestore();
      await deleteFile(index.uri);
    });

    it('should show an error, not a TypeError, for a link that climbs above the root', async () => {
      const showErrorSpy = vi
        .spyOn(vscode.window, 'showErrorMessage')
        .mockResolvedValue(undefined);

      Logger.setLevel('off');
      const text = 'Text before [[../../..]] text after';
      const result = await convertAt(CONVERT_WIKILINK_TO_MDLINK.command, text);
      Logger.setLevel('error');

      expect(result).toBe(text);
      expect(showErrorSpy).toHaveBeenCalledTimes(1);
      expect(String(showErrorSpy.mock.calls[0][0])).not.toMatch(
        /Cannot read propert/
      );

      showErrorSpy.mockRestore();
    });
  });

  describe('foam-vscode.convert-markdown-to-wikilink', () => {
    it('should put an alias that differs from the note before its path', async () => {
      const note = await createFile('# Sub Note', ['sub', 'note.md']);
      await waitForNoteInFoamWorkspace(note.uri);

      expect(
        await convertAt(
          CONVERT_MDLINK_TO_WIKILINK.command,
          'Text before [Alias](sub/note.md) text after'
        )
      ).toBe('Text before [[Alias|sub/note]] text after');

      await deleteFile(note.uri);
    });

    it('should drop link text that equals the title, the file name or the path', async () => {
      const note = await createFile('# Sub Note', ['sub', 'note.md']);
      await waitForNoteInFoamWorkspace(note.uri);

      for (const linkText of ['Sub Note', 'note', 'sub/note']) {
        expect(
          await convertAt(
            CONVERT_MDLINK_TO_WIKILINK.command,
            `Text before [${linkText}](sub/note.md) text after`
          )
        ).toBe('Text before [[sub/note]] text after');
      }

      await deleteFile(note.uri);
    });

    it('should use the path relative to the note directory', async () => {
      const note = await createFile('# Other Note', ['other', 'note.md']);
      await waitForNoteInFoamWorkspace(note.uri);

      expect(
        await convertAt(
          CONVERT_MDLINK_TO_WIKILINK.command,
          'Text before [Alias](../other/note.md) text after',
          ['source', 'source-note.md']
        )
      ).toBe('Text before [[Alias|../other/note]] text after');

      await deleteFile(note.uri);
    });
  });
});
