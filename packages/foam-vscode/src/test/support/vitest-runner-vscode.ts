/**
 * Vitest test runner for the e2e suite. Loads each spec as its tsc-compiled
 * CommonJS file through Node's `require`, so that `require('vscode')` reaches
 * the extension host's module loader instead of Vite.
 *
 * Loaded by Vitest from source (see `runner` in suite.ts), so it is excluded
 * from tsc.
 */

import { createRequire } from 'module';
import path from 'path';
import { TestRunner } from 'vitest';

const nodeRequire = createRequire(import.meta.url);

export default class VsCodeTestRunner extends TestRunner {
  importFile(
    filepath: string,
    source: Parameters<TestRunner['importFile']>[1]
  ): unknown {
    if (source === 'setup') {
      return super.importFile(filepath, source);
    }
    const root = this.config.root;
    const compiled = path
      .join(root, 'out', path.relative(path.join(root, 'src'), filepath))
      .replace(/\.ts$/, '.js');
    delete nodeRequire.cache[compiled];
    return nodeRequire(compiled);
  }
}
