/* @unit-ready */

import * as vscode from 'vscode';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  GOLLUM_SYNTAX,
  showInEditor,
  useFoamConfiguration,
  waitForNoteInFoamWorkspace,
  withModifiedFoamConfiguration,
} from '../../../test/test-utils-vscode';

describe('Update wikilink definitions', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  it('appends a new definition without adding a blank line to the definition block', async () => {
    const doc1 = await createFile('# First', ['doc1.md']);
    const doc2 = await createFile('# Second', ['doc2.md']);
    const doc3 = await createFile('# Third', ['doc3.md']);
    const source = await createFile(`[[doc1]] [[doc2]] [[doc3]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`);

    await waitForNoteInFoamWorkspace(doc1.uri);
    await waitForNoteInFoamWorkspace(doc2.uri);
    await waitForNoteInFoamWorkspace(doc3.uri);
    await waitForNoteInFoamWorkspace(source.uri);
    const { editor } = await showInEditor(source.uri);

    await withModifiedFoamConfiguration(
      'edit.linkReferenceDefinitions',
      'withoutExtensions',
      async () => {
        await vscode.commands.executeCommand(
          'foam-vscode.update-wikilink-definitions'
        );
      }
    );

    expect(editor.document.getText()).toBe(`[[doc1]] [[doc2]] [[doc3]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
[doc3]: doc3 "Third"
`);
  });
});

describe('Update wikilink definitions with Gollum syntax', () => {
  useFoamConfiguration(GOLLUM_SYNTAX);

  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  /** Runs the command on `source` and returns its text afterwards */
  const updateDefinitions = async (
    source: Awaited<ReturnType<typeof createFile>>
  ) => {
    await waitForNoteInFoamWorkspace(source.uri);
    const { editor } = await showInEditor(source.uri);
    await withModifiedFoamConfiguration(
      'edit.linkReferenceDefinitions',
      'withoutExtensions',
      async () => {
        await vscode.commands.executeCommand(
          'foam-vscode.update-wikilink-definitions'
        );
      }
    );
    return editor.document.getText();
  };

  it('labels the definition with the alias-first link text', async () => {
    const page = await createFile('# Sub Page', ['sub', 'page.md']);
    await waitForNoteInFoamWorkspace(page.uri);
    const source = await createFile('[[My Alias|sub/page]]\n');

    expect(await updateDefinitions(source)).toBe(`[[My Alias|sub/page]]

[My Alias|sub/page]: sub/page "Sub Page"
`);
  });

  it('points the definition at the note next to the linking note, or from the root for a leading slash', async () => {
    const folderPage = await createFile('# Folder Page', ['folder', 'defs-page.md']);
    const rootPage = await createFile('# Root Page', ['defs-page.md']);
    await waitForNoteInFoamWorkspace(folderPage.uri);
    await waitForNoteInFoamWorkspace(rootPage.uri);
    const source = await createFile('[[defs-page]] [[/defs-page]]\n', [
      'folder',
      'source.md',
    ]);

    expect(await updateDefinitions(source)).toBe(`[[defs-page]] [[/defs-page]]

[defs-page]: defs-page "Folder Page"
[/defs-page]: ../defs-page "Root Page"
`);
  });

  it('adds no definition for a link to a missing note next to the linking note', async () => {
    const rootPage = await createFile('# Root Page', ['defs-page.md']);
    await waitForNoteInFoamWorkspace(rootPage.uri);
    const source = await createFile('[[defs-page]]\n', ['folder', 'source.md']);

    expect(await updateDefinitions(source)).toBe('[[defs-page]]\n');
  });
});
