import {
  BrowserClient,
  Scope,
  defaultStackParser,
  makeFetchTransport,
} from '@sentry/browser';
import type { BrowserOptions, ErrorEvent, StackFrame } from '@sentry/browser';
import { env, workspace } from 'vscode';
import type { TelemetryLogger, TelemetrySender } from 'vscode';
import { scrubPaths } from '@foam/core';
import type { ScrubRoot } from '@foam/core';

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
): TelemetryLogger | undefined {
  if (!dsn) {
    return undefined;
  }
  return env.createTelemetryLogger(createSentrySender(dsn, options), {
    ignoreUnhandledErrors: false,
  });
}

function createSentrySender(
  dsn: string,
  options: ErrorReporterOptions
): TelemetrySender {
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

  return {
    sendEventData: () => {
      // Usage events are never sent
    },
    sendErrorData: (error, data) => {
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
      eventScope.captureException(error);
    },
    flush: () => client.flush(2000).then(() => undefined),
  };
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
