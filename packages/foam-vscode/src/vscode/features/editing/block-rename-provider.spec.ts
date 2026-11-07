/* @unit-ready */
import * as vscode from 'vscode';
import { createMarkdownParser } from '@foam/core';
import { FoamGraph } from '@foam/core';
import { URI } from '@foam/core';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  deleteFile,
  GOLLUM_SYNTAX,
  showInEditor,
  MEDIAWIKI_SYNTAX,
  useFoamConfiguration,
} from '../../../test/test-utils-vscode';
import { createTestWorkspace } from '../../../test/test-utils';
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { BlockRenameProvider } from './block-rename-provider';

const parser = createMarkdownParser([]);

const buildFoamLike = (ws: ReturnType<typeof createTestWorkspace>) => ({
  workspace: ws,
  graph: FoamGraph.fromWorkspace(ws),
  dispose: () => {},
});

describe('BlockRenameProvider', () => {
  useFoamConfiguration(MEDIAWIKI_SYNTAX);

  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  describe('prepareRename', () => {
    it('should return the block id range and placeholder when cursor is on a block anchor line', async () => {
      const fileA = await createFile('A paragraph ^myblock\n');

      const ws = createTestWorkspace().set(
        parser.parse(fileA.uri, fileA.content)
      );
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      const result = (await provider.prepareRename(
        doc,
        new vscode.Position(0, 'A paragraph ^m'.length), // cursor on the anchor id
        new vscode.CancellationTokenSource().token
      )) as { range: vscode.Range; placeholder: string };

      expect(result.placeholder).toBe('myblock');
      // range should cover just the id (after '^'), not the '^' itself
      const caretCol = 'A paragraph ^'.length;
      expect(result.range.start.character).toBe(caretCol);
      expect(result.range.end.character).toBe(caretCol + 'myblock'.length);
    });

    it('should throw when cursor is not on a block anchor line', async () => {
      const fileA = await createFile('Just a regular paragraph\n');

      const ws = createTestWorkspace().set(
        parser.parse(fileA.uri, fileA.content)
      );
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      await expect(
        provider.prepareRename(
          doc,
          new vscode.Position(0, 0),
          new vscode.CancellationTokenSource().token
        )
      ).rejects.toThrow('Cannot rename: cursor is not on a block anchor');
    });

    it('should throw when the anchor does not match a known block in the workspace', async () => {
      // File not parsed into workspace — anchor exists in text but not in model
      const fileA = await createFile('Some text ^unknownblock\n');

      const ws = createTestWorkspace(); // intentionally not adding fileA
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      await expect(
        provider.prepareRename(
          doc,
          new vscode.Position(0, 0),
          new vscode.CancellationTokenSource().token
        )
      ).rejects.toThrow('Cannot rename: cursor is not on a block anchor');
    });
  });

  describe('provideRenameEdits', () => {
    it('should update the block anchor text and all wikilinks referencing it', async () => {
      const fileA = await createFile('A paragraph ^oldblock\n');
      const fileB = await createFile(
        `See [[${fileA.name}#^oldblock]] for more.\n`
      );

      const ws = createTestWorkspace()
        .set(parser.parse(fileA.uri, fileA.content))
        .set(parser.parse(fileB.uri, fileB.content));
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      const edits = await provider.provideRenameEdits(
        doc,
        new vscode.Position(0, 15),
        'newblock',
        new vscode.CancellationTokenSource().token
      );

      expect(edits).toBeDefined();

      // The anchor text edit on fileA: 'oldblock' → 'newblock'
      const fileAEdits = edits.get(toVsCodeUri(fileA.uri));
      expect(fileAEdits).toHaveLength(1);
      expect(fileAEdits[0].newText).toBe('newblock');

      // The wikilink update on fileB
      const fileBEdits = edits.get(toVsCodeUri(fileB.uri));
      expect(fileBEdits).toHaveLength(1);
      expect(fileBEdits[0].newText).toContain('^newblock');
      expect(fileBEdits[0].newText).not.toContain('^oldblock');
    });

    it('should update self-referencing block links within the same file', async () => {
      const fileA = await createFile(
        'A paragraph ^myblock\n\nJump to [[#^myblock]].\n'
      );

      const ws = createTestWorkspace().set(
        parser.parse(fileA.uri, fileA.content)
      );
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      const edits = await provider.provideRenameEdits(
        doc,
        new vscode.Position(0, 15),
        'renamed',
        new vscode.CancellationTokenSource().token
      );

      const fileAEdits = edits.get(toVsCodeUri(fileA.uri));
      // One edit for anchor text, one for the self-referencing link
      expect(fileAEdits).toHaveLength(2);
      const newTexts = fileAEdits.map(e => e.newText);
      expect(newTexts).toContain('renamed');
      expect(newTexts.some(t => t.includes('[[#^renamed]]'))).toBe(true);
    });

    it('should not update links that reference a different block', async () => {
      const fileA = await createFile('Para one ^block1\n\nPara two ^block2\n');
      const fileB = await createFile(`[[${fileA.name}#^block2]]\n`);

      const ws = createTestWorkspace()
        .set(parser.parse(fileA.uri, fileA.content))
        .set(parser.parse(fileB.uri, fileB.content));
      const foam = buildFoamLike(ws);
      const provider = new BlockRenameProvider(foam as any);

      const { doc } = await showInEditor(fileA.uri);
      const edits = await provider.provideRenameEdits(
        doc,
        new vscode.Position(0, 12),
        'renamed',
        new vscode.CancellationTokenSource().token
      );

      // Only fileA anchor edit — fileB's link points to block2
      const fileAEdits = edits.get(toVsCodeUri(fileA.uri));
      expect(fileAEdits).toHaveLength(1);
      expect(fileAEdits[0].newText).toBe('renamed');

      const fileBEdits = edits.get(toVsCodeUri(fileB.uri));
      expect(fileBEdits ?? []).toHaveLength(0);
    });
  });
});

