import type { TelemetryLogger } from 'vscode';

export interface ErrorReporterOptions {
  release: string;
  environment?: string;
  extensionPath?: string;
}

/**
 * Web extension version of `createErrorReporter`: the web bundle reports no
 * errors, because sending from the web extension host has not been verified.
 */
export function createErrorReporter(
  _dsn: string,
  _options: ErrorReporterOptions
): TelemetryLogger | undefined {
  return undefined;
}
