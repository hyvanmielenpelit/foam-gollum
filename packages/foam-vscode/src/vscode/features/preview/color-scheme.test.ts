// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../../../../static/preview/color-scheme.js'),
  'utf8'
);
const marker = (scheme: string) =>
  `<div data-foam-preview-color-scheme="${scheme}" hidden></div>`;

/**
 * A Markdown preview webview as VS Code builds it, running the color scheme
 * script once, like a fresh preview load. Each preview gets its own window
 * from happy-dom's `Window` constructor, so listeners and observers never
 * carry over from another preview.
 *
 * With `contentAfterScript`, the body is empty while the script runs, and
 * `insertInitialContent` appends the content later without an event, as the
 * preview's own script does with `data-initial-md-content` on page load.
 */
function createPreview({
  kind = 'vscode-dark',
  classes = `vscode-body ${kind}`,
  content = '<p>Hello</p>',
  contentAfterScript = false,
}: {
  kind?: string;
  classes?: string;
  content?: string;
  contentAfterScript?: boolean;
} = {}) {
  const window = new globalThis.Window() as any;
  const document: Document = window.document;
  const contentHtml = `<div class="markdown-body">${content}</div>`;
  document.body.className = classes;
  document.body.setAttribute('data-vscode-theme-kind', kind);
  if (!contentAfterScript) {
    document.body.innerHTML = contentHtml;
  }
  new Function('window', 'document', 'MutationObserver', SCRIPT)(
    window,
    document,
    window.MutationObserver
  );

  return {
    window,
    document,
    insertInitialContent: () => {
      const parsed = new window.DOMParser().parseFromString(
        contentHtml,
        'text/html'
      );
      document.body.append(...Array.from(parsed.body.children as Element[]));
    },
    scheme: () => document.documentElement.getAttribute('data-foam-color-scheme'),
    themeClasses: () =>
      Array.from(document.body.classList)
        .filter(c => c !== 'vscode-body')
        .sort(),
    /** Replaces the rendered content, as VS Code does on `updateContent`. */
    updateContent: (html: string) => {
      const body = document.createElement('div');
      body.className = 'markdown-body';
      body.innerHTML = html;
      document.querySelector('.markdown-body').replaceWith(body);
      window.dispatchEvent(
        new window.CustomEvent('vscode.markdown.updateContent')
      );
    },
    /** Rewrites the theme classes and kind, as the host's `applyStyles` does. */
    changeTheme: (newKind: string, newClasses: string[]) => {
      document.body.classList.remove(
        'vscode-light',
        'vscode-dark',
        'vscode-high-contrast',
        'vscode-high-contrast-light'
      );
      document.body.classList.add(...newClasses);
      document.body.setAttribute('data-vscode-theme-kind', newKind);
    },
    flush: async () => {
      await window.happyDOM.waitUntilComplete();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    close: () => window.happyDOM.close(),
  };
}

describe('preview color scheme', () => {
  it('without a marker leaves the page untouched', async () => {
    const preview = createPreview();
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('a light marker under a dark theme sets the attribute and swaps the theme class', async () => {
    const preview = createPreview({
      content: `${marker('light')}<p>Hello</p>`,
    });
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);
    expect(preview.document.body.getAttribute('data-vscode-theme-kind')).toBe(
      'vscode-dark'
    );
    await preview.close();
  });

  it('applies the marker in content the preview inserts after the script has run', async () => {
    const preview = createPreview({
      content: `${marker('light')}<p>Hello</p>`,
      contentAfterScript: true,
    });
    await preview.flush();
    expect(preview.scheme()).toBeNull();

    preview.insertInitialContent();
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);
    await preview.close();
  });

  it('a dark marker under a dark theme applies no override', async () => {
    const preview = createPreview({
      content: `${marker('dark')}<p>Hello</p>`,
    });
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('a light marker under High Contrast Light overrides it, and an update without the marker restores both high contrast classes', async () => {
    const preview = createPreview({
      kind: 'vscode-high-contrast-light',
      classes: 'vscode-body vscode-high-contrast vscode-high-contrast-light',
      content: `${marker('light')}<p>Hello</p>`,
    });
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);

    preview.updateContent('<p>Hello</p>');
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual([
      'vscode-high-contrast',
      'vscode-high-contrast-light',
    ]);
    await preview.close();
  });

  it('re-applies the override after the host rewrites the theme classes', async () => {
    const preview = createPreview({
      content: `${marker('light')}<p>Hello</p>`,
    });
    await preview.flush();

    preview.changeTheme('vscode-high-contrast', ['vscode-high-contrast']);
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);
    expect(preview.document.body.getAttribute('data-vscode-theme-kind')).toBe(
      'vscode-high-contrast'
    );
    await preview.close();
  });

  it('a content update that adds, changes or removes the marker applies, switches or removes the override', async () => {
    const preview = createPreview({
      kind: 'vscode-high-contrast',
      classes: 'vscode-body vscode-high-contrast',
    });
    await preview.flush();
    expect(preview.scheme()).toBeNull();

    preview.updateContent(`${marker('light')}<p>Hello</p>`);
    await preview.flush();
    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);

    preview.updateContent(`${marker('dark')}<p>Hello</p>`);
    await preview.flush();
    expect(preview.scheme()).toBe('dark');
    expect(preview.themeClasses()).toEqual(['vscode-dark']);

    preview.updateContent('<p>Hello</p>');
    await preview.flush();
    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-high-contrast']);
    await preview.close();
  });

  it('an unknown marker value applies no override', async () => {
    const preview = createPreview({
      content: `${marker('sepia')}<p>Hello</p>`,
    });
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('adds no element to the page', async () => {
    const content = `${marker('light')}<p>Hello</p>`;
    const page = new globalThis.Window() as any;
    page.document.body.innerHTML = `<div class="markdown-body">${content}</div>`;
    const expected = page.document.body.innerHTML;
    await page.happyDOM.close();

    const preview = createPreview({ content });
    await preview.flush();

    expect(preview.document.body.innerHTML).toBe(expected);
    await preview.close();
  });
});
