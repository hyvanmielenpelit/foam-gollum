import dayjs from 'dayjs';
import * as vscode from 'vscode';
import {
  cleanWorkspace,
  closeEditors,
  createFile,
  deleteFile,
  getUriInWorkspace,
} from '../../../test/test-utils-vscode';
import { fileExists } from '../../services/editor';

/** Runs `fn` while VS Code reports the workspace as not trusted */
const whileUntrusted = async (fn: () => Promise<void>) => {
  const isTrusted = vi
    .spyOn(vscode.workspace, 'isTrusted', 'get')
    .mockReturnValue(false);
  try {
    await fn();
  } finally {
    isTrusted.mockRestore();
  }
};

describe('JavaScript templates in an untrusted workspace', () => {
  beforeEach(async () => {
    await cleanWorkspace();
    await closeEditors();
  });

  afterEach(async () => {
    await closeEditors();
    await cleanWorkspace();
  });

  it('are not run to create a note', async () => {
    const template = await createFile(
      `async function createNote() {
  return { filepath: 'untrusted-js-note.md', content: '# From JS' };
}`,
      ['.foam', 'templates', 'untrusted-js-template.js']
    );

    await whileUntrusted(async () => {
      await expect(
        vscode.commands.executeCommand('foam-vscode.create-note', {
          templatePath: template.uri.path,
          title: 'Untrusted',
        })
      ).rejects.toThrow(/the workspace is not trusted/);
    });

    expect(await fileExists(getUriInWorkspace('untrusted-js-note.md'))).toBe(
      false
    );
  });

  it('are not run to create the daily note', async () => {
    const template = await createFile(
      `async function createNote() {
  return { filepath: 'untrusted-js-daily.md', content: '# From JS' };
}`,
      ['.foam', 'templates', 'daily-note.js']
    );
    const today = dayjs().format('YYYY-MM-DD');

    try {
      await whileUntrusted(async () => {
        await expect(
          vscode.commands.executeCommand('foam-vscode.open-daily-note')
        ).rejects.toThrow(/the workspace is not trusted/);
      });
    } finally {
      await deleteFile(template.uri);
    }

    expect(await fileExists(getUriInWorkspace('untrusted-js-daily.md'))).toBe(
      false
    );
    expect(
      await fileExists(getUriInWorkspace('journal', `${today}.md`))
    ).toBe(false);
  });
});
