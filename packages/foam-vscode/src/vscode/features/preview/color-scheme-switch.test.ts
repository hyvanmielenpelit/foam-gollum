import MarkdownIt from 'markdown-it';
import {
  ColorScheme,
  getEffectiveColorScheme,
  getForcedColorScheme,
  markdownItColorSchemeSwitch,
} from './color-scheme-switch';

const marker = (scheme: string) =>
  `<div data-foam-preview-color-scheme="${scheme}" hidden></div>\n`;
const INPUT = '# Title\n\nSome *text* and a [link](https://example.com).\n';

const createMd = (forced: unknown, isTopLevel = true) =>
  markdownItColorSchemeSwitch(MarkdownIt({ html: true }), {
    getForcedColorScheme: () => forced as ColorScheme | undefined,
    isTopLevel: () => isTopLevel,
  });

describe('getEffectiveColorScheme', () => {
  it('follows a light theme while the setting is auto', () => {
    expect(getEffectiveColorScheme('auto', true)).toBe('light');
  });

  it('follows a dark theme while the setting is auto', () => {
    expect(getEffectiveColorScheme('auto', false)).toBe('dark');
  });

  it('keeps an explicit light or dark whatever the theme', () => {
    expect(getEffectiveColorScheme('light', false)).toBe('light');
    expect(getEffectiveColorScheme('light', true)).toBe('light');
    expect(getEffectiveColorScheme('dark', true)).toBe('dark');
    expect(getEffectiveColorScheme('dark', false)).toBe('dark');
  });

  it('treats an unknown or missing value as auto', () => {
    expect(getEffectiveColorScheme('sepia', true)).toBe('light');
    expect(getEffectiveColorScheme(undefined, false)).toBe('dark');
    expect(getEffectiveColorScheme(42, true)).toBe('light');
  });
});

describe('getForcedColorScheme', () => {
  it('returns an explicit light or dark while the switch is shown', () => {
    expect(getForcedColorScheme('light', true)).toBe('light');
    expect(getForcedColorScheme('dark', true)).toBe('dark');
  });

  it('returns nothing for auto or an unknown value', () => {
    expect(getForcedColorScheme('auto', true)).toBeUndefined();
    expect(getForcedColorScheme('sepia', true)).toBeUndefined();
    expect(getForcedColorScheme(undefined, true)).toBeUndefined();
  });

  it('returns nothing while the switch is hidden', () => {
    expect(getForcedColorScheme('light', false)).toBeUndefined();
    expect(getForcedColorScheme('dark', false)).toBeUndefined();
  });
});

describe('markdownItColorSchemeSwitch', () => {
  it('renders nothing extra without a forced scheme', () => {
    const md = createMd(undefined);
    expect(md.render(INPUT)).toEqual(MarkdownIt({ html: true }).render(INPUT));
  });

  it('renders the scheme marker as the first element when a scheme is forced', () => {
    expect(createMd('light').render(INPUT).startsWith(marker('light'))).toBe(
      true
    );
    expect(createMd('dark').render(INPUT).startsWith(marker('dark'))).toBe(
      true
    );
  });

  it('renders no marker for a value that is not light or dark', () => {
    const md = createMd('"><script>alert(1)</script>');
    expect(md.render(INPUT)).toEqual(MarkdownIt({ html: true }).render(INPUT));
  });

  it('renders no marker for a non-top-level render', () => {
    const md = createMd('dark', false);
    expect(md.render(INPUT)).not.toContain('data-foam-preview-color-scheme');
  });

  it('leaves the rest of the output identical', () => {
    const md = createMd('dark');
    const plain = MarkdownIt({ html: true }).render(INPUT);
    expect(md.render(INPUT)).toEqual(marker('dark') + plain);
  });

  it('reads the forced scheme on every render', () => {
    let forced: ColorScheme | undefined = undefined;
    const md = markdownItColorSchemeSwitch(MarkdownIt({ html: true }), {
      getForcedColorScheme: () => forced,
      isTopLevel: () => true,
    });
    expect(md.render(INPUT)).not.toContain('data-foam-preview-color-scheme');
    forced = 'light';
    expect(md.render(INPUT)).toContain(marker('light'));
    forced = 'dark';
    expect(md.render(INPUT)).toContain(marker('dark'));
  });
});
