import os from 'os';
import path from 'path';
import { createTransport } from '@sentry/browser';
import { env, workspace } from 'vscode';
import { createErrorReporter } from './error-reporting';

const TEST_DSN = 'https://public@example.invalid/1';

function recordingTransport() {
  const events: any[] = [];
  const transport = (options: Parameters<typeof createTransport>[0]) =>
    createTransport(options, async request => {
      const body =
        typeof request.body === 'string'
          ? request.body
          : new TextDecoder().decode(request.body);
      const [, itemHeader, item] = body.split('\n');
      if (JSON.parse(itemHeader).type === 'event') {
        events.push(JSON.parse(item));
      }
      return { statusCode: 200 };
    });
  return { events, transport };
}

describe('createErrorReporter', () => {
  it('creates no logger when the DSN is empty', () => {
    const spy = vi.spyOn(env, 'createTelemetryLogger');
    try {
      expect(createErrorReporter('', { release: 'test@0' })).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('sends errors with scrubbed paths and only the allowed fields', async () => {
    const { events, transport } = recordingTransport();
    const workspacePath = workspace.workspaceFolders[0].uri.fsPath;
    const extensionPath = path.resolve(__dirname, '../../..');
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'foam-vscode-gollum@0.0.0-test',
      extensionPath,
      transport,
    });

    reporter.telemetryLogger.logError(
      new Error(
        `cannot read ${path.join(workspacePath, 'notes', 'secret.md')} ` +
          `or ${path.join(os.homedir(), 'private.md')} or C:\\Other\\x.md`
      )
    );
    await reporter.dispose();

    expect(events).toHaveLength(1);
    const [event] = events;
    const [exception] = event.exception.values;
    expect(exception.type).toEqual('Error');
    expect(exception.value).toEqual('cannot read <workspace> or <home> or <path>');
    expect(event.release).toEqual('foam-vscode-gollum@0.0.0-test');
    expect(event.environment).toEqual('production');
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.sdk.settings).toEqual({ infer_ip: 'never' });
    expect(event.tags).toEqual({
      'common.os': 'mock-os',
      'common.vscodeversion': '1.0.0-mock',
      os: process.platform,
    });

    const frames: { filename: string }[] = exception.stacktrace.frames;
    expect(frames.some(f => f.filename.startsWith('app:///src/'))).toBe(true);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('secret.md');
    expect(serialized).not.toContain('mock-machine');
    expect(serialized.toLowerCase()).not.toContain(
      JSON.stringify(os.homedir().toLowerCase()).slice(1, -1)
    );
  });

  it('sends no usage events', async () => {
    const { events, transport } = recordingTransport();
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      transport,
    });

    reporter.telemetryLogger.logUsage('command', {
      command: 'foam-vscode.create-note',
    });
    reporter.telemetryLogger.logError('error-event', { context: 'x' });
    await reporter.dispose();

    expect(events).toEqual([]);
  });

  it('sends an error passed to Logger.error as thrown, with its frames named after the extension files', async () => {
    const { events, transport } = recordingTransport();
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      extensionPath: path.resolve(__dirname, '../../..'),
      transport,
    });

    reporter.captureOriginal(new Error('explicit'));
    await reporter.dispose();

    expect(events).toHaveLength(1);
    const frames: { filename: string }[] =
      events[0].exception.values[0].stacktrace.frames;
    expect(
      frames.some(f =>
        f.filename.startsWith('app:///src/vscode/services/error-reporting.test.')
      )
    ).toBe(true);
    expect(events[0].debug_meta).toBeUndefined();
  });

  it('sends nothing for an error passed to Logger.error when error telemetry is off', async () => {
    const { events, transport } = recordingTransport();
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      transport,
    });
    (env as any).isTelemetryEnabled = false;
    try {
      reporter.captureOriginal(new Error('not sent'));
      await reporter.dispose();
    } finally {
      (env as any).isTelemetryEnabled = true;
    }

    expect(events).toEqual([]);
  });

  it('names the frames VS Code redacted after the desktop bundle and adds its debug ID', async () => {
    const { events, transport } = recordingTransport();
    const extensionPath = path.join(os.tmpdir(), 'foam-vscode-gollum-1.0.0');
    const bundle = path.join(extensionPath, 'out', 'bundles', 'extension-node.js');
    const otherBundle = path.join(os.tmpdir(), 'other', 'extension-node.js');
    (globalThis as any)._sentryDebugIds = {
      [`Error\n    at other (${otherBundle}:1:1)`]: 'other-extension-id',
      [`Error\n    at Object.<anonymous> (${bundle}:2:10)`]: 'foam-bundle-id',
    };
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      extensionPath,
      transport,
    });
    const error = new Error('unhandled');
    error.stack = [
      'Error: unhandled',
      '    at handler (<REDACTED: user-file-path>:2:345)',
      '    at node:internal/timers:581:17',
    ].join('\n');

    try {
      reporter.telemetryLogger.logError(error);
      await reporter.dispose();
    } finally {
      delete (globalThis as any)._sentryDebugIds;
    }

    expect(events).toHaveLength(1);
    const frames: { filename: string }[] =
      events[0].exception.values[0].stacktrace.frames;
    expect(frames.map(f => f.filename).sort()).toEqual([
      'app:///out/bundles/extension-node.js',
      'node:internal/timers',
    ]);
    expect(events[0].debug_meta.images).toEqual([
      {
        type: 'sourcemap',
        code_file: 'app:///out/bundles/extension-node.js',
        debug_id: 'foam-bundle-id',
      },
    ]);
  });
});

describe('Error report cap', () => {
  const failure = (detail: string) => new Error(`cannot read ${detail}`);

  it('sends the same error once per session', async () => {
    const { events, transport } = recordingTransport();
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      transport,
    });

    reporter.captureOriginal(failure('x'));
    reporter.captureOriginal(failure('x'));
    reporter.telemetryLogger.logError(failure('x'));
    await reporter.dispose();

    expect(events).toHaveLength(1);
  });

  it('sends at most 20 errors per session', async () => {
    const { events, transport } = recordingTransport();
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      transport,
    });

    for (let i = 0; i < 25; i++) {
      reporter.captureOriginal(failure(`item ${i}`));
    }
    await reporter.dispose();

    expect(events).toHaveLength(20);
  });

  it('counts errors that differ only in a scrubbed path as the same error', async () => {
    const { events, transport } = recordingTransport();
    const workspacePath = workspace.workspaceFolders[0].uri.fsPath;
    const reporter = createErrorReporter(TEST_DSN, {
      release: 'test@0',
      transport,
    });

    reporter.captureOriginal(failure(path.join(workspacePath, 'a.md')));
    reporter.captureOriginal(failure(path.join(workspacePath, 'b', 'c.md')));
    await reporter.dispose();

    expect(events).toHaveLength(1);
  });
});
