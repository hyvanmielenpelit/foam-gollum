import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import { INITIAL, parseRawGrammar, Registry, StateStack } from 'vscode-textmate';

/**
 * Tokenizes Markdown with VS Code's Markdown and HTML grammars (from
 * `tm-grammars`) and the extension's injection grammars, as the editor does.
 */

const PACKAGE_DIR = path.join(__dirname, '..', '..');
const req = createRequire(__filename);

type Token = [text: string, scope: string];

/** Label of a tag or link: green (`comment`) in the default themes */
const LABEL = 'comment.line.wikilink.target.markdown.foam';
/** Value of a tag or link: reddish (`string`) in the default themes */
const VALUE = 'string.other.link.title.markdown.foam';
/** Brackets, `|`, `(` and `)` of a tag or link */
const PUNCT = 'punctuation.definition.metadata.markdown.foam';

const PARA = 'meta.paragraph.markdown';
const CELL = 'markup.table.markdown';
const PIPE = 'punctuation.definition.table.markdown';
const HEADING = 'punctuation.definition.heading.markdown';
const SECTION = 'entity.name.section.markdown';
const LIST = 'punctuation.definition.list.begin.markdown';
const QUOTE = 'punctuation.definition.quote.begin.markdown';
/** Text of an HTML block, which has no block scope */
const HTML_TEXT = 'text.html.markdown';

const TAG_BEGIN = 'punctuation.definition.tag.begin.html';
const TAG_END = 'punctuation.definition.tag.end.html';
const TAG_NAME = 'entity.name.tag.html';
const ATTR = 'entity.other.attribute-name.html';

const builtInGrammars: Record<string, string> = {
  'text.html.markdown': 'tm-grammars/grammars/markdown.json',
  'text.html.basic': 'tm-grammars/grammars/html.json',
  'text.html.derivative': 'tm-grammars/grammars/html-derivative.json',
};

const foamGrammars: { path: string; scopeName: string; injectTo: string[] }[] =
  JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'))
    .contributes.grammars;

async function loadMarkdownGrammar() {
  await loadWASM(readFileSync(req.resolve('vscode-oniguruma/release/onig.wasm')));
  const grammarFiles: Record<string, string> = {};
  for (const [scopeName, file] of Object.entries(builtInGrammars)) {
    grammarFiles[scopeName] = req.resolve(file);
  }
  for (const grammar of foamGrammars) {
    grammarFiles[grammar.scopeName] = path.join(PACKAGE_DIR, grammar.path);
  }
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: sources => new OnigScanner(sources),
      createOnigString: text => new OnigString(text),
    }),
    loadGrammar: async scopeName => {
      const file = grammarFiles[scopeName];
      return file ? parseRawGrammar(readFileSync(file, 'utf8'), file) : null;
    },
    getInjections: scopeName =>
      foamGrammars
        .filter(grammar => grammar.injectTo.includes(scopeName))
        .map(grammar => grammar.scopeName),
  });
  const grammar = await registry.loadGrammar('text.html.markdown');
  if (!grammar) {
    throw new Error('The Markdown grammar did not load');
  }
  return grammar;
}

const markdownGrammar = loadMarkdownGrammar();

/**
 * The tokens of the last of `lines`, tokenized in order, as `[text, innermost
 * scope]` pairs without whitespace-only tokens.
 */
async function tokenize(...lines: string[]): Promise<Token[]> {
  const grammar = await markdownGrammar;
  let stack: StateStack = INITIAL;
  let tokens: Token[] = [];
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    tokens = result.tokens
      .map(
        token =>
          [
            line.slice(token.startIndex, token.endIndex),
            token.scopes[token.scopes.length - 1],
          ] as Token
      )
      .filter(([text]) => text.trim() !== '');
  }
  return tokens;
}

const gollumTag = (parts: string[], pipe: string): Token[] =>
  parts.length === 1
    ? [['[[', PUNCT], [parts[0], VALUE], [']]', PUNCT]]
    : [
        ['[[', PUNCT],
        [parts[0], LABEL],
        ['|', pipe],
        [parts[1], VALUE],
        [']]', PUNCT],
      ];
/** A Gollum tag: one part, or a label and a value separated by `|` */
const tag = (...parts: string[]) => gollumTag(parts, PUNCT);
/** A Gollum tag in a table cell, where its `|` separates cells */
const cellTag = (...parts: string[]) => gollumTag(parts, PIPE);

/** A table row with the given cell contents */
const row = (...cells: Token[][]): Token[] => [
  ['|', PIPE],
  ...cells.flatMap(cell => [...cell, ['|', PIPE] as Token]),
];
const X: Token[] = [['x', CELL]];

