import { runCleaner } from './shared/cleaner';
import {
  STALE_MS,
  WL_URL_PATTERN,
  readCleanerState,
  resetCleanerState,
  writeCleanerState
} from './shared/state';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse);
    return true;
  });

  // A full page navigation or tab close kills the injected cleaner silently.
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') void markInterrupted(tabId, 'Interrupted — page reloaded');
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void markInterrupted(tabId, 'Interrupted — tab closed');
  });
});

type RuntimeMessage =
  | { type: 'cleaner:start' }
  | { type: 'cleaner:stop' }
  | { type: 'cleaner:progress'; removedCount?: number }
  | { type: 'cleaner:done'; removedCount?: number }
  | { type: 'cleaner:error'; error?: string };

async function handleMessage(msg: RuntimeMessage): Promise<unknown> {
  switch (msg?.type) {
    case 'cleaner:start':
      return startDeletion();
    case 'cleaner:stop':
      return stopDeletion();
    case 'cleaner:progress':
      return writeCleanerState({ removedCount: msg.removedCount ?? 0 });
    case 'cleaner:done': {
      const prev = await readCleanerState();
      return writeCleanerState({
        status: 'done',
        removedCount: msg.removedCount ?? 0,
        startedAt: prev.startedAt || Date.now(),
        endedAt: Date.now()
      });
    }
    case 'cleaner:error':
      return writeCleanerState({ status: 'error', error: msg.error ?? 'Unknown error' });
    default:
      return undefined;
  }
}

async function startDeletion() {
  const current = await readCleanerState();
  if (
    (current.status === 'running' || current.status === 'stopping') &&
    Date.now() - current.updatedAt <= STALE_MS
  ) {
    return { ok: false, reason: 'already-running' };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !WL_URL_PATTERN.test(tab.url)) {
    return { ok: false, reason: 'wrong-page' };
  }

  await writeCleanerState({
    status: 'running',
    removedCount: 0,
    startedAt: Date.now(),
    error: undefined,
    tabId: tab.id
  });

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: runCleaner });
    return { ok: true };
  } catch (err) {
    await writeCleanerState({
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not access this page'
    });
    return { ok: false, reason: 'inject-failed' };
  }
}

async function stopDeletion() {
  const state = await readCleanerState();
  if (state.status !== 'running' && state.status !== 'stopping') {
    await resetCleanerState();
    return { ok: false };
  }

  await writeCleanerState({ status: 'stopping' });

  if (typeof state.tabId === 'number') {
    try {
      await chrome.tabs.sendMessage(state.tabId, { action: 'cleaner:stop' });
    } catch {
      /* receiver gone — staleness handling cleans up */
    }
  }
  return { ok: true };
}

async function markInterrupted(tabId: number, message: string) {
  const state = await readCleanerState();
  if (state.tabId !== tabId) return;
  if (state.status !== 'running' && state.status !== 'stopping') return;

  await writeCleanerState(
    state.status === 'stopping'
      ? { status: 'done', endedAt: Date.now() }
      : { status: 'error', error: message }
  );
}
