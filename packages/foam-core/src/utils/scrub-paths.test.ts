import { scrubPaths } from './scrub-paths';

describe('scrubPaths', () => {
  it('leaves a message with no paths unchanged', () => {
    const message = 'Cannot read properties of undefined (reading "uri") at 1/2, see https://example.com/a/b';
    expect(scrubPaths(message)).toEqual(message);
  });

  it('replaces a Windows path, including one with spaces', () => {
    expect(
      scrubPaths("ENOENT: no such file, open 'C:\\Users\\Jane Doe\\My Notes\\secret.md'")
    ).toEqual("ENOENT: no such file, open '<path>'");
    expect(scrubPaths('failed for d:/notes/a.md today')).toEqual('failed for <path> today');
  });

  it('replaces a POSIX path', () => {
    expect(scrubPaths('cannot open /home/jane/notes/secret.md: denied')).toEqual(
      'cannot open <path> denied'
    );
  });

  it('replaces a UNC path', () => {
    expect(scrubPaths('read \\\\server\\share\\notes\\a.md failed')).toEqual(
      'read <path> failed'
    );
  });

  it('replaces a file URI', () => {
    expect(scrubPaths('bad uri file:///c%3A/Users/jane/notes/a.md here')).toEqual(
      'bad uri <path> here'
    );
  });

  it('labels paths inside a given root', () => {
    const roots = [{ path: 'C:\\Users\\jane', label: '<home>' }];
    expect(scrubPaths('open c:/users/JANE/notes/a.md', roots)).toEqual('open <home>');
    expect(scrubPaths('open file:///c%3A/Users/jane/a.md', roots)).toEqual('open <home>');
    expect(scrubPaths('open C:\\Users\\janet\\a.md', roots)).toEqual('open <path>');
  });

  it('prefers the workspace when it is inside the home folder', () => {
    const roots = [
      { path: '/home/jane', label: '<home>' },
      { path: '/home/jane/notes', label: '<workspace>' },
    ];
    expect(scrubPaths('a /home/jane/notes/x.md b /home/jane/.bashrc', roots)).toEqual(
      'a <workspace> b <home>'
    );
  });

  it('prefers the home folder when it is inside the workspace', () => {
    const roots = [
      { path: '/home', label: '<workspace>' },
      { path: '/home/jane', label: '<home>' },
    ];
    expect(scrubPaths('a /home/jane/x.md b /home/other/y.md', roots)).toEqual(
      'a <home> b <workspace>'
    );
  });

  it('keeps the part below a root when asked, with forward slashes', () => {
    const roots = [
      { path: 'C:\\Users\\jane\\.vscode\\extensions\\foam', label: 'app://', keepRemainder: true },
      { path: 'C:\\Users\\jane', label: '<home>' },
    ];
    expect(
      scrubPaths('C:\\Users\\jane\\.vscode\\extensions\\foam\\out\\bundles\\extension-node.js', roots)
    ).toEqual('app:///out/bundles/extension-node.js');
  });

  it('ignores roots that would match every path', () => {
    expect(scrubPaths('open /a/b.md', [{ path: '/', label: '<home>' }])).toEqual('open <path>');
  });
});
