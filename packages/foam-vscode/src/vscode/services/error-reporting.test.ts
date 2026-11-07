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
    const logger = createErrorReporter(TEST_DSN, {
      release: 'foam-vscode-gollum@0.0.0-test',
      extensionPath,
      transport,
    });

    logger.logError(
      new Error(
        `cannot read ${path.join(workspacePath, 'notes', 'secret.md')} ` +
          `or ${path.join(os.homedir(), 'private.md')} or C:\\Other\\x.md`
      )
    );
    await logger.dispose();

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
    const logger = createErrorReporter(TEST_DSN, { release: 'test@0', transport });

    logger.logUsage('command', { command: 'foam-vscode.create-note' });
    logger.logError('error-event', { context: 'x' });
    await logger.dispose();

    expect(events).toEqual([]);
  });
});
