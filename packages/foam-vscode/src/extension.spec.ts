import * as vscode from 'vscode';
import { wait, waitForExpect } from './test/test-utils';
import {
  getFoamFromVSCode,
  withModifiedFoamConfiguration,
} from './test/test-utils-vscode';

const RELOAD_PROMPT = 'Foam: Reload the window to use the updated settings';

describe('Changing settings that Foam reads at startup', () => {
  it('asks to reload the window when the wikilink syntax changes', async () => {
    await getFoamFromVSCode();
    const current = vscode.workspace
      .getConfiguration('foam')
      .get('wikilinks.syntax');
    const info = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined);

    try {
      await withModifiedFoamConfiguration(
        'wikilinks.syntax',
        current === 'gollum' ? 'mediawiki' : 'gollum',
        async () => {
          await waitForExpect(() => {
            expect(info).toHaveBeenCalledWith(RELOAD_PROMPT);
          });
        }
      );
    } finally {
      info.mockRestore();
    }
  });

  it('does not ask to reload the window when another setting changes', async () => {
    await getFoamFromVSCode();
    const current = vscode.workspace
      .getConfiguration('foam')
      .get<boolean>('links.hover.enable');
    const info = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined);

    try {
      await withModifiedFoamConfiguration(
        'links.hover.enable',
        !current,
        async () => {
          // The prompt would follow the change event, which is not awaited
          await wait(500);
        }
      );
      await wait(500);

      expect(info).not.toHaveBeenCalledWith(RELOAD_PROMPT);
    } finally {
      info.mockRestore();
    }
  });
});
