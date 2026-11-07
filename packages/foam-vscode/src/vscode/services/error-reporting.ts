import {
  BrowserClient,
  Scope,
  defaultStackParser,
  makeFetchTransport,
} from '@sentry/browser';
import type {
  BrowserOptions,
  ErrorEvent,
  Event,
  StackFrame,
} from '@sentry/browser';
import { env, workspace } from 'vscode';
import type { TelemetryLogger, TelemetrySender } from 'vscode';
import { Logger, scrubPaths } from '@foam/core';
import type { ScrubRoot } from '@foam/core';
import type { ErrorSink } from './logging';

/** The common properties VS Code adds that are sent as tags. */
const ALLOWED_TAGS = [
  'common.os',
  'common.platformversion',
  'common.nodeArch',
  'common.vscodeversion',
  'common.uikind',
  'common.remotename',
  'common.product',
];

/** Reports sent per activation; each distinct error is sent once. */
const MAX_REPORTS_PER_SESSION = 20;

/** The file name VS Code puts in every stack frame of the errors it cleans. */
const REDACTED_FILE = '<REDACTED: user-file-path>';

/** The desktop bundle, named as `scrubPaths` names its frames. */
const BUNDLE_FILE = 'app:///out/bundles/extension-node.js';

export interface ErrorReporterOptions {
  /** Sentry release, `foam-vscode-gollum@<version>`. */
  release: string;
  environment?: string;
  /** Install folder of the extension; frames below it become `app:///...`. */
  extensionPath?: string;
  /** Replaces the fetch transport, for tests. */
  transport?: BrowserOptions['transport'];
}

/**
 * Sends errors to Sentry. `captureOriginal` takes the errors passed to
 * `Logger.error`, as thrown; `telemetryLogger` also receives the extension's
 * unhandled errors, whose frame file names VS Code has redacted.
 */
export interface ErrorReporter extends ErrorSink {
  telemetryLogger: TelemetryLogger;
  dispose(): Promise<void>;
}

/**
 * Creates the extension's error reporter: a VS Code telemetry logger that
 * sends errors to Sentry and nothing else. Returns `undefined` when `dsn` is
 * empty, which is the case in every non-production build.
 *
 * Follows Sentry's guidance for shared environments: no `Sentry.init`, no
 * integrations, a client attached to its own scope.
 */
export function createErrorReporter(
  dsn: string,
  options: ErrorReporterOptions
): ErrorReporter | undefined {
  if (!dsn) {
    return undefined;
  }
  const { sender, capture } = createSentrySender(dsn, options);
  const telemetryLogger = env.createTelemetryLogger(sender, {
    ignoreUnhandledErrors: false,
  });
  return {
    telemetryLogger,
    // Follows the user's telemetry setting, as the logger does
    captureOriginal: error => {
      if (telemetryLogger.isErrorsEnabled) {
        capture(error, undefined, false);
      }
    },
    dispose: async () => {
      await telemetryLogger.dispose();
    },
  };
}