/** `[label](value)`, or an image when `open` is `![` */
const link = (label: string, value: string, open = '['): Token[] => [
  [open, PUNCT],
  [label, LABEL],
  [']', PUNCT],
  ['(', PUNCT],
  [value, VALUE],
  [')', PUNCT],
];
const image = (alt: string, value: string) => link(alt, value, '![');
/** `[label][ref]`, or an image when `open` is `![` */
const refLink = (label: string, ref: string, open = '['): Token[] => [
  [open, PUNCT],
  [label, LABEL],
  [']', PUNCT],
  ['[', PUNCT],
  [ref, VALUE],
  [']', PUNCT],
];

/** `<name ...attrs>`, where `end` is `>` or `/>` */
const openTag = (name: string, attrs: Token[] = [], end = '>'): Token[] => [
  ['<', TAG_BEGIN],
  [name, TAG_NAME],
  ...attrs,
  [end, TAG_END],
];
const closeTag = (name: string): Token[] => [
  ['</', TAG_BEGIN],
  [name, TAG_NAME],
  ['>', TAG_END],
];
/** `name="value"`, or `name='value'` when `quote` is `'` */
const attr = (name: string, value: string, quote = '"'): Token[] => [
  [name, ATTR],
  ['=', 'punctuation.separator.key-value.html'],
  [quote, 'punctuation.definition.string.begin.html'],
  [value, quote === '"' ? 'string.quoted.double.html' : 'string.quoted.single.html'],
  [quote, 'punctuation.definition.string.end.html'],
];
const entity = (name: string): Token[] => [
  ['&', 'punctuation.definition.entity.html'],
  [name, `constant.character.entity.named.${name}.html`],
  [';', 'punctuation.definition.entity.html'],
];
const htmlComment = (body: string): Token[] => [
  ['<!--', 'punctuation.definition.comment.html'],
  [body, 'comment.block.html'],
  ['-->', 'punctuation.definition.comment.html'],
];

// Regression cases: coloring that already works and must not change.

describe('Gollum tags', () => {
  it('colors a page tag reddish', async () => {
    for (const page of ['Page', '/abs/Page', '../rel/Page']) {
      expect(await tokenize(`[[${page}]]`)).toEqual(tag(page));
      expect(await tokenize(`| [[${page}]] | x |`)).toEqual(row(cellTag(page), X));
    }
  });

  it('colors the label of a page tag green and the page reddish', async () => {
    expect(await tokenize('[[Link text|Page]]')).toEqual(tag('Link text', 'Page'));
    expect(await tokenize('| [[Link text|Page]] | x |')).toEqual(
      row(cellTag('Link text', 'Page'), X)
    );
  });

  it('colors an anchor tag reddish', async () => {
    for (const anchor of ['Page#anchor', '#anchor']) {
      expect(await tokenize(`[[${anchor}]]`)).toEqual(tag(anchor));
      expect(await tokenize(`| [[${anchor}]] | x |`)).toEqual(row(cellTag(anchor), X));
    }
  });

  it('colors an image tag path green and its options reddish', async () => {
    expect(await tokenize('[[image.png]]')).toEqual(tag('image.png'));
    expect(await tokenize('| [[image.png]] | x |')).toEqual(row(cellTag('image.png'), X));
    for (const options of ['frame,alt=Text,align=center', 'float,width=100px']) {
      expect(await tokenize(`[[image.png|${options}]]`)).toEqual(tag('image.png', options));
      expect(await tokenize(`| [[image.png|${options}]] | x |`)).toEqual(
        row(cellTag('image.png', options), X)
      );
    }
  });

  it('colors an external tag URL reddish and its label green', async () => {
    expect(await tokenize('[[http://example.com]]')).toEqual(tag('http://example.com'));
    expect(await tokenize('| [[http://example.com]] | x |')).toEqual(
      row(cellTag('http://example.com'), X)
    );
    expect(await tokenize('[[Text|https://example.com]]')).toEqual(
      tag('Text', 'https://example.com')
    );
    expect(await tokenize('| [[Text|https://example.com]] | x |')).toEqual(
      row(cellTag('Text', 'https://example.com'), X)
    );
  });

  it('colors a file tag file reddish and its label green', async () => {
    expect(await tokenize('[[file.pdf]]')).toEqual(tag('file.pdf'));
    expect(await tokenize('| [[file.pdf]] | x |')).toEqual(row(cellTag('file.pdf'), X));
    expect(await tokenize('[[Text|file.pdf]]')).toEqual(tag('Text', 'file.pdf'));
    expect(await tokenize('| [[Text|file.pdf]] | x |')).toEqual(
      row(cellTag('Text', 'file.pdf'), X)
    );
  });

  it('colors an include tag reddish', async () => {
    expect(await tokenize('[[include:Other Page]]')).toEqual(tag('include:Other Page'));
    expect(await tokenize('| [[include:Other Page]] | x |')).toEqual(
      row(cellTag('include:Other Page'), X)
    );
  });

  it('colors a table of contents tag, with options reddish', async () => {
    expect(await tokenize('[[_TOC_]]')).toEqual(tag('_TOC_'));
    expect(await tokenize('| [[_TOC_]] | x |')).toEqual(row(cellTag('_TOC_'), X));
    expect(await tokenize('[[_TOC_|levels=2]]')).toEqual(tag('_TOC_', 'levels=2'));
    expect(await tokenize('| [[_TOC_|levels=2]] | x |')).toEqual(
      row(cellTag('_TOC_', 'levels=2'), X)
    );
  });

  it('colors a clear floats tag reddish', async () => {
    expect(await tokenize('[[_]]')).toEqual(tag('_'));
    expect(await tokenize('| [[_]] | x |')).toEqual(row(cellTag('_'), X));
  });

  it('colors an escaped tag after a plain quote', async () => {
    expect(await tokenize("'[[escaped]]")).toEqual([["'", PARA], ...tag('escaped')]);
    expect(await tokenize("| '[[escaped]] | x |")).toEqual(
      row([["'", CELL], ...cellTag('escaped')], X)
    );
  });
});

