/* @unit-ready */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CancellationTokenSource,
  DataTransfer,
  DataTransferItem,
  DocumentDropEdit,
  Position,
  SnippetString,
  Uri,
  workspace,
} from 'vscode';
import { randomString } from '../../../test/test-utils';
import { deleteFile } from '../../../test/test-utils-vscode';
import { fromVsCodeUri } from '../../utils/vsc-utils';
import { CustomMarkdownDropProvider } from './markdown-drop-provider';

// A valid 1x1 PNG image.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const workspaceRoot = () => workspace.workspaceFolders[0].uri.fsPath;

const listFilesRecursively = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap(entry =>
          entry.isDirectory()
            ? listFilesRecursively(path.join(dir, entry.name))
            : [path.join(dir, entry.name)]
        )
    : [];

const setUp = async (documentName: string) => {
  const folder = 'drop-' + randomString(5);
  const documentPath = path.join(workspaceRoot(), folder, documentName);
  fs.mkdirSync(path.dirname(documentPath), { recursive: true });
  fs.writeFileSync(documentPath, '# Document\n');
  const document = await workspace.openTextDocument(Uri.file(documentPath));

  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foam-drop-'));
  const tearDown = async () => {
    await deleteFile(fromVsCodeUri(Uri.file(path.join(workspaceRoot(), folder))));
    await deleteFile(
      fromVsCodeUri(Uri.file(path.join(workspaceRoot(), 'uploads', folder)))
    );
    fs.rmSync(outsideDir, { recursive: true, force: true });
  };
  return { folder, document, outsideDir, tearDown };
};

const dropFiles = (document, filePaths: string[]) => {
  const dataTransfer = new DataTransfer();
  dataTransfer.set(
    'text/uri-list',
    new DataTransferItem(
      filePaths.map(p => Uri.file(p).toString()).join('\r\n')
    )
  );
  return new CustomMarkdownDropProvider().provideDocumentDropEdits(
    document,
    new Position(0, 0),
    dataTransfer,
    new CancellationTokenSource().token
  ) as Promise<DocumentDropEdit | undefined>;
};

const insertedText = (edit: DocumentDropEdit) =>
  typeof edit.insertText === 'string'
    ? edit.insertText
    : (edit.insertText as SnippetString).value;

describe('CustomMarkdownDropProvider', () => {
  it('links to an upload folder named after the full dotted document name', async () => {
    const { folder, document, outsideDir, tearDown } = await setUp(
      'GnollHack vs. Pathos vs. NetHack.md'
    );
    try {
      const source = path.join(outsideDir, 'flag.v2.png');
      fs.writeFileSync(source, PNG_BYTES);

      const edit = await dropFiles(document, [source]);

      expect(insertedText(edit)).toEqual(
        '![${1:flag.v2}](' +
          encodeURI(
            `/uploads/${folder}/GnollHack vs. Pathos vs. NetHack/flag.v2.png`
          ) +
          ')'
      );
    } finally {
      await tearDown();
    }
  });

  it('writes no file while the edit is only being offered', async () => {
    const { folder, document, outsideDir, tearDown } = await setUp('Page.md');
    try {
      const source = path.join(outsideDir, 'picture.png');
      fs.writeFileSync(source, PNG_BYTES);

      await dropFiles(document, [source]);

      expect(
        listFilesRecursively(path.join(workspaceRoot(), 'uploads', folder))
      ).toEqual([]);
      expect(listFilesRecursively(outsideDir)).toEqual([source]);
    } finally {
      await tearDown();
    }
  });

  it('creates exactly one copy of the file when the edit is applied', async () => {
    const { folder, document, outsideDir, tearDown } = await setUp(
      'A vs. B.md'
    );
    try {
      const source = path.join(outsideDir, 'flag.v2.png');
      fs.writeFileSync(source, PNG_BYTES);

      const edit = await dropFiles(document, [source]);
      expect(await workspace.applyEdit(edit.additionalEdit)).toBe(true);

      const expectedTarget = path.join(
        workspaceRoot(),
        'uploads',
        folder,
        'A vs. B',
        'flag.v2.png'
      );
      expect(
        listFilesRecursively(path.join(workspaceRoot(), 'uploads', folder))
      ).toEqual([expectedTarget]);
      expect(fs.readFileSync(expectedTarget).equals(PNG_BYTES)).toBe(true);
    } finally {
      await tearDown();
    }
  });

  it('links a file from inside the workspace without copying it', async () => {
    const { folder, document, tearDown } = await setUp('Page.md');
    try {
      const inside = path.join(workspaceRoot(), folder, 'images', 'local.png');
      fs.mkdirSync(path.dirname(inside), { recursive: true });
      fs.writeFileSync(inside, PNG_BYTES);

      const edit = await dropFiles(document, [inside]);

      expect(edit.additionalEdit).toBeUndefined();
      expect(insertedText(edit)).toEqual(
        `![\${1:local}](/${folder}/images/local.png)`
      );
    } finally {
      await tearDown();
    }
  });

  it('identifies its edit with the gollum.upload kind', async () => {
    const { document, outsideDir, tearDown } = await setUp('Page.md');
    try {
      const source = path.join(outsideDir, 'picture.png');
      fs.writeFileSync(source, PNG_BYTES);

      const edit = await dropFiles(document, [source]);

      expect(edit.kind.value).toEqual('gollum.upload');
    } finally {
      await tearDown();
    }
  });

  it('offers no edit for a data transfer without a uri list', async () => {
    const { document, tearDown } = await setUp('Page.md');
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.set('text/plain', new DataTransferItem('hello'));

      const edit = await new CustomMarkdownDropProvider().provideDocumentDropEdits(
        document,
        new Position(0, 0),
        dataTransfer,
        new CancellationTokenSource().token
      );

      expect(edit).toBeUndefined();
    } finally {
      await tearDown();
    }
  });
});
