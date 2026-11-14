/**
 * Light/dark switch for the Markdown preview.
 *
 * A button in the bottom-right corner cycles the preview between three modes:
 * 'theme' (follow VS Code), 'light' and 'dark'. The mode is kept in
 * sessionStorage, so it applies to this preview panel only and survives edits,
 * navigation to another note and preview reloads.
 *
 * A forced mode is applied in two places:
 *
 * 1. The data-foam-color-scheme attribute on <html>, which color-scheme.css
 *    uses to override the --vscode-* custom properties the webview host
 *    writes inline on <html>.
 * 2. The theme classes on <body> (vscode-light, vscode-dark, ...), which the
 *    preview's own styles and code highlighting use. The host rewrites them on
 *    every theme change, so a MutationObserver re-applies the swap.
 *
 * The host-written data-vscode-theme-kind attribute on <body> is never
 * changed, so it always holds the real theme.
 *
 * When the foam.preview.showColorSchemeSwitch setting is off, Foam renders a
 * hidden marker element into the content; while it is present the button is
 * removed and no mode is applied, but the stored mode is kept.
 */

(function () {
  const STORAGE_KEY = 'foam-preview-color-scheme';
  const MODES = ['theme', 'light', 'dark'];
  const LABELS = { theme: 'Theme', light: 'Light', dark: 'Dark' };
  const THEME_CLASSES = [
    'vscode-light',
    'vscode-dark',
    'vscode-high-contrast',
    'vscode-high-contrast-light',
  ];
  const BUTTON_CLASS = 'foam-color-scheme-toggle';
  const HIDDEN_MARKER_SELECTOR =
    '.markdown-body [data-foam-color-scheme-switch="hidden"]';

  function getStoredMode() {
    try {
      const mode = sessionStorage.getItem(STORAGE_KEY);
      return MODES.includes(mode) ? mode : 'theme';
    } catch {
      return 'theme';
    }
  }

  function storeMode(mode) {
    try {
      sessionStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // sessionStorage unavailable — the mode lasts until the next reload.
    }
  }

  function isSwitchHidden() {
    return document.querySelector(HIDDEN_MARKER_SELECTOR) !== null;
  }

  function getEffectiveMode() {
    return isSwitchHidden() ? 'theme' : getStoredMode();
  }

  function getThemeClasses(mode) {
    if (mode === 'light') {
      return ['vscode-light'];
    }
    if (mode === 'dark') {
      return ['vscode-dark'];
    }
    const kind = document.body.dataset.vscodeThemeKind;
    if (kind === 'vscode-high-contrast-light') {
      return ['vscode-high-contrast', 'vscode-high-contrast-light'];
    }
    return THEME_CLASSES.includes(kind) ? [kind] : null;
  }

  function setThemeClasses(target) {
    if (!target) {
      return;
    }
    const classList = document.body.classList;
    const current = THEME_CLASSES.filter(c => classList.contains(c));
    if (
      current.length === target.length &&
      target.every(c => current.includes(c))
    ) {
      return;
    }
    classList.remove(...THEME_CLASSES);
    classList.add(...target);
  }

  function apply() {
    const mode = getEffectiveMode();
    const kind = document.body.dataset.vscodeThemeKind;
    const isHighContrast =
      kind === 'vscode-high-contrast' || kind === 'vscode-high-contrast-light';
    const base =
      kind === 'vscode-light' || kind === 'vscode-high-contrast-light'
        ? 'light'
        : 'dark';
    const override = mode !== 'theme' && (mode !== base || isHighContrast);
    const root = document.documentElement;

    if (override) {
      if (root.dataset.foamColorScheme !== mode) {
        root.dataset.foamColorScheme = mode;
      }
      setThemeClasses(getThemeClasses(mode));
    } else {
      delete root.dataset.foamColorScheme;
      setThemeClasses(getThemeClasses('theme'));
    }
  }

  function updateButton(button) {
    const label = LABELS[getStoredMode()];
    button.textContent = label;
    button.title = `Preview color scheme: ${label}. Click to switch.`;
    button.setAttribute('aria-label', button.title);
  }

  function createButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.addEventListener('click', e => {
      e.stopPropagation();
      const next = MODES[(MODES.indexOf(getStoredMode()) + 1) % MODES.length];
      storeMode(next);
      apply();
      updateButton(button);
    });
    button.addEventListener('dblclick', e => e.stopPropagation());
    updateButton(button);
    return button;
  }

  function refresh() {
    const button = document.querySelector(`.${BUTTON_CLASS}`);
    if (isSwitchHidden()) {
      button?.remove();
    } else if (!button) {
      document.body.appendChild(createButton());
    }
    apply();
  }

  new MutationObserver(apply).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-vscode-theme-kind'],
  });

  window.addEventListener('vscode.markdown.updateContent', refresh);

  refresh();
})();
