import type { ErrorReporter } from './error-reporting';

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
): ErrorReporter | undefined {
  return undefined;
}