describe('Gollum tags in other blocks', () => {
  it('colors tags in a heading', async () => {
    expect(await tokenize('# Heading [[Page]]')).toEqual([
      ['#', HEADING],
      ['Heading ', SECTION],
      ...tag('Page'),
    ]);
    expect(await tokenize('# Heading [[Text|Page]]')).toEqual([
      ['#', HEADING],
      ['Heading ', SECTION],
      ...tag('Text', 'Page'),
    ]);
  });

  it('colors tags in list items', async () => {
    for (const marker of ['-', '1.']) {
      expect(await tokenize(`${marker} item [[Page]]`)).toEqual([
        [marker, LIST],
        ['item ', PARA],
        ...tag('Page'),
      ]);
      expect(await tokenize(`${marker} item [[Text|Page]]`)).toEqual([
        [marker, LIST],
        ['item ', PARA],
        ...tag('Text', 'Page'),
      ]);
    }
  });

  it('colors tags in a block quote', async () => {
    expect(await tokenize('> quote [[Page]]')).toEqual([
      ['>', QUOTE],
      ['quote ', PARA],
      ...tag('Page'),
    ]);
    expect(await tokenize('> quote [[Text|Page]]')).toEqual([
      ['>', QUOTE],
      ['quote ', PARA],
      ...tag('Text', 'Page'),
    ]);
  });

  it('colors tags inside inline HTML', async () => {
    expect(await tokenize('Inline <span>[[Page]]</span> end.')).toEqual([
      ['Inline ', PARA],
      ...openTag('span'),
      ...tag('Page'),
      ...closeTag('span'),
      [' end.', PARA],
    ]);
    expect(await tokenize('Inline <span>[[Text|Page]]</span> end.')).toEqual([
      ['Inline ', PARA],
      ...openTag('span'),
      ...tag('Text', 'Page'),
      ...closeTag('span'),
      [' end.', PARA],
    ]);
  });
});

