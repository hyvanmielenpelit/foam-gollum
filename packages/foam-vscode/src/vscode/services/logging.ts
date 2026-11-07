import { workspace, window, commands, ExtensionContext } from 'vscode';
import { IDisposable } from '@foam/core';
import { BaseLogger, ILogger, LogLevel } from '@foam/core';

function getFoamLoggerLevel(): LogLevel {
  return workspace.getConfiguration('foam.logging').get('level') ?? 'info';
}

export interface VsCodeLogger extends ILogger, IDisposable {
  show();
}

/** Receives the `Error` objects passed to `Logger.error`, as thrown. */
export interface ErrorSink {
  captureOriginal(error: Error): void;
}

export class VsCodeOutputLogger extends BaseLogger implements VsCodeLogger {
  private channel = window.createOutputChannel('Foam');
  private errorSink: ErrorSink | undefined;

  constructor() {
    super(getFoamLoggerLevel());
    this.channel.appendLine('Foam Logging: ' + getFoamLoggerLevel());
  }

  setErrorSink(sink: ErrorSink | undefined): void {
    this.errorSink = sink;
  }

  /** Forwards each `Error` argument to the error sink; the message text is never forwarded. */
  error(message?: any, ...params: any[]): void {
    super.error(message, ...params);
    if (!this.errorSink) {
      return;
    }
    for (const value of [message, ...params]) {
      if (value instanceof Error) {
        this.errorSink.captureOriginal(value);
      }
    }
  }

  log(lvl: LogLevel, msg?: any, ...extra: any[]): void {
    if (msg) {
      this.channel.appendLine(
        `[${lvl} - ${new Date().toLocaleTimeString()}] ${msg}`
      );
    }
    extra?.forEach(param => {
      if (param?.stack) {
        this.channel.appendLine(JSON.stringify(param.stack, null, 2));
      } else {
        this.channel.appendLine(JSON.stringify(param, null, 2));
      }
    });
  }

  show() {
    this.channel.show();
  }
  dispose(): void {
    this.channel.dispose();
  }
}

export const exposeLogger = (
  context: ExtensionContext,
  logger: VsCodeLogger
): void => {
  context.subscriptions.push(
    commands.registerCommand('foam-vscode.set-log-level', async () => {
      const items: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      const level = await window.showQuickPick(
        items.map(item => ({
          label: item,
          description: item === logger.getLevel() && 'Current',
        }))
      );
      logger.setLevel(level.label);
    })
  );
};