describe('BlockRenameProvider with Gollum syntax', () => {
  useFoamConfiguration(GOLLUM_SYNTAX);

  /**
   * Renames block `^oldblock`, on the first line of `page`, to `^newblock`
   * in a workspace holding the given files, and returns the edits.
   */
  const renameOldBlock = async (
    page: { uri: URI; content: string },
    ...others: { uri: URI; content: string }[]
  ) => {
    const root = fromVsCodeUri(vscode.workspace.workspaceFolders[0].uri);
    const ws = createTestWorkspace([root]);
    for (const file of [page, ...others]) {
      ws.set(parser.parse(file.uri, file.content));
    }
    const provider = new BlockRenameProvider(buildFoamLike(ws) as any);
    const { doc } = await showInEditor(page.uri);
    return provider.provideRenameEdits(
      doc,
      new vscode.Position(0, 'A paragraph ^old'.length),
      'newblock',
      new vscode.CancellationTokenSource().token
    );
  };

  it('should keep the alias before the target of a block link', async () => {
    await closeEditors();
    const page = await createFile('A paragraph ^oldblock\n', [
      'block-rename-gollum',
      'Page.md',
    ]);
    const linking = await createFile(
      'See [[The block|Page#^oldblock]] for more.\n',
      ['block-rename-gollum', 'linking.md']
    );

    const edits = await renameOldBlock(page, linking);

    expect(edits.get(toVsCodeUri(page.uri)).map(e => e.newText)).toEqual([
      'newblock',
    ]);
    expect(
      (edits.get(toVsCodeUri(linking.uri)) ?? []).map(e => e.newText)
    ).toEqual(['[[The block|Page#^newblock]]']);

    await closeEditors();
    await deleteFile(page.uri);
    await deleteFile(linking.uri);
  });

  it('should keep the ../ prefix of an aliased block link from a subfolder', async () => {
    await closeEditors();
    const page = await createFile('A paragraph ^oldblock\n', [
      'block-rename-gollum',
      'Page.md',
    ]);
    const linking = await createFile(
      'See [[Up there|../Page#^oldblock]] for more.\n',
      ['block-rename-gollum', 'sub', 'linking.md']
    );

    const edits = await renameOldBlock(page, linking);

    expect(
      (edits.get(toVsCodeUri(linking.uri)) ?? []).map(e => e.newText)
    ).toEqual(['[[Up there|../Page#^newblock]]']);

    await closeEditors();
    await deleteFile(page.uri);
    await deleteFile(linking.uri);
  });

  it('should update an aliased link to a block of the same page', async () => {
    await closeEditors();
    const page = await createFile(
      'A paragraph ^oldblock\n\nJump to [[the block|#^oldblock]].\n',
      ['block-rename-gollum', 'Page.md']
    );

    const edits = await renameOldBlock(page);

    expect(
      edits
        .get(toVsCodeUri(page.uri))
        .map(e => e.newText)
        .sort()
    ).toEqual(['[[the block|#^newblock]]', 'newblock']);

    await closeEditors();
    await deleteFile(page.uri);
  });

  it('should not update an aliased link to a same-named page in another folder', async () => {
    await closeEditors();
    const page = await createFile('A paragraph ^oldblock\n', [
      'block-rename-gollum',
      'Page.md',
    ]);
    const linking = await createFile(
      'See [[The block|Page#^oldblock]] for more.\n',
      ['block-rename-gollum', 'other', 'linking.md']
    );

    const edits = await renameOldBlock(page, linking);

    expect(edits.get(toVsCodeUri(linking.uri)) ?? []).toHaveLength(0);

    await closeEditors();
    await deleteFile(page.uri);
    await deleteFile(linking.uri);
  });
});
