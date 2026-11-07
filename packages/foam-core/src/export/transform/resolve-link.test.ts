import { Config, DefaultFoamConfig } from '../../config';
import { URI } from '../../model/uri';
import {
  createNoteFromMarkdown,
  createTestWorkspace,
} from '../../../test/test-utils';
import { testExportTarget } from '../../../test/test-export-target';
import { createExportContext } from '../bootstrap/create-context';
import { resolveExportLink } from './resolve-link';

describe('resolveExportLink with Gollum syntax', () => {
  beforeEach(() => {
    Config.setDefaultConfig(
      Object.assign(new DefaultFoamConfig(), {
        getWikilinksSyntax: () => 'gollum' as const,
        getWikilinksCaseInsensitive: () => false,
      })
    );
  });
  afterEach(() => {
    Config.setDefaultConfig(new DefaultFoamConfig());
  });

  /** The links of `/wiki/a/Src.md`, each resolved against the export of its wiki. */
  const resolveLinksOf = (text: string) => {
    const workspace = createTestWorkspace([URI.file('/wiki')]);
    const source = createNoteFromMarkdown('/wiki/a/Src.md', text);
    workspace
      .set(source)
      .set(createNoteFromMarkdown('/wiki/a/Page.md', '# Page'))
      .set(createNoteFromMarkdown('/wiki/Page.md', '# Root Page'))
      .set(createNoteFromMarkdown('/wiki/Top.md', '# Top\n\n## Intro'));
    const context = createExportContext({ workspace }, testExportTarget());
    return source.links.map(link => resolveExportLink(link, source, context));
  };

  it('resolves an aliased link to the page after the alias, in the folder of the linking note', () => {
    const [resolved] = resolveLinksOf('# Src\n\n[[Shown|Page]]');

    expect(resolved.resolution.kind).toBe('in-set');
    expect(
      resolved.resolution.kind === 'in-set' &&
        resolved.resolution.targetResource.uri.path
    ).toBe('/wiki/a/Page.md');
    expect(resolved.section).toBeUndefined();
  });

  it('resolves a link from the wiki root with its section', () => {
    const [resolved] = resolveLinksOf('# Src\n\n[[Top section|/Top#intro]]');

    expect(resolved.resolution.kind).toBe('in-set');
    expect(
      resolved.resolution.kind === 'in-set' &&
        resolved.resolution.targetResource.uri.path
    ).toBe('/wiki/Top.md');
    expect(resolved.section).toBe('intro');
  });

  it('reports a missing page as unresolved at its path in the folder of the linking note', () => {
    const [resolved] = resolveLinksOf('# Src\n\n[[Shown|Missing]]');

    expect(resolved.resolution).toEqual({
      kind: 'unresolved',
      targetPath: '/wiki/a/Missing.md',
    });
  });

  it('passes through a link that climbs above the wiki root', () => {
    const [resolved] = resolveLinksOf('# Src\n\n[[../../Page]]');

    expect(resolved).toBeNull();
  });
});
