import * as vscode from 'vscode';
import * as os from 'os';
import { getFoamVsCodeConfig } from '../../config';
import { imageSizeFromFile } from 'image-size/fromFile';
import {
  GOLLUM_UPLOAD_KIND_ID,
  computeDropTarget,
  isImageExtension,
  parseUriList,
  splitFileName,
} from './drop-paths';

export const GOLLUM_UPLOAD_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append(
  ...GOLLUM_UPLOAD_KIND_ID.split('.')
);

const toForwardSlashes = (fsPath: string) => fsPath.replace(/\\/g, '/');

/**
 * Inserts links to dropped files and copies files from outside the workspace
 * to the document's uploads folder. The copy is part of the edit's
 * `additionalEdit`, so it happens only when VS Code applies this edit.
 */
export class CustomMarkdownDropProvider implements vscode.DocumentDropEditProvider {
   async provideDocumentDropEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const uriList = dataTransfer.get('text/uri-list');
    if (!uriList) {
      return undefined;
    }
    const files = parseUriList(await uriList.asString());
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (files.length === 0 || !workspaceFolder) {
      return undefined;
    }

    const fileTemplateFormat: string = getFoamVsCodeConfig('fileDropdown.fileTemplateFormat', 'markdown');
    const imageTemplateFormat: string = getFoamVsCodeConfig('fileDropdown.imageTemplateFormat', 'markdown');
    const uploadsFolderName: string = getFoamVsCodeConfig('fileDropdown.uploadsFolderName', 'uploads');

    const copyEdit = new vscode.WorkspaceEdit();
    let copyCount = 0;
    let text = '';

    for (const file of files) {
      const fileUri = vscode.Uri.parse(file);
      const droppedFilePath = toForwardSlashes(fileUri.fsPath);
      const { name: fileNameWithoutExtension, extension } = splitFileName(
        droppedFilePath.substring(droppedFilePath.lastIndexOf('/') + 1)
      );
      const isImage = isImageExtension(extension);

      const { linkPath, needsCopy } = computeDropTarget({
        workspacePath: toForwardSlashes(workspaceFolder.uri.fsPath),
        documentPath: toForwardSlashes(document.uri.fsPath),
        droppedFilePath,
        uploadsFolderName,
      });

      if (needsCopy) {
        const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, ...linkPath.substring(1).split('/'));
        copyEdit.createFile(targetUri, {
          overwrite: true,
          contents: await vscode.workspace.fs.readFile(fileUri),
        });
        copyCount++;
      }

      let dimensions = null;
      if (isImage && fileUri.scheme === 'file') {
        dimensions = await this.readImageDimensions(fileUri);
      }

      const templateFormat = isImage ? imageTemplateFormat : fileTemplateFormat;

      text += this.getTemplate(linkPath, fileNameWithoutExtension, files.length, templateFormat, isImage, dimensions, text === '');
    }

    if (token.isCancellationRequested) {
      return undefined;
    }

    const edit = new vscode.DocumentDropEdit(
      new vscode.SnippetString(text),
      'Insert as Gollum upload',
      GOLLUM_UPLOAD_KIND
    );
    if (copyCount > 0) {
      edit.additionalEdit = copyEdit;
    }
    return edit;
  }

  getTemplate(link: string, altText: string, filesCount: number, templateFormat: string, isImage: boolean, dimensions: {width: number, height: number}, isFirst: boolean) : string {
    const encodedLink = encodeURI(link);
    
    let text: string = '';
    
    if (!isFirst) {
      text += os.EOL;
    }

    const altText2: string = filesCount === 1 ? '${1:' + altText + '}' : altText;

    if (templateFormat === 'markdown') {
      if (isImage) {
        text += "![" + altText2 + "]("+ encodedLink + ")";
      } else {
        text += "[" + altText2 + "]("+ encodedLink + ")";
      }
    } else if (templateFormat === 'html') {
      if (isImage) {
        let imageDimensionsHtml = '';
        if (dimensions) {
          if (dimensions.width && dimensions.width > 0) {
            imageDimensionsHtml += 'width="' + dimensions.width + '" ';
          }
          if (dimensions.height && dimensions.height > 0) {
            imageDimensionsHtml += 'height="' + dimensions.height + '" ';
          }
        }
        text += '<img src="' + encodedLink + '" alt="'+ altText2 + '" ' + imageDimensionsHtml + '/>';
      } else {
        text += '<a href="' + encodedLink + '">' + altText2 + '</a>';
      }
    } else if (templateFormat === 'gollum') {
      if (isImage) {
        let imageDimensionsGollum = '';
        if (dimensions) {
          if (dimensions.width && dimensions.width > 0) {
            imageDimensionsGollum += ', width=' + dimensions.width + 'px';
          }
          if (dimensions.height && dimensions.height > 0) {
            imageDimensionsGollum += ', height=' + dimensions.height + 'px';
          }
        }
        text += '[[' + link + '|alt='+ altText2 + imageDimensionsGollum + ']]';
      } else {
        text += '[[' + altText2 + '|' + link + ']]';
      }
    }

    return text;
  }

  async readImageDimensions (uri: vscode.Uri): Promise<{ width: number; height: number } | null> {
    try {
        const dimensions = await imageSizeFromFile(uri.fsPath);
        if (dimensions.width && dimensions.height) {
            return { width: dimensions.width, height: dimensions.height };
        }
    } catch (err) {
        console.error('Error reading image dimensions:', err);
    }
    return null;
  }
}
