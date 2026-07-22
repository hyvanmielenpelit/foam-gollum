import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { getFoamVsCodeConfig } from '../../vscode/config';
import { imageExtensions } from '@foam/core';
import { imageSizeFromFile } from 'image-size/fromFile';

export class CustomMarkdownDropProvider implements vscode.DocumentDropEditProvider {
   async provideDocumentDropEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const fileTemplateFormat: string = getFoamVsCodeConfig("fileDropdown.fileTemplateFormat"); 
    const imageTemplateFormat: string = getFoamVsCodeConfig("fileDropdown.imageTemplateFormat"); 
    const uploadsFolderName: string = getFoamVsCodeConfig("fileDropdown.uploadsFolderName"); 
    
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceFolderPath = workspaceFolder.uri.path + '/';

    const files = dataTransfer.get("text/uri-list").value.split(/\r?\n/);
    let text = '';

    for(const file of files) {
      const filePathUri = vscode.Uri.parse(file);
      const fileName = path.basename(filePathUri.fsPath);
      const fileNameDotIndex = fileName.indexOf('.', 1); 
      const fileNameWithoutExtension = fileNameDotIndex > 0 ? fileName.substring(0, fileNameDotIndex) : fileName; 
      const fileExtension = fileNameDotIndex > 0 ? fileName.substring(fileNameDotIndex) : '';
      const isImage = imageExtensions.includes(fileExtension.toLowerCase());

      const documentRelPath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath).replace(/\\/g, "/");
      const documentLastIndexOfSlash = documentRelPath.lastIndexOf('/');
      const documentRelativeDirectory = documentLastIndexOfSlash >= 0 ? documentRelPath.substring(0, documentLastIndexOfSlash) : "";
      const documentName = path.basename(documentRelPath);
      const documentNameDotIndex = documentName.indexOf('.', 1); 
      const documentNameWithoutExtension = documentNameDotIndex > 0 ? documentName.substring(0, documentNameDotIndex) : documentName; 
      
      let documentAndFileRelativeDirectory = documentNameWithoutExtension;
      if (documentRelativeDirectory.length > 0) {
        documentAndFileRelativeDirectory = documentRelativeDirectory + "/" + documentNameWithoutExtension;
      }

      let targetRelPath = '';
      if(filePathUri.path.startsWith(workspaceFolderPath)) {
        const fileRelPath = path.relative(workspaceFolder.uri.fsPath, filePathUri.fsPath).replace(/\\/g, "/");
        targetRelPath = '/' + fileRelPath;
      } else {
        targetRelPath = "/" + uploadsFolderName + "/";
        if (documentAndFileRelativeDirectory !== '') {
          targetRelPath += documentAndFileRelativeDirectory + "/";
        }
        targetRelPath += fileName;

        const targetFsPath = workspaceFolder.uri.path + targetRelPath;
        const targetFsPathUri = vscode.Uri.file(targetFsPath);
        await vscode.workspace.fs.copy(filePathUri, targetFsPathUri, {
          overwrite: true
        });
      }

      let dimensions = null;
      if (isImage) {
        dimensions = await this.readImageDimensions(filePathUri);
      }
      
      const altText = fileNameWithoutExtension;
      const templateFormat = isImage ? imageTemplateFormat : fileTemplateFormat; 

      text += this.getTemplate(targetRelPath, altText, files.length, templateFormat, isImage, dimensions, text === '');
    }

    const textSnippet = new vscode.SnippetString(text);
    let ret: vscode.DocumentDropEdit = new vscode.DocumentDropEdit(textSnippet);
    return ret;
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
