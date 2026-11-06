import { posix } from 'path';
import { imageExtensions } from '@foam/core';

/**
 * Kind id of the drop edit offered by the custom Markdown drop provider.
 * `package.json` names it in the Markdown default of `editor.dropIntoEditor.preferences`.
 */
export const GOLLUM_UPLOAD_KIND_ID = 'gollum.upload';

const DEFAULT_UPLOADS_FOLDER = 'uploads';

/**
 * Splits a file name at its final extension, e.g.
 *    - photo.v2.png -> photo.v2, .png
 *    - .hidden -> .hidden, ''
 */
export function splitFileName(fileName: string): {
  name: string;
  extension: string;
} {
  const extension = posix.extname(fileName);
  return {
    name: fileName.substring(0, fileName.length - extension.length),
    extension,
  };
}

export function isImageExtension(extension: string): boolean {
  return imageExtensions.includes(extension.toLowerCase());
}

/**
 * Parses a `text/uri-list` value (RFC 2483): one uri per line,
 * lines starting with `#` are comments.
 */
export function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Returns `path` relative to `base`, or `undefined` when it is not inside it.
 * The comparison is case-insensitive.
 */
function relativeToFolder(base: string, path: string): string | undefined {
  const prefix = base.endsWith('/') ? base : base + '/';
  return path.toLowerCase().startsWith(prefix.toLowerCase())
    ? path.substring(prefix.length)
    : undefined;
}

/**
 * Computes the workspace-rooted link of a dropped file. A file inside the
 * workspace links to its own path; any other file is copied to
 * `/<uploads>/<document directory>/<document name>/<file name>`.
 *
 * All paths use forward slashes.
 */
export function computeDropTarget(args: {
  workspacePath: string;
  documentPath: string;
  droppedFilePath: string;
  uploadsFolderName: string | undefined;
}): { linkPath: string; needsCopy: boolean } {
  const { workspacePath, documentPath, droppedFilePath, uploadsFolderName } =
    args;

  const droppedRelPath = relativeToFolder(workspacePath, droppedFilePath);
  if (droppedRelPath !== undefined) {
    return { linkPath: '/' + droppedRelPath, needsCopy: false };
  }

  const documentRelPath =
    relativeToFolder(workspacePath, documentPath) ??
    posix.basename(documentPath);
  const documentDir = posix.dirname(documentRelPath);
  const documentName = splitFileName(posix.basename(documentRelPath)).name;
  const uploadsFolder =
    uploadsFolderName && uploadsFolderName.trim().length > 0
      ? uploadsFolderName
      : DEFAULT_UPLOADS_FOLDER;

  const segments = [uploadsFolder];
  if (documentDir !== '.') {
    segments.push(documentDir);
  }
  segments.push(documentName, posix.basename(droppedFilePath));
  return { linkPath: '/' + segments.join('/'), needsCopy: true };
}
