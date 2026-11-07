import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoopTelemetryReporter } from '@foam/core';
import { resolveCliReporter } from './resolve-reporter';
import { readRawUserConfig } from './user-config';
import { State } from './state';

describe('resolveCliReporter', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foam-rr-'));
    process.env.FOAM_CONFIG_HOME = tempDir;
    delete process.env.FOAM_TELEMETRY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([
    ['a first run', undefined, undefined],
    ['FOAM_TELEMETRY=1', '1', undefined],
    ['stored consent', undefined, true],
  ])(
    'returns Noop without prompting or building a reporter on %s',
    async (_label, envValue, storedConsent) => {
      if (envValue !== undefined) {
        process.env.FOAM_TELEMETRY = envValue;
      }
      if (storedConsent !== undefined) {
        fs.writeFileSync(
          path.join(tempDir, 'config.json'),
          JSON.stringify({ 'telemetry.enabled': storedConsent })
        );
      }
      let promptCalled = false;

      const reporter = await resolveCliReporter({
        command: 'graph',
        buildReporter: () => {
          throw new Error('should not build a real reporter');
        },
        promptOverride: async () => {
          promptCalled = true;
          return 'granted';
        },
      });

      expect(reporter).toBe(NoopTelemetryReporter);
      expect(promptCalled).toBe(false);
    }
  );

  it('touches no config or state', async () => {
    await resolveCliReporter({
      command: 'graph',
      buildReporter: () => {
        throw new Error('should not build a real reporter');
      },
      promptOverride: async () => 'granted',
    });

    expect(readRawUserConfig()['telemetry.enabled']).toBeUndefined();
    expect(State.read().installationId).toBeUndefined();
    expect(State.read().consentEventFired).toBeUndefined();
  });
});
