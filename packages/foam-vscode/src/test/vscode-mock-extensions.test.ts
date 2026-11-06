import * as vscode from './vscode-mock';
import { FOAM_EXTENSION_ID } from './test-utils';

describe('vscode-mock extensions API', () => {
  it('should provide extensions.getExtension', () => {
    expect(vscode.extensions).toBeDefined();
    expect(vscode.extensions.getExtension).toBeDefined();
  });

  it('should return foam extension', () => {
    const ext = vscode.extensions.getExtension(FOAM_EXTENSION_ID);
    expect(ext).toBeDefined();
    expect(ext?.id).toBe(FOAM_EXTENSION_ID);
    expect(ext?.isActive).toBe(true);
  });

  it('should return undefined for unknown extensions', () => {
    const ext = vscode.extensions.getExtension('unknown.extension');
    expect(ext).toBeUndefined();
  });

  it('should provide foam instance through extension exports', async () => {
    const ext = vscode.extensions.getExtension(FOAM_EXTENSION_ID);
    expect(ext?.exports).toBeDefined();
    expect(ext?.exports.foam).toBeDefined();

    // foam is a getter that returns a Promise
    const foam = await ext?.exports.foam;
    expect(foam).toBeDefined();
    expect(foam.workspace).toBeDefined();
    expect(foam.graph).toBeDefined();
  });

  it('should support activate() method', async () => {
    const ext = vscode.extensions.getExtension(FOAM_EXTENSION_ID);
    expect(ext?.activate).toBeDefined();

    const exports = await ext?.activate();
    expect(exports).toBeDefined();
    expect(exports.foam).toBeDefined();
  });
});
