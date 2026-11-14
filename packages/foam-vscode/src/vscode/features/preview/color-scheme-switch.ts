/*global markdownit:readonly*/

export const CONFIG_SHOW_COLOR_SCHEME_SWITCH = 'preview.showColorSchemeSwitch';

/**
 * Tells the preview's color scheme script (static/preview/color-scheme.js)
 * that its switch is turned off, by rendering a hidden marker element first.
 * Nothing is rendered while the switch is shown, nor for embedded content.
 */
export const markdownItColorSchemeSwitch = (
  md: markdownit,
  options: { isShown: () => boolean; isTopLevel: () => boolean }
) => {
  md.core.ruler.push('foam-color-scheme-switch', state => {
    if (options.isShown() || !options.isTopLevel()) {
      return;
    }
    const marker = new state.Token('html_block', '', 0);
    marker.content =
      '<div data-foam-color-scheme-switch="hidden" hidden></div>\n';
    state.tokens.unshift(marker);
  });
  return md;
};

export default markdownItColorSchemeSwitch;