describe('Markdown links', () => {
  it('colors the label green and the address reddish', async () => {
    expect(await tokenize('[a](x)')).toEqual(link('a', 'x'));
    expect(await tokenize('| [a](x) | b |')).toEqual(row(link('a', 'x'), [['b', CELL]]));
  });

  it('colors two links on a line separately', async () => {
    expect(await tokenize('[a](x) and [b](y)')).toEqual([
      ...link('a', 'x'),
      [' and ', PARA],
      ...link('b', 'y'),
    ]);
    expect(await tokenize('| [a](x) and [b](y) | c |')).toEqual(
      row([...link('a', 'x'), [' and ', CELL], ...link('b', 'y')], [['c', CELL]])
    );
  });

  it('colors a link title with the address', async () => {
    expect(await tokenize('[t](a "b")')).toEqual(link('t', 'a "b"'));
    expect(await tokenize('| [t](a "b") | c |')).toEqual(
      row(link('t', 'a "b"'), [['c', CELL]])
    );
  });

  it('colors the alt text of an image green and the address reddish', async () => {
    expect(await tokenize('![alt text](x.png)')).toEqual(image('alt text', 'x.png'));
    expect(await tokenize('| ![alt text](x.png) | c |')).toEqual(
      row(image('alt text', 'x.png'), [['c', CELL]])
    );
  });

  it('leaves collapsed and shortcut reference links to the Markdown grammar', async () => {
    const collapsed: Token[] = [
      ['[', 'punctuation.definition.link.title.begin.markdown'],
      ['r', 'string.other.link.title.markdown'],
      [']', 'punctuation.definition.link.title.end.markdown'],
      ['[', 'punctuation.definition.constant.begin.markdown'],
      [']', 'punctuation.definition.constant.end.markdown'],
    ];
    const shortcut = collapsed.slice(0, 3);
    expect(await tokenize('[r][]')).toEqual(collapsed);
    expect(await tokenize('| [r][] | c |')).toEqual(row(collapsed, [['c', CELL]]));
    expect(await tokenize('[r]')).toEqual(shortcut);
    expect(await tokenize('| [r] | c |')).toEqual(row(shortcut, [['c', CELL]]));
  });

  it('colors a footnote reference reddish', async () => {
    expect(await tokenize('Note[^1]')).toEqual([
      ['Note', PARA],
      ['[', PARA],
      ['^1', VALUE],
      [']', PARA],
    ]);
    expect(await tokenize('| Note[^1] | c |')).toEqual(
      row(
        [
          ['Note', CELL],
          ['[', CELL],
          ['^1', VALUE],
          [']', CELL],
        ],
        [['c', CELL]]
      )
    );
  });

  it('colors autolinks as links', async () => {
    const web: Token[] = [
      ['<', 'punctuation.definition.link.markdown'],
      ['https://example.com', 'markup.underline.link.markdown'],
      ['>', 'punctuation.definition.link.markdown'],
    ];
    const email: Token[] = [
      ['<', 'punctuation.definition.link.markdown'],
      ['user@example.com', 'markup.underline.link.markdown'],
      ['>', 'meta.link.email.lt-gt.markdown'],
    ];
    expect(await tokenize('Go <https://example.com> now')).toEqual([
      ['Go ', PARA],
      ...web,
      [' now', PARA],
    ]);
    expect(await tokenize('| <https://example.com> | c |')).toEqual(row(web, [['c', CELL]]));
    expect(await tokenize('Mail <user@example.com> me')).toEqual([
      ['Mail ', PARA],
      ...email,
      [' me', PARA],
    ]);
    expect(await tokenize('| <user@example.com> | c |')).toEqual(row(email, [['c', CELL]]));
  });
});

describe('not links', () => {
  it('leaves task-list checkboxes uncolored by Foam', async () => {
    expect(await tokenize('- [ ] task')).toEqual([
      ['-', LIST],
      ['[ ] task', PARA],
    ]);
    expect(await tokenize('- [x] done')).toEqual([
      ['-', LIST],
      ['[', 'punctuation.definition.link.title.begin.markdown'],
      ['x', 'string.other.link.title.markdown'],
      [']', 'punctuation.definition.link.title.end.markdown'],
      [' done', PARA],
    ]);
  });

  it('leaves link reference definitions to the Markdown grammar', async () => {
    expect(await tokenize('[ref]: http://example.com')).toEqual([
      ['[', 'punctuation.definition.constant.markdown'],
      ['ref', 'constant.other.reference.link.markdown'],
      [']', 'punctuation.definition.constant.markdown'],
      [':', 'punctuation.separator.key-value.markdown'],
      ['http://example.com', 'markup.underline.link.markdown'],
    ]);
    expect(await tokenize('[some-ref]: <http://example.com> "Title"')).toEqual([
      ['[', 'punctuation.definition.constant.markdown'],
      ['some-ref', 'constant.other.reference.link.markdown'],
      [']', 'punctuation.definition.constant.markdown'],
      [':', 'punctuation.separator.key-value.markdown'],
      ['<', 'punctuation.definition.link.markdown'],
      ['http://example.com', 'markup.underline.link.markdown'],
      ['>', 'punctuation.definition.link.markdown'],
      ['"', 'punctuation.definition.string.begin.markdown'],
      ['Title', 'string.other.link.description.title.markdown'],
      ['"', 'punctuation.definition.string.end.markdown'],
    ]);
  });
});

