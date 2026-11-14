import MarkdownIt from 'markdown-it';
import { markdownItColorSchemeSwitch } from './color-scheme-switch';

const MARKER = '<div data-foam-color-scheme-switch="hidden" hidden></div>\n';
const INPUT = '# Title\n\nSome *text* and a [link](https://example.com).\n';

const createMd = (isShown: boolean, isTopLevel = true) =>
  markdownItColorSchemeSwitch(MarkdownIt({ html: true }), {
    isShown: () => isShown,
    isTopLevel: () => isTopLevel,
  });

describe('markdownItColorSchemeSwitch', () => {
  it('renders nothing extra when the switch is shown', () => {
    const md = createMd(true);
    expect(md.render(INPUT)).toEqual(MarkdownIt({ html: true }).render(INPUT));
  });

  it('renders the hidden marker as the first element when the switch is hidden', () => {
    const md = createMd(false);
    expect(md.render(INPUT).startsWith(MARKER)).toBe(true);
  });

  it('renders no marker for a non-top-level render', () => {
    const md = createMd(false, false);
    expect(md.render(INPUT)).not.toContain('data-foam-color-scheme-switch');
  });

  it('leaves the rest of the output identical when the switch is hidden', () => {
    const md = createMd(false);
    const plain = MarkdownIt({ html: true }).render(INPUT);
    expect(md.render(INPUT)).toEqual(MARKER + plain);
  });

  it('reads the setting on every render', () => {
    let isShown = true;
    const md = markdownItColorSchemeSwitch(MarkdownIt({ html: true }), {
      isShown: () => isShown,
      isTopLevel: () => true,
    });
    expect(md.render(INPUT)).not.toContain(MARKER);
    isShown = false;
    expect(md.render(INPUT)).toContain(MARKER);
  });
});
