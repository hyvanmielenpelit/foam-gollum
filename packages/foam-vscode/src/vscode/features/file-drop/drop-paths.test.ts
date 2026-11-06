import * as fs from 'fs';
import * as path from 'path';
import {
  GOLLUM_UPLOAD_KIND_ID,
  computeDropTarget,
  isImageExtension,
  parseUriList,
  splitFileName,
} from './drop-paths';

const workspacePath = 'C:/wiki';
const outsideFile = 'D:/Pictures/us-flag.webp';

describe('computeDropTarget', () => {
  it('keeps every dot in the document name except the extension', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/GnollHack vs. Pathos vs. NetHack.md',
      droppedFilePath: outsideFile,
      uploadsFolderName: 'uploads',
    });
    expect(target).toEqual({
      linkPath: '/uploads/GnollHack vs. Pathos vs. NetHack/us-flag.webp',
      needsCopy: true,
    });
  });

  it("includes the document's directory in the upload folder", () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Items/Amulets.md',
      droppedFilePath: 'D:/x.png',
      uploadsFolderName: 'uploads',
    });
    expect(target.linkPath).toEqual('/uploads/Items/Amulets/x.png');
  });

  it("keeps the dots in the document's directory name", () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/v1.2/Notes.md',
      droppedFilePath: 'D:/x.png',
      uploadsFolderName: 'uploads',
    });
    expect(target.linkPath).toEqual('/uploads/v1.2/Notes/x.png');
  });

  it('uses only the document name for a document at the workspace root', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Home.md',
      droppedFilePath: 'D:/x.png',
      uploadsFolderName: 'uploads',
    });
    expect(target.linkPath).toEqual('/uploads/Home/x.png');
  });

  it('falls back to "uploads" when the uploads folder setting is blank', () => {
    for (const uploadsFolderName of [undefined, '', '   ']) {
      const target = computeDropTarget({
        workspacePath,
        documentPath: 'C:/wiki/Home.md',
        droppedFilePath: 'D:/x.png',
        uploadsFolderName,
      });
      expect(target.linkPath).toEqual('/uploads/Home/x.png');
    }
  });

  it('uses a custom uploads folder name', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Home.md',
      droppedFilePath: 'D:/x.png',
      uploadsFolderName: 'media',
    });
    expect(target.linkPath).toEqual('/media/Home/x.png');
  });

  it('keeps the full name of a dropped file with several dots', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Home.md',
      droppedFilePath: 'D:/photo.v2.final.png',
      uploadsFolderName: 'uploads',
    });
    expect(target.linkPath).toEqual('/uploads/Home/photo.v2.final.png');
  });

  it('links a file inside the workspace to its own path without a copy', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Items/Amulets.md',
      droppedFilePath: 'C:/wiki/images/amulet.png',
      uploadsFolderName: 'uploads',
    });
    expect(target).toEqual({
      linkPath: '/images/amulet.png',
      needsCopy: false,
    });
  });

  it('compares the workspace prefix case-insensitively', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'c:/Wiki/Home.md',
      droppedFilePath: 'c:/WIKI/images/amulet.png',
      uploadsFolderName: 'uploads',
    });
    expect(target).toEqual({
      linkPath: '/images/amulet.png',
      needsCopy: false,
    });
  });

  it('does not treat a sibling folder sharing the prefix as the workspace', () => {
    const target = computeDropTarget({
      workspacePath,
      documentPath: 'C:/wiki/Home.md',
      droppedFilePath: 'C:/wiki-old/x.png',
      uploadsFolderName: 'uploads',
    });
    expect(target).toEqual({
      linkPath: '/uploads/Home/x.png',
      needsCopy: true,
    });
  });
});

describe('splitFileName', () => {
  it('keeps all dots but the last as the name', () => {
    expect(splitFileName('photo.v2.final.png')).toEqual({
      name: 'photo.v2.final',
      extension: '.png',
    });
  });

  it('treats a dotfile without extension as a name only', () => {
    expect(splitFileName('.hidden')).toEqual({
      name: '.hidden',
      extension: '',
    });
  });

  it('handles a name without any dot', () => {
    expect(splitFileName('README')).toEqual({
      name: 'README',
      extension: '',
    });
  });
});

describe('isImageExtension', () => {
  it('recognizes the final extension of a dotted file name as an image', () => {
    expect(
      isImageExtension(splitFileName('photo.v2.final.png').extension)
    ).toBe(true);
  });

  it('ignores extension case', () => {
    expect(isImageExtension('.PNG')).toBe(true);
  });

  it('does not recognize a non-image extension', () => {
    expect(isImageExtension('.pdf')).toBe(false);
    expect(isImageExtension('')).toBe(false);
  });
});

describe('parseUriList', () => {
  it('returns one entry per uri', () => {
    expect(parseUriList('file:///a.png\nfile:///b.png')).toEqual([
      'file:///a.png',
      'file:///b.png',
    ]);
  });

  it('ignores empty lines, a trailing newline, CRLF and comment lines', () => {
    expect(
      parseUriList('# comment\r\nfile:///a.png\r\n\r\nfile:///b.png\r\n')
    ).toEqual(['file:///a.png', 'file:///b.png']);
  });

  it('returns no entries for an empty value', () => {
    expect(parseUriList('')).toEqual([]);
  });
});

describe('extension manifest', () => {
  it('makes the Foam upload edit the default drop option for Markdown', () => {
    const manifestPath = path.join(__dirname, '..', '..', '..', '..', 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const preferences =
      manifest.contributes?.configurationDefaults?.['[markdown]']?.[
        'editor.dropIntoEditor.preferences'
      ];
    expect(preferences?.[0]).toEqual(GOLLUM_UPLOAD_KIND_ID);
  });
});
