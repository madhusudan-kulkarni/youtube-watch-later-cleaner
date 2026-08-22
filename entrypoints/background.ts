import { runCleaner } from './shared/cleaner';
import {
  STALE_MS,
  WL_URL_PATTERN,
  readCleanerState,
  resetCleanerState,
  writeCleanerState,
  type CleanerState
} from './shared/state';

export default defineBackground(() => {
  void readCleanerState().then(updateBadge);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.cleanerState?.newValue) {
      void updateBadge(changes.cleanerState.newValue as CleanerState);
    }
  });

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
  | {
      type: 'cleaner:progress';
      removedCount?: number;
      totalCount?: number;
      coolingDownUntil?: number;
    }
  | { type: 'cleaner:done'; removedCount?: number; totalCount?: number }
  | { type: 'cleaner:error'; error?: string };

async function updateBadge(state: CleanerState) {
  try {
    if (state.status === 'running') {
      if (state.coolingDownUntil && state.coolingDownUntil > Date.now()) {
        await chrome.action.setBadgeText({ text: '⏳' });
        await chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
      } else {
        const text =
          state.removedCount > 999
            ? `${(state.removedCount / 1000).toFixed(1)}k`
            : String(state.removedCount);
        await chrome.action.setBadgeText({ text });
        await chrome.action.setBadgeBackgroundColor({ color: '#e62117' });
      }
    } else if (state.status === 'stopping') {
      await chrome.action.setBadgeText({ text: '…' });
      await chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
    } else if (state.status === 'done') {
      await chrome.action.setBadgeText({ text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ color: '#2ba640' });
    } else if (state.status === 'error') {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    /* action badge API not available in current context */
  }
}

async function handleMessage(msg: RuntimeMessage): Promise<unknown> {
  switch (msg?.type) {
    case 'cleaner:start':
      return startDeletion();
    case 'cleaner:stop':
      return stopDeletion();
    case 'cleaner:progress': {
      const prev = await readCleanerState();
      return writeCleanerState({
        removedCount: msg.removedCount ?? 0,
        totalCount: msg.totalCount ?? prev.totalCount,
        coolingDownUntil: msg.coolingDownUntil
      });
    }
    case 'cleaner:done': {
      const prev = await readCleanerState();
      return writeCleanerState({
        status: 'done',
        removedCount: msg.removedCount ?? 0,
        totalCount: msg.totalCount ?? prev.totalCount,
        coolingDownUntil: undefined,
        startedAt: prev.startedAt || Date.now(),
        endedAt: Date.now()
      });
    }
    case 'cleaner:error':
      return writeCleanerState({
        status: 'error',
        coolingDownUntil: undefined,
        error: msg.error ?? 'Unknown error'
      });
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
    totalCount: undefined,
    coolingDownUntil: undefined,
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
      coolingDownUntil: undefined,
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
      ? { status: 'done', endedAt: Date.now(), coolingDownUntil: undefined }
      : { status: 'error', error: message, coolingDownUntil: undefined }
  );
}
