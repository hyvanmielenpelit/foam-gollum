// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../../../../static/preview/color-scheme.js'),
  'utf8'
);
const STORAGE_KEY = 'foam-preview-color-scheme';
const MARKER = '<div data-foam-color-scheme-switch="hidden" hidden></div>';

/**
 * A Markdown preview webview as VS Code builds it, running the color scheme
 * script once, like a fresh preview load. Each preview gets its own window
 * from happy-dom's `Window` constructor, so listeners, observers and
 * sessionStorage never carry over from another preview.
 */
function createPreview({
  kind = 'vscode-dark',
  classes = `vscode-body ${kind}`,
  content = '<p>Hello</p>',
  storedMode,
}: {
  kind?: string;
  classes?: string;
  content?: string;
  storedMode?: string;
} = {}) {
  const window = new globalThis.Window() as any;
  const document: Document = window.document;
  document.body.className = classes;
  document.body.setAttribute('data-vscode-theme-kind', kind);
  document.body.innerHTML = `<div class="markdown-body">${content}</div>`;
  if (storedMode !== undefined) {
    window.sessionStorage.setItem(STORAGE_KEY, storedMode);
  }
  new Function(
    'window',
    'document',
    'sessionStorage',
    'MutationObserver',
    SCRIPT
  )(window, document, window.sessionStorage, window.MutationObserver);

  return {
    window,
    document,
    button: () =>
      document.querySelector<HTMLButtonElement>('.foam-color-scheme-toggle'),
    buttonCount: () =>
      document.querySelectorAll('.foam-color-scheme-toggle').length,
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

describe('preview color scheme switch', () => {
  it('in Theme mode leaves the page untouched', async () => {
    const preview = createPreview();
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    expect(preview.button().textContent).toBe('Theme');
    await preview.close();
  });

  it('switching to Light under a dark theme sets the attribute and swaps the theme class', async () => {
    const preview = createPreview();

    preview.button().click();
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);
    expect(preview.document.body.getAttribute('data-vscode-theme-kind')).toBe(
      'vscode-dark'
    );
    await preview.close();
  });

  it('switching to Dark under a dark theme applies no override', async () => {
    const preview = createPreview({ storedMode: 'dark' });
    await preview.flush();

    expect(preview.button().textContent).toBe('Dark');
    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('forcing Light under High Contrast Light overrides it, and Theme restores both high contrast classes', async () => {
    const preview = createPreview({
      kind: 'vscode-high-contrast-light',
      classes: 'vscode-body vscode-high-contrast vscode-high-contrast-light',
      storedMode: 'light',
    });
    await preview.flush();

    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);

    preview.button().click(); // Dark
    preview.button().click(); // Theme
    await preview.flush();

    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual([
      'vscode-high-contrast',
      'vscode-high-contrast-light',
    ]);
    await preview.close();
  });

  it('re-applies the override after the host rewrites the theme classes', async () => {
    const preview = createPreview({ storedMode: 'light' });
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

  it('keeps the chosen mode across a reload of the preview', async () => {
    const first = createPreview();
    first.button().click();
    const stored = first.window.sessionStorage.getItem(STORAGE_KEY);
    await first.close();

    const reloaded = createPreview({ storedMode: stored });
    await reloaded.flush();

    expect(reloaded.button().textContent).toBe('Light');
    expect(reloaded.scheme()).toBe('light');
    expect(reloaded.themeClasses()).toEqual(['vscode-light']);
    await reloaded.close();
  });

  it('treats an unknown stored mode as Theme', async () => {
    const preview = createPreview({ storedMode: 'sepia' });
    await preview.flush();

    expect(preview.button().textContent).toBe('Theme');
    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('keeps the button and its label when the content is replaced', async () => {
    const preview = createPreview();
    preview.button().click();

    preview.updateContent('<p>Another note</p>');
    await preview.flush();

    expect(preview.buttonCount()).toBe(1);
    expect(preview.button().textContent).toBe('Light');
    expect(preview.scheme()).toBe('light');
    await preview.close();
  });

  it('cycles Theme, Light, Dark and back to Theme on click', async () => {
    const preview = createPreview();
    const labels = [preview.button().textContent];
    for (let i = 0; i < 3; i++) {
      preview.button().click();
      labels.push(preview.button().textContent);
    }

    expect(labels).toEqual(['Theme', 'Light', 'Dark', 'Theme']);
    await preview.close();
  });

  it('shows no button and applies no override when the content carries the hidden marker', async () => {
    const preview = createPreview({
      content: `${MARKER}<p>Hello</p>`,
      storedMode: 'light',
    });
    await preview.flush();

    expect(preview.buttonCount()).toBe(0);
    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);
    await preview.close();
  });

  it('hides and restores the switch and the stored mode as the marker comes and goes', async () => {
    const preview = createPreview();
    preview.button().click();

    preview.updateContent(`${MARKER}<p>Hello</p>`);
    await preview.flush();

    expect(preview.buttonCount()).toBe(0);
    expect(preview.scheme()).toBeNull();
    expect(preview.themeClasses()).toEqual(['vscode-dark']);

    preview.updateContent('<p>Hello</p>');
    await preview.flush();

    expect(preview.buttonCount()).toBe(1);
    expect(preview.button().textContent).toBe('Light');
    expect(preview.scheme()).toBe('light');
    expect(preview.themeClasses()).toEqual(['vscode-light']);
    await preview.close();
  });
});