describe('HTML in paragraphs', () => {
  it('colors tags, attributes and quoted values', async () => {
    expect(await tokenize('Text <img src="/x.webp" alt="X" height="13" /> more')).toEqual([
      ['Text ', PARA],
      ...openTag(
        'img',
        [...attr('src', '/x.webp'), ...attr('alt', 'X'), ...attr('height', '13')],
        '/>'
      ),
      [' more', PARA],
    ]);
    expect(await tokenize('Text <br> more')).toEqual([
      ['Text ', PARA],
      ...openTag('br'),
      [' more', PARA],
    ]);
    expect(await tokenize('Text <b>bold</b> more')).toEqual([
      ['Text ', PARA],
      ...openTag('b'),
      ['bold', PARA],
      ...closeTag('b'),
      [' more', PARA],
    ]);
    expect(await tokenize('Text <span class="c">s</span> more')).toEqual([
      ['Text ', PARA],
      ...openTag('span', attr('class', 'c')),
      ['s', PARA],
      ...closeTag('span'),
      [' more', PARA],
    ]);
    expect(await tokenize('Text <a href="/p">a</a> more')).toEqual([
      ['Text ', PARA],
      ...openTag('a', attr('href', '/p')),
      ['a', PARA],
      ...closeTag('a'),
      [' more', PARA],
    ]);
  });

  it('colors entities and comments', async () => {
    expect(await tokenize('Text &amp; more')).toEqual([
      ['Text ', PARA],
      ...entity('amp'),
      [' more', PARA],
    ]);
    expect(await tokenize('Text <!-- c --> more')).toEqual([
      ['Text ', PARA],
      ...htmlComment(' c '),
      [' more', PARA],
    ]);
  });

  it('colors an image link inside inline HTML', async () => {
    expect(await tokenize('Wrapped <div>![i](y)</div> end.')).toEqual([
      ['Wrapped ', PARA],
      ...openTag('div'),
      ...image('i', 'y'),
      ...closeTag('div'),
      [' end.', PARA],
    ]);
  });
});

describe('Table cells without HTML', () => {
  it('leaves a lone less-than sign uncolored', async () => {
    expect(await tokenize('| 1 < 2 | x |')).toEqual(
      row(
        [
          ['1 ', CELL],
          ['<', 'meta.other.valid-bracket.markdown'],
          [' 2', CELL],
        ],
        X
      )
    );
  });

  it('leaves HTML and tags in inline code uncolored', async () => {
    const raw = (text: string): Token[] => [
      ['`', 'punctuation.definition.raw.markdown'],
      [text, 'markup.inline.raw.string.markdown'],
      ['`', 'punctuation.definition.raw.markdown'],
    ];
    expect(await tokenize('| `<code>` | `[[Page]]` | x |')).toEqual(
      row(raw('<code>'), raw('[[Page]]'), X)
    );
  });

  it('colors emphasis', async () => {
    expect(await tokenize('| **b** | *i* | ~~s~~ | x |')).toEqual(
      row(
        [
          ['**', 'punctuation.definition.bold.markdown'],
          ['b', 'markup.bold.markdown'],
          ['**', 'punctuation.definition.bold.markdown'],
        ],
        [
          ['*', 'punctuation.definition.italic.markdown'],
          ['i', 'markup.italic.markdown'],
          ['*', 'punctuation.definition.italic.markdown'],
        ],
        [
          ['~~', 'punctuation.definition.strikethrough.markdown'],
          ['s', 'markup.strikethrough.markdown'],
          ['~~', 'punctuation.definition.strikethrough.markdown'],
        ],
        X
      )
    );
  });

  it('keeps an escaped pipe in its cell', async () => {
    expect(await tokenize('| a \\| b | x |')).toEqual(row([['a \\| b', CELL]], X));
  });

  it('colors the separator row', async () => {
    const separator = (text: string): Token[] => [[text, 'punctuation.separator.table.markdown']];
    expect(await tokenize('| --- | :---: | ---: |')).toEqual(
      row(separator('---'), separator(':---:'), separator('---:'))
    );
  });
});

