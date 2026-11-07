/**
 * Custom Vitest pool that runs test files in the VS Code extension host
 * process (no worker forks/threads).
 *
 * This is required because `require('vscode')` only works in the extension
 * host process. Vitest's default worker pools (forks / threads) start fresh
 * Node processes / isolates that don't inherit VS Code's Module._load patch,
 * so they cannot resolve the 'vscode' virtual module.
 *
 * The pool worker is in-process: its `send`/`on` loop back over event emitters
 * to Vitest's own worker runtime (`init` from `vitest/worker`), the same
 * runtime the threads pool runs inside a worker thread. Test files are loaded
 * by `vitest-runner-vscode.ts`.
 */

import { EventEmitter } from 'events';
import type {
  PoolRunnerInitializer,
  PoolWorker,
  WorkerRequest,
} from 'vitest/node' with { 'resolution-mode': 'import' };

export type VitestWorkerModule = typeof import('vitest/worker', {
  with: { 'resolution-mode': 'import' },
});

class InProcessPoolWorker implements PoolWorker {
  readonly name = 'vscode';
  private readonly toPool = new EventEmitter();
  private readonly toWorker = new EventEmitter();
  private initialized = false;

  constructor(private readonly runtime: VitestWorkerModule) {}

  on(event: string, callback: (...args: any[]) => void): void {
    this.toPool.on(event, callback);
  }

  off(event: string, callback: (...args: any[]) => void): void {
    this.toPool.off(event, callback);
  }

  // Copied and delivered on a later tick, like a worker thread's message port:
  // the sender reuses its buffers once a message is posted
  send(message: WorkerRequest): void {
    const copy = structuredClone(message);
    setImmediate(() => this.toWorker.emit('message', copy));
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  canReuse(): boolean {
    return true;
  }

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    const { init, runBaseTests, setupEnvironment } = this.runtime;
    init({
      post: response => {
        const copy = structuredClone(response);
        setImmediate(() => this.toPool.emit('message', copy));
      },
      on: callback => this.toWorker.on('message', callback),
      off: callback => this.toWorker.off('message', callback),
      teardown: () => {
        this.toWorker.removeAllListeners('message');
        this.initialized = false;
      },
      runTests: (state, traces) => runBaseTests('run', state, traces),
      collectTests: (state, traces) => runBaseTests('collect', state, traces),
      setup: setupEnvironment,
    });
  }

  async stop(): Promise<void> {
    // Nothing to terminate: the worker runtime lives in this process
  }
}

/**
 * `runtime` is the `vitest/worker` module, passed in because this file
 * compiles to CommonJS and that module is ESM-only.
 */
export function createVsCodePool(
  runtime: VitestWorkerModule
): PoolRunnerInitializer {
  return {
    name: 'vscode',
    createPoolWorker: () => new InProcessPoolWorker(runtime),
  };
}
