/**
 * A known folder whose paths `scrubPaths` replaces with `label`.
 *
 * With `keepRemainder`, the part of the path below `path` is kept (with `/`
 * separators) after the label; otherwise the whole path becomes the label.
 */
export interface ScrubRoot {
  path: string;
  label: string;
  keepRemainder?: boolean;
}

// Characters that end a path inside free text
const STOP = `\\s'"\`<>()\\[\\]{},;|`;
const SEG = `[^${STOP}]`;
// A path may contain spaces; a following word continues it only if it holds
// a path separator before the next stop character
const CONT = `(?:${SEG}|\\s+(?=${SEG}*[\\\\/]))*`;
const AT_TOKEN_START = `(?<![^${STOP}])`;

const PATH_PATTERN = new RegExp(
  [
    `file:\\/\\/${SEG}*`,
    `(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]${CONT}`,
    `${AT_TOKEN_START}\\\\\\\\${SEG}+${CONT}`,
    `${AT_TOKEN_START}\\/(?=${SEG})${CONT}`,
  ].join('|'),
  'g'
);

const PATH_LABEL = '<path>';

function toSlashPath(raw: string): string {
  let path = raw;
  if (/^file:\/\//i.test(path)) {
    path = path.slice('file://'.length);
    try {
      path = decodeURIComponent(path);
    } catch {
      // Keep the undecoded form
    }
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
  }
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Replaces absolute paths in `text`: POSIX, Windows drive, UNC and `file://`.
 *
 * A path inside one of `roots` becomes that root's label; the longest
 * matching root wins, so nested roots work in either direction. Any other
 * absolute path becomes `<path>`. Matching ignores case and separator style.
 */
export function scrubPaths(text: string, roots: ScrubRoot[] = []): string {
  const normalizedRoots = roots
    .map(root => ({ ...root, normalized: toSlashPath(root.path).toLowerCase() }))
    .filter(root => root.normalized.length > 0 && !/^[a-z]:$/.test(root.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return text.replace(PATH_PATTERN, token => {
    const path = toSlashPath(token);
    const lower = path.toLowerCase();
    const root = normalizedRoots.find(
      r => lower === r.normalized || lower.startsWith(r.normalized + '/')
    );
    if (!root) {
      return PATH_LABEL;
    }
    return root.keepRemainder
      ? root.label + path.slice(root.normalized.length)
      : root.label;
  });
}