describe('code and comments stay uncolored', () => {
  const content = '[[Page]] ![i](y)';

  it('in fenced code blocks', async () => {
    expect(await tokenize('```', content)).toEqual([
      [content, 'markup.fenced_code.block.markdown'],
    ]);
    expect(await tokenize('```js', content)).toEqual([
      [content, 'markup.fenced_code.block.markdown'],
    ]);
  });

  it('in an indented code block', async () => {
    expect(await tokenize('Para.', '', `    ${content}`)).toEqual([
      [content, 'markup.raw.block.markdown'],
    ]);
  });

  it('in an inline code span', async () => {
    expect(await tokenize(`Code \`${content}\` end.`)).toEqual([
      ['Code ', PARA],
      ['`', 'punctuation.definition.raw.markdown'],
      [content, 'markup.inline.raw.string.markdown'],
      ['`', 'punctuation.definition.raw.markdown'],
      [' end.', PARA],
    ]);
  });

  it('in a multi-line HTML comment', async () => {
    expect(await tokenize('<!--', content)).toEqual([[content, 'comment.block.html']]);
  });

  it('in the title of a link reference definition', async () => {
    expect(await tokenize('[ref]: http://example.com "[[Title]]"')).toEqual([
      ['[', 'punctuation.definition.constant.markdown'],
      ['ref', 'constant.other.reference.link.markdown'],
      [']', 'punctuation.definition.constant.markdown'],
      [':', 'punctuation.separator.key-value.markdown'],
      ['http://example.com', 'markup.underline.link.markdown'],
      ['"', 'punctuation.definition.string.begin.markdown'],
      ['[[Title]]', 'string.other.link.description.title.markdown'],
      ['"', 'punctuation.definition.string.end.markdown'],
    ]);
  });
});

// Fix cases.

const STEAM_PATH = '/uploads/Modern%20Windows%20Version%20(Steam)/change-locale-1.webp';
const STEAM_IMAGE = `![change-locale-1](${STEAM_PATH})`;

describe('links with parentheses in the URL', () => {
  it('colors the whole address reddish', async () => {
    expect(await tokenize(STEAM_IMAGE)).toEqual(image('change-locale-1', STEAM_PATH));
    expect(await tokenize('[b](x(y)z)')).toEqual(link('b', 'x(y)z'));
  });

  it('colors the whole address in a table cell', async () => {
    expect(await tokenize(`| ${STEAM_IMAGE} | x |`)).toEqual(
      row(image('change-locale-1', STEAM_PATH), X)
    );
  });

  it('colors the whole address in a heading, a list item and a block quote', async () => {
    expect(await tokenize(`# Heading ${STEAM_IMAGE}`)).toEqual([
      ['#', HEADING],
      ['Heading ', SECTION],
      ...image('change-locale-1', STEAM_PATH),
    ]);
    expect(await tokenize(`- item ${STEAM_IMAGE}`)).toEqual([
      ['-', LIST],
      ['item ', PARA],
      ...image('change-locale-1', STEAM_PATH),
    ]);
    expect(await tokenize(`> quote ${STEAM_IMAGE}`)).toEqual([
      ['>', QUOTE],
      ['quote ', PARA],
      ...image('change-locale-1', STEAM_PATH),
    ]);
  });
});

describe('Gollum tag followed by a Markdown link on the same line', () => {
  it('colors the tag and the link separately in a paragraph', async () => {
    expect(await tokenize('See [[Page]] and [a](x) here.')).toEqual([
      ['See ', PARA],
      ...tag('Page'),
      [' and ', PARA],
      ...link('a', 'x'),
      [' here.', PARA],
    ]);
    expect(await tokenize('See [[Text|Page]] and ![i](y.png) here.')).toEqual([
      ['See ', PARA],
      ...tag('Text', 'Page'),
      [' and ', PARA],
      ...image('i', 'y.png'),
      [' here.', PARA],
    ]);
    expect(await tokenize('See [[image.png|frame,alt=A]] and [a](x(y)) here.')).toEqual([
      ['See ', PARA],
      ...tag('image.png', 'frame,alt=A'),
      [' and ', PARA],
      ...link('a', 'x(y)'),
      [' here.', PARA],
    ]);
  });

  it('colors the tag and the link separately in a table cell', async () => {
    expect(await tokenize('| [[Page]] and [a](x) | b |')).toEqual(
      row([...cellTag('Page'), [' and ', CELL], ...link('a', 'x')], [['b', CELL]])
    );
  });

  it('colors the tag and the link separately in a heading', async () => {
    expect(await tokenize('# See [[Page]] and [a](x)')).toEqual([
      ['#', HEADING],
      ['See ', SECTION],
      ...tag('Page'),
      [' and ', SECTION],
      ...link('a', 'x'),
    ]);
  });

  it('colors the tag and the link separately inside inline HTML', async () => {
    expect(await tokenize('Inline <span>[[Page]]</span> <a href="x">![i](y)</a>')).toEqual([
      ['Inline ', PARA],
      ...openTag('span'),
      ...tag('Page'),
      ...closeTag('span'),
      ...openTag('a', attr('href', 'x')),
      ...image('i', 'y'),
      ...closeTag('a'),
    ]);
  });

  it('colors a tag, a reference link and a link on one line', async () => {
    expect(await tokenize('Mixed [[Text|Page]] then [r][ref] then [a](x).')).toEqual([
      ['Mixed ', PARA],
      ...tag('Text', 'Page'),
      [' then ', PARA],
      ...refLink('r', 'ref'),
      [' then ', PARA],
      ...link('a', 'x'),
      ['.', PARA],
    ]);
  });
});

