import { ITelemetryReporter, NoopTelemetryReporter } from '@foam/core';

export interface ResolveReporterOptions {
  /**
   * Command name parsed from argv, or undefined when none was given.
   */
  command: string | undefined;
  /**
   * Args after the command word
   */
  commandArgs?: readonly string[];
  /**
   * Factory for the real reporter. Never called: Foam for Gollum's CLI sends
   * no telemetry.
   */
  buildReporter: (installationId: string) => ITelemetryReporter;
  /** Never called: the CLI shows no first-run consent prompt. */
  promptOverride?: () => Promise<'granted' | 'declined' | 'no-prompt'>;
}

/**
 * Returns the effective reporter for this CLI invocation.
 *
 * Foam for Gollum's CLI sends no telemetry, so this is always the no-op
 * reporter: no consent prompt, no installation ID, no state or config writes.
 */
export async function resolveCliReporter(
  _opts: ResolveReporterOptions
): Promise<ITelemetryReporter> {
  return NoopTelemetryReporter;
}
