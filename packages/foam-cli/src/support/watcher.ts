import { realpathSync } from 'node:fs';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import { Emitter, IDisposable, IWatcher, URI } from '@foam/core';

const DEBOUNCE_MS = 100;

const isWindows = process.platform === 'win32';

/** A watched path and the different real path chokidar watches instead */
interface PathAlias {
  given: string;
  real: string;
}

function realPathOf(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/** Whether `filePath` is `dir` or inside it */
function isUnder(filePath: string, dir: string): boolean {
  const [file, folder] = isWindows
    ? [filePath.toLowerCase(), dir.toLowerCase()]
    : [filePath, dir];
  return (
    file === folder ||
    (file.startsWith(folder) && /[\\/]/.test(file.charAt(folder.length)))
  );
}

/**
 * Node-side counterpart to VsCodeWatcher: turns chokidar events into the
 * IWatcher contract that bootstrap() expects, with a small debounce on
 * change events to coalesce save bursts.
 *
 * Construct with the same set of paths/globs the workspace was loaded
 * with so the watcher and the in-memory graph stay in sync.
 *
 * Paths are watched by their real path, because on Windows libuv aborts the
 * process when the watched folder is an 8.3 short path; events are reported
 * under the path as given.
 */
export class NodeWatcher implements IWatcher, IDisposable {
  public onDidCreateEmitter = new Emitter<URI>();
  public onDidChangeEmitter = new Emitter<URI>();
  public onDidDeleteEmitter = new Emitter<URI>();
  onDidCreate = this.onDidCreateEmitter.event;
  onDidChange = this.onDidChangeEmitter.event;
  onDidDelete = this.onDidDeleteEmitter.event;

  private readonly fsWatcher: FSWatcher;
  private readonly changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly aliases: PathAlias[];

  constructor(
    paths: string[] | string,
    options: { ignored?: (string | RegExp)[] } = {}
  ) {
    const given = (Array.isArray(paths) ? paths : [paths]).map(p => {
      const resolved = path.resolve(p);
      return { given: resolved, real: realPathOf(resolved) };
    });
    this.aliases = given.filter(({ given, real }) => given !== real);
    this.fsWatcher = chokidar.watch(
      given.map(({ real }) => real),
      {
        ignored: options.ignored,
        // Don't fire `add` for files that already exist when the watcher starts —
        // the workspace bootstrap already loaded them.
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 25,
        },
      }
    );

    this.fsWatcher.on('add', filePath =>
      this.onDidCreateEmitter.fire(this.toUri(filePath))
    );
    this.fsWatcher.on('change', filePath =>
      this.fireChange(this.toUri(filePath))
    );
    this.fsWatcher.on('unlink', filePath =>
      this.onDidDeleteEmitter.fire(this.toUri(filePath))
    );
  }

  /** The URI of `filePath` under the watched path it was given as */
  private toUri(filePath: string): URI {
    const alias = this.aliases.find(({ real }) => isUnder(filePath, real));
    return URI.file(
      alias ? alias.given + filePath.slice(alias.real.length) : filePath
    );
  }

  private fireChange(uri: URI): void {
    const key = uri.path;
    const existing = this.changeTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.changeTimers.set(
      key,
      setTimeout(() => {
        this.changeTimers.delete(key);
        this.onDidChangeEmitter.fire(uri);
      }, DEBOUNCE_MS)
    );
  }

  async dispose(): Promise<void> {
    for (const timer of this.changeTimers.values()) {
      clearTimeout(timer);
    }
    this.changeTimers.clear();
    await this.fsWatcher.close();
  }
}
