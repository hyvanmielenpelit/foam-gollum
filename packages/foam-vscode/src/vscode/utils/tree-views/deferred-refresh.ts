import { IDisposable } from '@foam/core';

export const VIEW_REFRESH_DELAY_MS = 500;

export interface VisibilitySource {
  readonly visible: boolean;
  onDidChangeVisibility: (
    listener: (e: { visible: boolean }) => unknown
  ) => IDisposable;
}

/**
 * Calls `refresh` once changes have settled for `delayMs`, while `view` is
 * visible. Changes that arrive while it is hidden are applied when it is shown.
 */
export function deferViewRefresh(
  view: VisibilitySource,
  onDidChange: (listener: () => unknown) => IDisposable,
  refresh: () => unknown,
  delayMs = VIEW_REFRESH_DELAY_MS
): IDisposable {
  let stale = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const changeSub = onDidChange(() => {
    stale = true;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (view.visible && stale) {
        stale = false;
        refresh();
      }
    }, delayMs);
  });

  const visibilitySub = view.onDidChangeVisibility(e => {
    if (e.visible && stale) {
      clearTimer();
      stale = false;
      refresh();
    }
  });

  return {
    dispose: () => {
      clearTimer();
      changeSub.dispose();
      visibilitySub.dispose();
    },
  };
}