describe('reference links', () => {
  it('colors the label green and the reference reddish', async () => {
    expect(await tokenize('[r][ref]')).toEqual(refLink('r', 'ref'));
    expect(await tokenize('[Label text][some-ref]')).toEqual(
      refLink('Label text', 'some-ref')
    );
    expect(await tokenize('![alt][logo]')).toEqual(refLink('alt', 'logo', '!['));
  });

  it('colors a reference link after a task-list checkbox', async () => {
    expect(await tokenize('- [ ] task [r][ref]')).toEqual([
      ['-', LIST],
      ['[ ] task ', PARA],
      ...refLink('r', 'ref'),
    ]);
  });

  it('colors reference links in table cells', async () => {
    expect(await tokenize('| [r][ref] | [Label][ref] | ![alt][logo] |')).toEqual(
      row(refLink('r', 'ref'), refLink('Label', 'ref'), refLink('alt', 'logo', '!['))
    );
  });
});

describe('HTML in table cells', () => {
  it('colors an image tag, its attributes and quoted values', async () => {
    expect(
      await tokenize(
        '| <img src="/uploads/x/us-flag.webp" alt="US Flag" height="13" /> English only | x |'
      )
    ).toEqual(
      row(
        [
          ...openTag(
            'img',
            [
              ...attr('src', '/uploads/x/us-flag.webp'),
              ...attr('alt', 'US Flag'),
              ...attr('height', '13'),
            ],
            '/>'
          ),
          [' English only', CELL],
        ],
        X
      )
    );
  });

  it('colors elements as in a paragraph', async () => {
    expect(await tokenize('| <br> | x |')).toEqual(row(openTag('br'), X));
    for (const name of ['b', 'kbd', 'sup']) {
      expect(await tokenize(`| <${name}>t</${name}> | x |`)).toEqual(
        row([...openTag(name), ['t', CELL], ...closeTag(name)], X)
      );
    }
    expect(await tokenize('| <span class="c">s</span> | x |')).toEqual(
      row([...openTag('span', attr('class', 'c')), ['s', CELL], ...closeTag('span')], X)
    );
    expect(await tokenize('| <a href="/p">a</a> | x |')).toEqual(
      row([...openTag('a', attr('href', '/p')), ['a', CELL], ...closeTag('a')], X)
    );
    expect(await tokenize('| <details><summary>S</summary>D</details> | x |')).toEqual(
      row(
        [
          ...openTag('details'),
          ...openTag('summary'),
          ['S', CELL],
          ...closeTag('summary'),
          ['D', CELL],
          ...closeTag('details'),
        ],
        X
      )
    );
    expect(await tokenize('| <video src="/v.mp4" controls></video> | x |')).toEqual(
      row(
        [
          ...openTag('video', [...attr('src', '/v.mp4'), ['controls', ATTR]]),
          ...closeTag('video'),
        ],
        X
      )
    );
  });

  it('colors single-quoted values, upper-case tags and custom elements', async () => {
    expect(await tokenize("| <img src='/single.png'> | x |")).toEqual(
      row(openTag('img', attr('src', '/single.png', "'")), X)
    );
    expect(await tokenize('| <IMG SRC="/upper.png"> | x |')).toEqual(
      row(openTag('IMG', attr('SRC', '/upper.png')), X)
    );
    expect(await tokenize('| <custom-tag x="1">y</custom-tag> | x |')).toEqual(
      row(
        [...openTag('custom-tag', attr('x', '1')), ['y', CELL], ...closeTag('custom-tag')],
        X
      )
    );
  });

  it('colors entities and comments', async () => {
    expect(await tokenize('| &amp; &nbsp; | x |')).toEqual(
      row([...entity('amp'), ...entity('nbsp')], X)
    );
    expect(await tokenize('| <!-- c --> | x |')).toEqual(row(htmlComment(' c '), X));
  });

  it('colors HTML around Gollum tags', async () => {
    expect(
      await tokenize('| <span>[[Page]]</span> | <span>[[Text|Page]]</span> |')
    ).toEqual(
      row(
        [...openTag('span'), ...cellTag('Page'), ...closeTag('span')],
        [...openTag('span'), ['[[', PUNCT], ['Text', LABEL]],
        [['Page', VALUE], [']]', PUNCT], ...closeTag('span')]
      )
    );
  });

  it('colors HTML around a Markdown image', async () => {
    expect(await tokenize('| <a href="x">![i](y)</a> | z |')).toEqual(
      row(
        [...openTag('a', attr('href', 'x')), ...image('i', 'y'), ...closeTag('a')],
        [['z', CELL]]
      )
    );
  });
});

