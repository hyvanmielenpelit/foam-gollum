/*global markdownit:readonly*/

import { FoamWorkspace, isNone } from '@foam/core';

const IMG_REGEX = /<img\b([^>]*)src=["'](\/[^"']+)["']([^>]*)>/g;

export const markdownItHtmlImageLinks = (
  md: markdownit,
  workspace: FoamWorkspace
) => {
  md.core.ruler.push('html-image-links', state => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'inline' && token.children) {
        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j];
          if (child.type === 'html_inline') {
            child.content = rewriteHtmlImages(child.content, workspace);
          }
        }
      } else if (token.type === 'html_block') {
        token.content = rewriteHtmlImages(token.content, workspace);
      }
    }
  });
  return md;
};

function rewriteHtmlImages(content: string, workspace: FoamWorkspace): string {
  return content.replace(IMG_REGEX, (match, before, src, after) => {
    try {
      const decodedSrc = decodeURI(src);
      const resource = workspace.find(decodedSrc);
      if (resource && !isNone(resource)) {
        return `<img${before}src="${resource.uri.path}"${after}>`;
      }
    } catch (e) {
      // ignore decoding errors
    }
    return match;
  });
}

export default markdownItHtmlImageLinks;
