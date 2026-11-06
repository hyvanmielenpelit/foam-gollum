/*
 * This file should not depend on VS Code as it's used for unit tests.
 *
 * The test utilities themselves live in `@foam/core/test`. We re-export
 * them here so existing imports keep working, and override the few values
 * that need to be foam-vscode-specific (e.g. TEST_DATA_DIR).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { Config, IFoamConfig, URI } from '@foam/core';

export {
  InMemoryDataStore,
  strToUri,
  createTestWorkspace,
  createTestNote,
  createNoteFromMarkdown,
  wait,
  randomString,
  getRandomURI,
  readFileFromFs,
  waitForExpect,
} from '@foam/core/test';

/**
 * foam-vscode's test-data directory. This file is at `src/test/test-utils.ts`,
 * so test-data lives two levels up.
 */
export const TEST_DATA_DIR = URI.file(__dirname).joinPath(
  '..',
  '..',
  'test-data'
);

/**
 * The extension id VS Code knows foam-vscode by: `<publisher>.<name>` from its
 * package.json, two levels up from this file.
 */
export const FOAM_EXTENSION_ID = (() => {
  const manifest = JSON.parse(
    readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
  );
  return `${manifest.publisher}.${manifest.name}`;
})();

/**
 * Reads wikilinks with the given syntax in every test of the enclosing
 * `describe` block, then restores the previous configuration. The other
 * settings keep their current values.
 */
export const useWikilinkSyntax = (
  syntax: 'mediawiki' | 'gollum',
  caseInsensitive = syntax === 'gollum'
) => {
  // `Config` does not expose the installed configuration, which this wraps
  const config = Config as unknown as { defaultConfig: IFoamConfig };
  let previous: IFoamConfig;
  beforeEach(() => {
    previous = config.defaultConfig;
    Config.setDefaultConfig(
      Object.assign(Object.create(previous), {
        getWikilinksSyntax: () => syntax,
        getWikilinksCaseInsensitive: () => caseInsensitive,
      })
    );
  });
  afterEach(() => {
    Config.setDefaultConfig(previous);
  });
};