import * as vscode from 'vscode';
import waitForExpect from 'wait-for-expect';
import { URI } from '@foam/core';
import {
  closeEditors,
  createFile,
  deleteFile,
  getActiveTabViewType,
  MARKDOWN_EDITOR_VIEW_TYPE,
  showInEditor,
  waitForNoteInFoamWorkspace,
  withMarkdownEditorAssociation,
  MEDIAWIKI_SYNTAX,
  useFoamConfiguration,
  GOLLUM_SYNTAX,
} from '../../../test/test-utils-vscode';
import { getActiveTabUri } from '../../services/editor';

// Drives VS Code's own Go to Definition, which is what ctrl/cmd+click on a
// wikilink runs, so it needs the extension host and is not @unit-ready.
describe('Go to Definition on a wikilink', () => {
  useFoamConfiguration(MEDIAWIKI_SYNTAX);

  const openSourceLinkingTo = async (
    targetContent: string,
    name: string,
    linkText: string
  ) => {
    const target = await createFile(targetContent, [`${name}.md`]);
    const source = await createFile(`see [[${linkText}]] here`, [
      `${name}-source.md`,
    ]);
    await waitForNoteInFoamWorkspace(target.uri);
    await waitForNoteInFoamWorkspace(source.uri);
    const { editor } = await showInEditor(source.uri);
    // inside the wikilink, just past `see [[`
    editor.selection = new vscode.Selection(0, 7, 0, 7);
    return { target: target.uri, source: source.uri };
  };

  const goToDefinition = () =>
    vscode.commands.executeCommand('editor.action.revealDefinition');

  const cleanUp = async (...uris: URI[]) => {
    await closeEditors();
    for (const uri of uris) {
      await deleteFile(uri);
    }
  };

  it('opens the target in the editor associated with Markdown (#1742)', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target',
      'definition-associated',
      'definition-associated'
    );

    await withMarkdownEditorAssociation(async () => {
      await goToDefinition();

      await waitForExpect(() => {
        expect(getActiveTabViewType()).toEqual(MARKDOWN_EDITOR_VIEW_TYPE);
        expect(getActiveTabUri()?.path).toEqual(target.path);
      });
    });

    await cleanUp(target, source);
  });

  it('opens the target in the text editor when nothing is associated with Markdown (#1742)', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target',
      'definition-plain',
      'definition-plain'
    );

    await goToDefinition();

    await waitForExpect(() => {
      expect(getActiveTabViewType()).toBeUndefined();
      expect(vscode.window.activeTextEditor?.document.uri.path).toEqual(
        target.path
      );
    });

    await cleanUp(target, source);
  });

  it('lands on the section of a [[note#Section]] wikilink (#1742)', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target\n\n## Details\n\nsome text',
      'definition-section',
      'definition-section#Details'
    );

    await goToDefinition();

    await waitForExpect(() => {
      const editor = vscode.window.activeTextEditor;
      expect(editor?.document.uri.path).toEqual(target.path);
      expect(editor.selection.isEmpty).toBe(true);
      expect(editor.selection.active).toEqual(new vscode.Position(2, 0));
    });

    await cleanUp(target, source);
  });
});

describe('Go to Definition on a wikilink with Gollum syntax', () => {
  useFoamConfiguration(GOLLUM_SYNTAX);

  // Gollum links put the alias first and name a section by its slug.
  const openSourceLinkingTo = async (
    targetContent: string,
    targetName: string,
    linkText: string
  ) => {
    const target = await createFile(targetContent, [`${targetName}.md`]);
    const source = await createFile(`see [[${linkText}]] here`, [
      `${targetName}-source.md`,
    ]);
    await waitForNoteInFoamWorkspace(target.uri);
    await waitForNoteInFoamWorkspace(source.uri);
    const { editor } = await showInEditor(source.uri);
    // inside the wikilink, just past `see [[`
    editor.selection = new vscode.Selection(0, 7, 0, 7);
    return { target: target.uri, source: source.uri };
  };

  const goToDefinition = () =>
    vscode.commands.executeCommand('editor.action.revealDefinition');

  const cleanUp = async (...uris: URI[]) => {
    await closeEditors();
    for (const uri of uris) {
      await deleteFile(uri);
    }
  };

  it('lands on the section of a [[Page#section-slug]] wikilink', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target\n\n## Section 2\n\nsome text',
      'gollum-definition-section',
      'gollum-definition-section#section-2'
    );

    await goToDefinition();

    await waitForExpect(() => {
      const editor = vscode.window.activeTextEditor;
      expect(editor?.document.uri.path).toEqual(target.path);
      expect(editor.selection.isEmpty).toBe(true);
      expect(editor.selection.active).toEqual(new vscode.Position(2, 0));
    });

    await cleanUp(target, source);
  });

  it('opens the page of an alias-first [[Alias|Page]] wikilink', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target',
      'gollum-definition-alias',
      'Alias|gollum-definition-alias'
    );

    await goToDefinition();

    await waitForExpect(() => {
      expect(vscode.window.activeTextEditor?.document.uri.path).toEqual(
        target.path
      );
    });

    await cleanUp(target, source);
  });

  it('opens Page.md for a case-mismatched [[page]] wikilink', async () => {
    await closeEditors();
    const { target, source } = await openSourceLinkingTo(
      '# Target',
      'Gollum-Definition-Case',
      'gollum-definition-case'
    );

    await goToDefinition();

    await waitForExpect(() => {
      expect(vscode.window.activeTextEditor?.document.uri.path).toEqual(
        target.path
      );
    });

    await cleanUp(target, source);
  });
});
