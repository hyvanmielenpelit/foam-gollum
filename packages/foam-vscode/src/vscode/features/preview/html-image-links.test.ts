import { markdownItHtmlImageLinks } from './html-image-links';
import MarkdownIt from 'markdown-it';
import { FoamWorkspace, Resource, URI } from '@foam/core';

describe('markdownItHtmlImageLinks', () => {
  let md: MarkdownIt;
  let workspace: FoamWorkspace;

  beforeEach(() => {
    md = new MarkdownIt({ html: true });
    workspace = new FoamWorkspace();
    workspace.find = (path: string) => {
      if (path === '/uploads/image.webp') return { uri: URI.file('/mock/path/uploads/image.webp') } as Resource;
      if (path === '/uploads/test file.webp') return { uri: URI.file('/mock/path/uploads/test file.webp') } as Resource;
      return null;
    };
    markdownItHtmlImageLinks(md, workspace);
  });

  it('rewrites src for existing workspace image in html_inline', () => {
    const resource: Resource = {
      uri: URI.file('/mock/path/uploads/image.webp'),
      type: 'image',
      title: 'image',
      properties: {},
      links: [],
      sections: [],
      text: ''
    };
    workspace.set(resource);

    const input = 'Some text <img src="/uploads/image.webp" width="330" /> and more';
    const result = md.render(input);
    expect(result).toContain('<img src="/mock/path/uploads/image.webp" width="330" />');
  });

  it('rewrites src for existing workspace image in html_block', () => {
    const resource: Resource = {
      uri: URI.file('/mock/path/uploads/image.webp'),
      type: 'image',
      title: 'image',
      properties: {},
      links: [],
      sections: [],
      text: ''
    };
    workspace.set(resource);

    const input = '<img src="/uploads/image.webp" width="330" />\n';
    const result = md.render(input);
    expect(result).toContain('<img src="/mock/path/uploads/image.webp" width="330" />');
  });

  it('leaves src alone if image is not found in workspace', () => {
    const input = 'Some text <img src="/uploads/missing.webp" width="330" /> and more';
    const result = md.render(input);
    expect(result).toContain('<img src="/uploads/missing.webp" width="330" />');
  });

  it('ignores images without absolute workspace path', () => {
    const input = '<img src="relative/path.webp" />';
    const result = md.render(input);
    expect(result).toContain('<img src="relative/path.webp" />');
  });

  it('handles URI encoded srcs', () => {
    const resource: Resource = {
      uri: URI.file('/mock/path/uploads/test file.webp'),
      type: 'image',
      title: 'test file',
      properties: {},
      links: [],
      sections: [],
      text: ''
    };
    workspace.set(resource);

    const input = '<img src="/uploads/test%20file.webp" />';
    const result = md.render(input);
    expect(result).toContain('<img src="/mock/path/uploads/test file.webp" />');
  });
});
