import { createTestWorkspace, InMemoryDataStore } from '../../test/test-utils';
import { Config, DefaultFoamConfig } from '../config';
import { FoamGraph } from '../model/graph';
import { URI } from '../model/uri';
import { createMarkdownParser } from '../services/markdown-parser';
import { renameNote, renameSection } from './rename';

const parser = createMarkdownParser();
const wikiRoot = URI.file('/wiki');

/**
 * A workspace at `/wiki` holding `files`, keyed by their path under it, with
 * a graph of their links and a data store holding their text.
 */
const createWiki = (files: Record<string, string>) => {
  const dataStore = new InMemoryDataStore();
  const workspace = createTestWorkspace([wikiRoot], dataStore);
  for (const [path, text] of Object.entries(files)) {
    const uri = wikiRoot.joinPath(path);
    dataStore.set(uri, text);
    workspace.set(parser.parse(uri, text));
  }
  return {
    dataStore,
    workspace,
    graph: FoamGraph.fromWorkspace(workspace),
    find: (path: string) => workspace.find(wikiRoot.joinPath(path))!,
    read: (path: string) => dataStore.read(wikiRoot.joinPath(path)),
  };
};

const useSyntax = (syntax: 'mediawiki' | 'gollum') =>
  Config.setDefaultConfig(
    Object.assign(new DefaultFoamConfig(), {
      getWikilinksSyntax: () => syntax,
      getWikilinksCaseInsensitive: () => false,
    })
  );

describe('renameNote', () => {
  beforeEach(() => {
    useSyntax('mediawiki');
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  it('renames the file and rewrites the links to it, keeping their aliases and sections', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki({
      'notes/alpha.md': '# Alpha\n\n## Intro\n',
      'ref.md': '# Ref\n\n[[alpha]] and [[alpha|Alpha note]] and [[alpha#Intro]]\n',
    });

    const result = await renameNote(
      workspace,
      graph,
      dataStore,
      find('notes/alpha.md'),
      'beta'
    );

    expect(await read('notes/alpha.md')).toBeNull();
    expect(await read('notes/beta.md')).toBe('# Alpha\n\n## Intro\n');
    expect(await read('ref.md')).toBe(
      '# Ref\n\n[[beta]] and [[beta|Alpha note]] and [[beta#Intro]]\n'
    );
    expect(result.old_id).toBe('alpha');
    expect(result.id).toBe('beta');
    expect(result.updated_links).toBe(3);
  });
});

describe('renameNote with Gollum syntax', () => {
  beforeEach(() => {
    useSyntax('gollum');
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  const files = {
    'a/Old.md': '# Old\n\n[[Sib]]\n',
    'a/Sib.md': '# Sib\n\n[[Shown|Old]] and [[Old#intro]]\n',
    'Top.md': '# Top\n\n[[a/Old]] and [[/a/Old]]\n',
  };

  it('rewrites each link to the note from the folder of the linking note, keeping its alias and section', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    const result = await renameNote(
      workspace,
      graph,
      dataStore,
      find('a/Old.md'),
      'New'
    );

    expect(await read('a/Old.md')).toBeNull();
    expect(await read('a/New.md')).toBe('# Old\n\n[[Sib]]\n');
    expect(await read('a/Sib.md')).toBe(
      '# Sib\n\n[[Shown|New]] and [[New#intro]]\n'
    );
    expect(await read('Top.md')).toBe('# Top\n\n[[a/New]] and [[/a/New]]\n');
    expect(result.updated_links).toBe(4);
  });

  it('rewrites the relative links of a note moved to another folder, and the links to it', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    const result = await renameNote(
      workspace,
      graph,
      dataStore,
      find('a/Old.md'),
      'Old',
      wikiRoot.joinPath('b')
    );

    expect(await read('a/Old.md')).toBeNull();
    expect(await read('b/Old.md')).toBe('# Old\n\n[[../a/Sib]]\n');
    expect(await read('a/Sib.md')).toBe(
      '# Sib\n\n[[Shown|../b/Old]] and [[../b/Old#intro]]\n'
    );
    expect(await read('Top.md')).toBe('# Top\n\n[[b/Old]] and [[/b/Old]]\n');
    expect(result.updated_links).toBe(5);
  });
});

describe('renameSection', () => {
  beforeEach(() => {
    useSyntax('mediawiki');
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  const files = {
    'guide.md': '# Guide\n\n## Getting Started\n\ntext\n',
    'ref.md':
      '# Ref\n\n[[guide#Getting Started]] and [[guide#Getting Started|Read this]]\n',
  };

  it('renames the heading and rewrites the links to it with the new heading text', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    const result = await renameSection(
      workspace,
      graph,
      dataStore,
      find('guide.md'),
      'Getting Started',
      'First Steps'
    );

    expect(await read('guide.md')).toBe('# Guide\n\n## First Steps\n\ntext\n');
    expect(await read('ref.md')).toBe(
      '# Ref\n\n[[guide#First Steps]] and [[guide#First Steps|Read this]]\n'
    );
    expect(result.updated_links).toBe(2);
  });

  it('does not find a section by its slug', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    await expect(
      renameSection(
        workspace,
        graph,
        dataStore,
        find('guide.md'),
        'getting-started',
        'First Steps'
      )
    ).rejects.toThrow('Section "getting-started" not found');
    expect(await read('guide.md')).toBe(files['guide.md']);
    expect(await read('ref.md')).toBe(files['ref.md']);
  });
});

describe('renameSection with Gollum syntax', () => {
  beforeEach(() => {
    useSyntax('gollum');
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  const files = {
    'a/Guide.md': '# Guide\n\n## Getting Started\n\ntext\n',
    'a/Ref.md':
      '# Ref\n\n[[Guide#getting-started]] and [[Read this|Guide#getting-started]] and [[/a/Guide#getting-started]]\n',
  };
  const renamedRef =
    '# Ref\n\n[[Guide#first-steps]] and [[Read this|Guide#first-steps]] and [[/a/Guide#first-steps]]\n';

  it('renames the heading and rewrites the links to it with the new slug', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    const result = await renameSection(
      workspace,
      graph,
      dataStore,
      find('a/Guide.md'),
      'Getting Started',
      'First Steps'
    );

    expect(await read('a/Guide.md')).toBe(
      '# Guide\n\n## First Steps\n\ntext\n'
    );
    expect(await read('a/Ref.md')).toBe(renamedRef);
    expect(result.updated_links).toBe(3);
  });

  it('finds the section by its slug', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki(files);

    const result = await renameSection(
      workspace,
      graph,
      dataStore,
      find('a/Guide.md'),
      'getting-started',
      'First Steps'
    );

    expect(await read('a/Guide.md')).toBe(
      '# Guide\n\n## First Steps\n\ntext\n'
    );
    expect(await read('a/Ref.md')).toBe(renamedRef);
    expect(result.updated_links).toBe(3);
  });

  it('rewrites a link that names the section by its heading text to the new slug', async () => {
    const { workspace, graph, dataStore, find, read } = createWiki({
      'a/Guide.md': '# Guide\n\n## Getting Started\n\ntext\n',
      'a/Ref.md': '# Ref\n\n[[Guide#Getting Started]]\n',
    });

    await renameSection(
      workspace,
      graph,
      dataStore,
      find('a/Guide.md'),
      'Getting Started',
      'First Steps'
    );

    expect(await read('a/Ref.md')).toBe('# Ref\n\n[[Guide#first-steps]]\n');
  });
});