describe('Gollum tags and links in HTML blocks', () => {
  it('colors tags and links on a line of an HTML block', async () => {
    expect(
      await tokenize(
        '<div>',
        '[[Text|Page]] and ![i](a(b).png) and [[Page]] then [a](x) <b>x</b>'
      )
    ).toEqual([
      ...tag('Text', 'Page'),
      [' and ', HTML_TEXT],
      ...image('i', 'a(b).png'),
      [' and ', HTML_TEXT],
      ...tag('Page'),
      [' then ', HTML_TEXT],
      ...link('a', 'x'),
      ...openTag('b'),
      ['x', HTML_TEXT],
      ...closeTag('b'),
    ]);
  });

  it('colors tags and links between the tags of an HTML block', async () => {
    expect(await tokenize('<div>![i](y) [[Page]]</div>')).toEqual([
      ...openTag('div'),
      ...image('i', 'y'),
      ...tag('Page'),
      ...closeTag('div'),
    ]);
    expect(await tokenize('<details>', '<summary>[[Page]]</summary>')).toEqual([
      ...openTag('summary'),
      ...tag('Page'),
      ...closeTag('summary'),
    ]);
  });

  it('colors tags and links in a pre block', async () => {
    expect(await tokenize('<pre>', '[[Pre]] ![i](y)')).toEqual([
      ...tag('Pre'),
      ...image('i', 'y'),
    ]);
  });

  it('leaves attribute values and comments uncolored', async () => {
    expect(
      await tokenize('<div>', '<p><img alt="[[Alt]]" src="x"> <!-- [[Comment]] --></p>')
    ).toEqual([
      ...openTag('p'),
      ...openTag('img', [...attr('alt', '[[Alt]]'), ...attr('src', 'x')]),
      ...htmlComment(' [[Comment]] '),
      ...closeTag('p'),
    ]);
  });
});

describe('intended changes', () => {
  it('colors a less-than sign before a letter in a table cell as a tag', async () => {
    expect(await tokenize('| a<b | x |')).toEqual(
      row(
        [
          ['a', CELL],
          ['<', TAG_BEGIN],
          ['b', TAG_NAME],
        ],
        X
      )
    );
  });

  it('colors a linked image as one link with the image as its label', async () => {
    expect(await tokenize('[![alt](img.png)](target)')).toEqual(
      link('![alt](img.png)', 'target')
    );
  });

  it('colors [a]b](x) as a shortcut reference link followed by text', async () => {
    expect(await tokenize('[a]b](x)')).toEqual([
      ['[', 'punctuation.definition.link.title.begin.markdown'],
      ['a', 'string.other.link.title.markdown'],
      [']', 'punctuation.definition.link.title.end.markdown'],
      ['b](x)', PARA],
    ]);
  });

  it('colors a tag in code inside an HTML block', async () => {
    expect(await tokenize('<div>', '<code>[[Code]]</code>')).toEqual([
      ...openTag('code'),
      ...tag('Code'),
      ...closeTag('code'),
    ]);
  });
});

describe('paragraphs that start with a tag or a link', () => {
  it('keep Markdown and HTML coloring after the tag or link', async () => {
    expect(await tokenize('[[Page]] then **b** and <b>x</b>')).toEqual([
      ...tag('Page'),
      [' then ', PARA],
      ['**', 'punctuation.definition.bold.markdown'],
      ['b', 'markup.bold.markdown'],
      ['**', 'punctuation.definition.bold.markdown'],
      [' and ', PARA],
      ...openTag('b'),
      ['x', PARA],
      ...closeTag('b'),
    ]);
    expect(await tokenize('[a](x) then *i*')).toEqual([
      ...link('a', 'x'),
      [' then ', PARA],
      ['*', 'punctuation.definition.italic.markdown'],
      ['i', 'markup.italic.markdown'],
      ['*', 'punctuation.definition.italic.markdown'],
    ]);
  });

  it('keep Markdown coloring on a continuation line', async () => {
    expect(await tokenize('Para', '[[Page]] then **b**')).toEqual([
      ...tag('Page'),
      [' then ', PARA],
      ['**', 'punctuation.definition.bold.markdown'],
      ['b', 'markup.bold.markdown'],
      ['**', 'punctuation.definition.bold.markdown'],
    ]);
  });
});
