import { describe, it, expect, vi } from 'vitest';
import { Emitter } from '@foam/core';
import { deferViewRefresh } from './deferred-refresh';

const DELAY = 500;

function makeView(visible: boolean) {
  const visibility = new Emitter<{ visible: boolean }>();
  const view = {
    visible,
    onDidChangeVisibility: visibility.event,
    setVisible(value: boolean) {
      view.visible = value;
      visibility.fire({ visible: value });
    },
  };
  return view;
}

describe('deferViewRefresh', () => {
  it('refreshes once after the delay when a change arrives while visible, not before it', () => {
    vi.useFakeTimers();
    const view = makeView(true);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    vi.advanceTimersByTime(DELAY - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.dispose();
    vi.useRealTimers();
  });

  it('refreshes once for a burst of changes within the delay', () => {
    vi.useFakeTimers();
    const view = makeView(true);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    vi.advanceTimersByTime(DELAY / 2);
    changes.fire();
    vi.advanceTimersByTime(DELAY / 2);
    changes.fire();
    vi.advanceTimersByTime(DELAY - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.dispose();
    vi.useRealTimers();
  });

  it('does not refresh for a change while hidden, and refreshes once immediately when shown', () => {
    vi.useFakeTimers();
    const view = makeView(false);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).not.toHaveBeenCalled();

    view.setVisible(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.dispose();
    vi.useRealTimers();
  });

  it('does not refresh when shown with no pending change', () => {
    vi.useFakeTimers();
    const view = makeView(false);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    view.setVisible(true);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).not.toHaveBeenCalled();

    sub.dispose();
    vi.useRealTimers();
  });

  it('does not refresh at the delay when hidden after a change, and refreshes when shown', () => {
    vi.useFakeTimers();
    const view = makeView(true);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    view.setVisible(false);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).not.toHaveBeenCalled();

    view.setVisible(true);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.dispose();
    vi.useRealTimers();
  });

  it('refreshes immediately when shown while a refresh is pending, and not again at the delay', () => {
    vi.useFakeTimers();
    const view = makeView(true);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    view.setVisible(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.dispose();
    vi.useRealTimers();
  });

  it('does not refresh for pending or later changes after dispose', () => {
    vi.useFakeTimers();
    const view = makeView(true);
    const changes = new Emitter<void>();
    const refresh = vi.fn();
    const sub = deferViewRefresh(view, changes.event, refresh, DELAY);

    changes.fire();
    sub.dispose();
    vi.advanceTimersByTime(DELAY * 4);
    changes.fire();
    view.setVisible(false);
    view.setVisible(true);
    vi.advanceTimersByTime(DELAY * 4);
    expect(refresh).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
