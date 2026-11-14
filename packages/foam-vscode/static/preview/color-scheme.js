/**
 * Light/dark color scheme for the Markdown preview.
 *
 * Foam renders a hidden marker element first in the content,
 * data-foam-preview-color-scheme="light" or "dark", while the Theme switch in
 * the preview's toolbar forces a scheme. Without the marker the preview
 * follows the VS Code theme.
 *
 * A forced scheme is applied in two places:
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
 */

(function () {
  const THEME_CLASSES = [
    'vscode-light',
    'vscode-dark',
    'vscode-high-contrast',
    'vscode-high-contrast-light',
  ];
  const MARKER_SELECTOR = '.markdown-body [data-foam-preview-color-scheme]';

  function getEffectiveMode() {
    const mode =
      document.querySelector(MARKER_SELECTOR)?.dataset.foamPreviewColorScheme;
    return mode === 'light' || mode === 'dark' ? mode : 'theme';
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

  // childList: on page load the preview appends the content to <body> without
  // an updateContent event, possibly after this script has run.
  new MutationObserver(apply).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-vscode-theme-kind'],
    childList: true,
  });

  window.addEventListener('vscode.markdown.updateContent', apply);

  apply();
})();
