import { generateLinkReferences } from './generate-link-references';
import { createTestNote, createTestWorkspace } from '../../test/test-utils';
import { Logger } from '../utils/log';
import { URI } from '../model/uri';
import { EOL } from 'os';
import { createMarkdownParser } from '../services/markdown-parser';
import { TextEdit } from '../services/text-edit';
import { Config, DefaultFoamConfig } from '../config';

Logger.setLevel('error');

function textForNote(text: string): string {
  return text.split('\n').join(EOL);
}

describe('generateLinkReferences', () => {
  const parser = createMarkdownParser();

  interface TestCase {
    case: string;
    input: string;
    expected: string;
  }

  const testCases: TestCase[] = [
    {
      case: 'should add link references for wikilinks present in note',
      input: `
# Index
[[doc1]] [[doc2]] [[file-without-title]]
`,
      expected: `
# Index
[[doc1]] [[doc2]] [[file-without-title]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
[file-without-title]: file-without-title "file-without-title"
`,
    },
    {
      case: '#1558 - should keep a blank line before link references',
      input: `
# Test

[[doc1]]

[[doc2]]



`,
      expected: `
# Test

[[doc1]]

[[doc2]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
    },
    {
      case: 'should remove obsolete link definitions',
      input: `
# Document
Some content here.
[doc1]: doc1 "First"
`,
      expected: `
# Document
Some content here.
`,
    },
    {
      case: 'should add and remove link definitions as needed',
      input: `
# First Document

Here's some [unrelated] content.

[unrelated]: http://unrelated.com 'This link should not be changed'

[[file-without-title]]

[doc2]: doc2 'Second Document'
`,
      expected: `
# First Document

Here's some [unrelated] content.

[unrelated]: http://unrelated.com 'This link should not be changed'

[[file-without-title]]

[file-without-title]: file-without-title "file-without-title"
`,
    },
    {
      case: 'should not change correct link references',
      input: `
# Third Document
All the link references are correct in this file.

[[doc1]]
[[doc2]]


[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
      expected: `
# Third Document
All the link references are correct in this file.

[[doc1]]
[[doc2]]


[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
    },
    {
      case: 'should put links with spaces in angel brackets',
      input: `
# Angel reference

[[Angel note]]
`,
      expected: `
# Angel reference

[[Angel note]]

[Angel note]: <Angel note> "Angel note"
`,
    },
    {
      case: 'should not remove explicitly entered link references',
      input: `
# File with explicit link references

A Bug [^footerlink]. Here is [Another link][linkreference]

[^footerlink]: https://foam.md/

[linkreference]: https://foam.md/
`,
      expected: `
# File with explicit link references

A Bug [^footerlink]. Here is [Another link][linkreference]

[^footerlink]: https://foam.md/

[linkreference]: https://foam.md/
`,
    },
    {
      case: 'should not change explicitly entered link references',
      input: `
# File with explicit link references

A Bug [^footerlink]. Here is [Another link][linkreference].
I also want a [[doc1]].

[^footerlink]: https://foam.md/

[linkreference]: https://foam.md/
`,
      expected: `
# File with explicit link references

A Bug [^footerlink]. Here is [Another link][linkreference].
I also want a [[doc1]].

[^footerlink]: https://foam.md/

[linkreference]: https://foam.md/

[doc1]: doc1 "First"
`,
    },
    {
      case: 'should handle empty file with no wikilinks and no definitions',
      input: `
# Empty Document

Just some text without any links.
`,
      expected: `
# Empty Document

Just some text without any links.
`,
    },
    {
      case: 'should handle wikilinks with aliases',
      input: `
# Document with aliases

[[doc1|Custom Alias]] and [[doc2|Another Alias]]
`,
      expected: `
# Document with aliases

[[doc1|Custom Alias]] and [[doc2|Another Alias]]

[doc1|Custom Alias]: doc1 "First"
[doc2|Another Alias]: doc2 "Second"
`,
    },
    {
      case: 'should generate only one definition for multiple references to the same link',
      input: `
# Multiple references

First mention: [[doc1]]
Second mention: [[doc1]]
Third mention: [[doc1]]
`,
      expected: `
# Multiple references

First mention: [[doc1]]
Second mention: [[doc1]]
Third mention: [[doc1]]

[doc1]: doc1 "First"
`,
    },
    {
      case: 'should handle link definitions in the middle of content',
      input: `
# Document

[[doc1]]

[doc1]: doc1 "First"

Some more content here.

[[doc2]]
`,
      expected: `
# Document

[[doc1]]

[doc1]: doc1 "First"

Some more content here.

[[doc2]]

[doc2]: doc2 "Second"
`,
    },
    {
      case: 'should handle orphaned wikilinks without corresponding notes',
      input: `
# Document with broken links

[[doc1]] [[nonexistent]] [[another-missing]]
`,
      expected: `
# Document with broken links

[[doc1]] [[nonexistent]] [[another-missing]]

[doc1]: doc1 "First"
`,
    },
    {
      case: 'should handle file with only blank lines at end',
      input: `

`,
      expected: `

`,
    },
    {
      case: 'should handle empty files',
      input: '',
      expected: '',
    },
    {
      case: 'should handle link definitions with different quote styles',
      input: `
# Mixed quotes

[[doc1]] [[doc2]]

[doc1]: doc1 'First'
[doc2]: doc2 "Second"
`,
      expected: `
# Mixed quotes

[[doc1]] [[doc2]]

[doc1]: doc1 'First'
[doc2]: doc2 "Second"
`,
    },
    {
      case: '#1601 - should append new link references to existing ones without blank lines',
      input: `
[[doc1]] [[doc2]]

[doc1]: doc1 "First"
`,
      expected: `
[[doc1]] [[doc2]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
    },
    {
      case: '#1622 - should not remove external hyperlink reference when it is referenced in the body',
      input: `
I link to an [interesting external topic][1] and an [[doc1]]

[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"
`,
      expected: `
I link to an [interesting external topic][1] and an [[doc1]]

[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"

[doc1]: doc1 "First"
`,
    },
    {
      case: '#1622 - should not remove orphan external hyperlink reference definition',
      input: `
# My Note

Some content here.

[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"
`,
      expected: `
# My Note

Some content here.

[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"
`,
    },
    {
      case: 'should remove multiple consecutive stale definitions without leaving blank lines',
      input: `
[[doc1]]

[stale1]: stale1 "Stale1"
[stale2]: stale2 "Stale2"
`,
      expected: `
[[doc1]]

[doc1]: doc1 "First"
`,
    },
    {
      case: 'should remove stale definition between two kept definitions without leaving a blank line',
      input: `
[[doc1]] [[doc2]]

[doc1]: doc1 "First"
[stale]: stale "Stale"
[doc2]: doc2 "Second"
`,
      expected: `
[[doc1]] [[doc2]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
    },
    {
      case: 'should add new definition with blank line when stale was the only existing definition',
      input: `
[[doc1]]

[stale]: stale "Stale"
`,
      expected: `
[[doc1]]

[doc1]: doc1 "First"
`,
    },
    {
      case: 'should append new definition without blank line when stale was first in a block with kept definitions after',
      input: `
[[doc1]] [[doc2]]

[stale]: stale "Stale"
[doc1]: doc1 "First"
`,
      expected: `
[[doc1]] [[doc2]]

[doc1]: doc1 "First"
[doc2]: doc2 "Second"
`,
    },
    {
      case: '#1622 - should remove stale wikilink definition but preserve orphan external definition',
      input: `
# My Note

Some content here.

[doc2]: doc2 "Second"
[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"
`,
      expected: `
# My Note

Some content here.

[1]: <http://test.com/my-interesting-but-long-external-topic-link> "Interesting Topic"
`,
    },
  ];

  testCases.forEach(testCase => {
    it(testCase.case, async () => {
      const workspace = createTestWorkspace([URI.file('/')]);
      const workspaceNotes = [
        { uri: '/doc1.md', title: 'First' },
        { uri: '/doc2.md', title: 'Second' },
        { uri: '/file-without-title.md', title: 'file-without-title' },
        { uri: '/Angel note.md', title: 'Angel note' },
      ];
      workspaceNotes.forEach(note => {
        workspace.set(createTestNote({ uri: note.uri, title: note.title }));
      });

      const noteText = testCase.input;
      const note = parser.parse(URI.file('/note.md'), textForNote(noteText));
      const actual = await generateLinkReferences(
        note,
        noteText,
        '\n',
        workspace,
        false
      );
      const updated = TextEdit.apply(noteText, actual);

      expect(updated.replace(/\r\n/g, '\n')).toBe(textForNote(testCase.expected).replace(/\r\n/g, '\n'));
    });
  });
});

describe('generateLinkReferences with Gollum syntax', () => {
  const parser = createMarkdownParser();

  beforeEach(() => {
    Config.setDefaultConfig(
      Object.assign(new DefaultFoamConfig(), {
        getWikilinksSyntax: () => 'gollum' as const,
        getWikilinksCaseInsensitive: () => true,
      })
    );
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  /** `text` with LF line endings, whatever the line endings of this file. */
  const lf = (text: string) => text.replace(/\r\n/g, '\n');

  /** `text` of `/wiki/a/note.md`, in LF, with its link references updated. */
  const updateReferences = (text: string) => {
    const noteText = lf(text);
    const workspace = createTestWorkspace([URI.file('/wiki')]);
    [
      { uri: '/wiki/a/Page.md', title: 'Page' },
      { uri: '/wiki/a/Other.md', title: 'Other' },
      { uri: '/wiki/Other.md', title: 'Decoy' },
      { uri: '/wiki/Top.md', title: 'Top' },
    ].forEach(note => {
      workspace.set(createTestNote({ uri: note.uri, title: note.title }));
    });
    const note = parser.parse(URI.file('/wiki/a/note.md'), noteText);
    workspace.set(note);
    const edits = generateLinkReferences(
      note,
      noteText,
      '\n',
      workspace,
      false
    );
    return TextEdit.apply(noteText, edits);
  };

  it('adds definitions labeled with the link text, with targets relative to the note', () => {
    expect(
      updateReferences(`
# Index
[[Page]] [[Shown Name|Other]] [[/Top]] [[../Top]]
`)
    ).toBe(
      lf(`
# Index
[[Page]] [[Shown Name|Other]] [[/Top]] [[../Top]]

[Page]: Page "Page"
[Shown Name|Other]: Other "Other"
[/Top]: ../Top "Top"
[../Top]: ../Top "Top"
`)
    );
  });

  it('does not change correct link references', () => {
    const text = `
# Index
[[Page]] [[Shown Name|Other]] [[/Top]] [[../Top]]

[Page]: Page "Page"
[Shown Name|Other]: Other "Other"
[/Top]: ../Top "Top"
[../Top]: ../Top "Top"
`;
    expect(updateReferences(text)).toBe(lf(text));
  });

  it('replaces the definition of a link written with the target first', () => {
    expect(
      updateReferences(`
# Index
[[Shown Name|Other]]

[Other|Shown Name]: Other "Other"
`)
    ).toBe(
      lf(`
# Index
[[Shown Name|Other]]

[Shown Name|Other]: Other "Other"
`)
    );
  });
});
