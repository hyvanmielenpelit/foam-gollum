/*global markdownit:readonly*/

export const CONFIG_SHOW_COLOR_SCHEME_SWITCH = 'preview.showColorSchemeSwitch';
export const CONFIG_PREVIEW_COLOR_SCHEME = 'preview.colorScheme';

export type ColorScheme = 'light' | 'dark';

/** The scheme the setting chooses; anything but `light` or `dark` chooses none. */
function getChosenColorScheme(setting: unknown): ColorScheme | undefined {
  return setting === 'light' || setting === 'dark' ? setting : undefined;
}

/** The switch position: the chosen scheme, or the theme's kind while none is chosen. */
export function getEffectiveColorScheme(
  setting: unknown,
  isLightTheme: boolean
): ColorScheme {
  return getChosenColorScheme(setting) ?? (isLightTheme ? 'light' : 'dark');
}

/** The scheme previews are forced into: the chosen one, while the switch is shown. */
export function getForcedColorScheme(
  setting: unknown,
  isSwitchShown: boolean
): ColorScheme | undefined {
  return isSwitchShown ? getChosenColorScheme(setting) : undefined;
}

/**
 * Tells the preview's color scheme script (static/preview/color-scheme.js)
 * which scheme to force, by rendering a hidden marker element first that
 * carries it. Nothing is rendered without a forced scheme, nor for embedded
 * content.
 */
export const markdownItColorSchemeSwitch = (
  md: markdownit,
  options: {
    getForcedColorScheme: () => ColorScheme | undefined;
    isTopLevel: () => boolean;
  }
) => {
  md.core.ruler.push('foam-color-scheme-switch', state => {
    const scheme = options.getForcedColorScheme();
    // Written into raw HTML, so only the two known values get through.
    if ((scheme !== 'light' && scheme !== 'dark') || !options.isTopLevel()) {
      return;
    }
    const marker = new state.Token('html_block', '', 0);
    marker.content = `<div data-foam-preview-color-scheme="${scheme}" hidden></div>\n`;
    state.tokens.unshift(marker);
  });
  return md;
};

export default markdownItColorSchemeSwitch;