function createSentrySender(
  dsn: string,
  options: ErrorReporterOptions
): {
  sender: TelemetrySender;
  capture: (
    error: Error,
    data: Record<string, any> | undefined,
    redacted: boolean
  ) => void;
} {
  const client = new BrowserClient({
    dsn,
    release: options.release,
    environment: options.environment ?? 'production',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    sendClientReports: false,
    integrations: [],
    stackParser: defaultStackParser,
    transport: options.transport ?? makeFetchTransport,
    beforeSend: event => scrubEvent(event, getScrubRoots(options.extensionPath)),
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();

  const reported = new Set<string>();
  const capture = (
    error: Error,
    data: Record<string, any> | undefined,
    redacted: boolean
  ) => {
    if (reported.size >= MAX_REPORTS_PER_SESSION) {
      return;
    }
    const errorKey = fingerprint(error, getScrubRoots(options.extensionPath));
    if (reported.has(errorKey)) {
      return;
    }
    reported.add(errorKey);
    if (reported.size === MAX_REPORTS_PER_SESSION) {
      Logger.debug(
        `Error reporting: ${MAX_REPORTS_PER_SESSION} errors reported, no more are sent until the next activation`
      );
    }

    const tags: Record<string, string> = {};
    for (const key of ALLOWED_TAGS) {
      if (data?.[key] !== undefined) {
        tags[key] = String(data[key]);
      }
    }
    // VS Code adds no OS property; the web bundle's process polyfill has no platform
    if (typeof process !== 'undefined' && process.platform) {
      tags.os = process.platform;
    }
    const eventScope = scope.clone();
    eventScope.setTags(tags);
    if (redacted) {
      eventScope.addEventProcessor(event =>
        attributeRedactedFrames(event, options.extensionPath)
      );
    }
    eventScope.captureException(error);
  };

  return {
    sender: {
      sendEventData: () => {
        // Usage events are never sent
      },
      sendErrorData: (error, data) => capture(error, data, true),
      flush: () => client.flush(2000).then(() => undefined),
    },
    capture,
  };
}

/**
 * What makes two errors the same report: the name, message and top stack
 * frame, with paths scrubbed.
 */
function fingerprint(error: Error, roots: ScrubRoot[]): string {
  const topFrame =
    error.stack?.split('\n').find(line => /^\s*at /.test(line)) ?? '';
  return [error.name, error.message, topFrame]
    .map(part => scrubPaths(part ?? '', roots))
    .join('\n');
}

/**
 * Names the frames VS Code redacted after the desktop bundle and adds the
 * bundle's debug ID, so Sentry can apply its source map. A redacted frame
 * from outside the bundle is named after it too.
 */
function attributeRedactedFrames(
  event: Event,
  extensionPath: string | undefined
): Event {
  let attributed = false;
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename === REDACTED_FILE) {
        frame.filename = BUNDLE_FILE;
        attributed = true;
      }
    }
  }
  const debugId = attributed ? getBundleDebugId(extensionPath) : undefined;
  if (debugId) {
    event.debug_meta = {
      ...event.debug_meta,
      images: [
        ...(event.debug_meta?.images ?? []),
        { type: 'sourcemap', code_file: BUNDLE_FILE, debug_id: debugId },
      ],
    };
  }
  return event;
}

/**
 * The debug ID the Sentry esbuild plugin injects into the desktop bundle. The
 * plugin records it in the global `_sentryDebugIds`, keyed by a stack trace
 * taken in the bundle; other extensions' bundles may add entries too.
 */
function getBundleDebugId(
  extensionPath: string | undefined
): string | undefined {
  const debugIds: Record<string, string> =
    (globalThis as any)._sentryDebugIds ?? {};
  const folder = extensionPath?.toLowerCase();
  const stack = Object.keys(debugIds).find(key => {
    const lower = key.toLowerCase();
    return (
      lower.includes('extension-node.js') && (!folder || lower.includes(folder))
    );
  });
  return stack ? debugIds[stack] : undefined;
}

function getScrubRoots(extensionPath: string | undefined): ScrubRoot[] {
  const roots: ScrubRoot[] = [];
  if (extensionPath) {
    roots.push({ path: extensionPath, label: 'app://', keepRemainder: true });
  }
  for (const folder of workspace.workspaceFolders ?? []) {
    roots.push({ path: folder.uri.fsPath, label: '<workspace>' });
  }
  const home =
    typeof process !== 'undefined'
      ? process.env?.USERPROFILE ?? process.env?.HOME
      : undefined;
  if (home) {
    roots.push({ path: home, label: '<home>' });
  }
  return roots;
}

/**
 * Drops request, user, server and breadcrumb data, and scrubs paths from the
 * message, exception values and stack frames.
 */
function scrubEvent(event: ErrorEvent, roots: ScrubRoot[]): ErrorEvent {
  const scrub = (text: string) => scrubPaths(text, roots);
  const scrubFrame = (frame: StackFrame) => {
    if (frame.filename) frame.filename = scrub(frame.filename);
    if (frame.abs_path) frame.abs_path = scrub(frame.abs_path);
    if (frame.module) frame.module = scrub(frame.module);
  };

  // Stops Sentry from deriving the IP address and location from the request
  event.sdk = { ...event.sdk, settings: { infer_ip: 'never' } };
  delete event.request;
  delete event.user;
  delete event.server_name;
  delete event.breadcrumbs;
  delete event.extra;

  if (event.message) {
    event.message = scrub(event.message);
  }
  if (event.logentry?.message) {
    event.logentry.message = scrub(event.logentry.message);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrub(exception.value);
    }
    exception.stacktrace?.frames?.forEach(scrubFrame);
  }
  for (const image of event.debug_meta?.images ?? []) {
    if ('code_file' in image && image.code_file) {
      image.code_file = scrub(image.code_file);
    }
  }
  return event;
}
