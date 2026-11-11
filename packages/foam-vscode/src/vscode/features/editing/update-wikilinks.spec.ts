/* @unit-ready */

import * as vscode from 'vscode';
import {
  LINK_REFERENCE_DEFINITION_FOOTER,
  LINK_REFERENCE_DEFINITION_HEADER,
  URI,
} from '@foam/core';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  getFoamFromVSCode,
  GOLLUM_SYNTAX,
  showInEditor,
  useFoamConfiguration,
  waitForNoteInFoamWorkspace,
  withModifiedFoamConfiguration,
} from '../../../test/test-utils-vscode';
import { toVsCodeUri } from '../../utils/vsc-utils';
import { WikilinkReferenceCodeLensProvider } from './update-wikilinks';

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

describe('Wikilink definitions and the active text editor', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  /** A note holding a definitions block, with the given line endings */
  const noteWithDefinitions = (eol: string) =>
    [
      '[[doc1]]',
      '',
      LINK_REFERENCE_DEFINITION_HEADER,
      '[doc1]: doc1 "First"',
      LINK_REFERENCE_DEFINITION_FOOTER,
      '',
    ].join(eol);

  /** Asks the provider for the lenses of a note that is not shown in an editor */
  const provideLenses = async (uri: URI) => {
    const foam = await getFoamFromVSCode();
    const provider = new WikilinkReferenceCodeLensProvider(
      foam.workspace,
      foam.services.parser
    );
    const document = await vscode.workspace.openTextDocument(toVsCodeUri(uri));
    return provider.provideCodeLenses(
      document,
      new vscode.CancellationTokenSource().token
    );
  };

  it('provides the code lens when no text editor is active (FOAM-FOR-GOLLUM-9)', async () => {
    const source = await createFile(noteWithDefinitions('\n'));
    await waitForNoteInFoamWorkspace(source.uri);
    expect(vscode.window.activeTextEditor).toBeUndefined();

    const lenses = await provideLenses(source.uri);

    expect(lenses).toHaveLength(1);
    expect(lenses[0].command.title).toMatch(/^Wikilink definitions \(/);
  });

  it("reads a note's definitions with its own line endings, not the active editor's", async () => {
    const active = await createFile('# Active\n', ['active.md']);
    const source = await createFile(noteWithDefinitions('\r\n'));
    await waitForNoteInFoamWorkspace(active.uri);
    await waitForNoteInFoamWorkspace(source.uri);
    await showInEditor(active.uri);

    const lenses = await provideLenses(source.uri);

    expect(lenses).toHaveLength(1);
  });

  it('does nothing when the command runs with no text editor active', async () => {
    expect(vscode.window.activeTextEditor).toBeUndefined();

    await vscode.commands.executeCommand(
      'foam-vscode.update-wikilink-definitions'
    );
  });
});
