import dayjs from 'dayjs';
import * as vscode from 'vscode';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  deleteFile,
  expectSameUri,
  getUriInWorkspace,
  readFile,
} from '../../../test/test-utils-vscode';

describe('open-daily-note command', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await closeEditors();
    await cleanWorkspace();
  });

  it("creates today's note at the daily note template's filepath and opens it", async () => {
    const template = await createFile(
      `---
foam_template:
  filepath: "/diary/\${FOAM_DATE_YEAR}/\${FOAM_DATE_YEAR}-\${FOAM_DATE_MONTH}-\${FOAM_DATE_DATE}.md"
---
# Daily \${FOAM_DATE_YEAR}-\${FOAM_DATE_MONTH}-\${FOAM_DATE_DATE}
`,
      ['.foam', 'templates', 'daily-note.md']
    );
    const today = dayjs();
    const expected = getUriInWorkspace(
      'diary',
      today.format('YYYY'),
      `${today.format('YYYY-MM-DD')}.md`
    );

    try {
      await vscode.commands.executeCommand('foam-vscode.open-daily-note');

      expectSameUri(vscode.window.activeTextEditor.document.uri, expected);
      expect(await readFile(expected)).toContain(
        `# Daily ${today.format('YYYY-MM-DD')}`
      );
    } finally {
      await deleteFile(template.uri);
    }
  });

  it("creates today's note in the journal folder when there is no daily note template", async () => {
    const warning = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue(undefined);
    const today = dayjs().format('YYYY-MM-DD');
    const expected = getUriInWorkspace('journal', `${today}.md`);

    try {
      await vscode.commands.executeCommand('foam-vscode.open-daily-note');

      expectSameUri(vscode.window.activeTextEditor.document.uri, expected);
      expect(await readFile(expected)).toContain(`# ${today}`);
    } finally {
      warning.mockRestore();
    }
  });

  it("opens today's note without changing it when it exists already", async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const existing = await createFile('# My day\n\nWritten already.\n', [
      'journal',
      `${today}.md`,
    ]);
    const warning = vi
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValue(undefined);

    try {
      await vscode.commands.executeCommand('foam-vscode.open-daily-note');

      expectSameUri(vscode.window.activeTextEditor.document.uri, existing.uri);
      expect(vscode.window.activeTextEditor.document.getText()).toEqual(
        '# My day\n\nWritten already.\n'
      );
    } finally {
      warning.mockRestore();
    }
  });
});
