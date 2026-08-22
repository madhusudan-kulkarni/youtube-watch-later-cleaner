import './styles.css';
import {
  WL_PLAYLIST_URL,
  isStale,
  readCleanerState,
  resetCleanerState,
  type CleanerState
} from '../shared/state';

const app = document.getElementById('app')!;
const live = document.getElementById('live')!;

let currentStatus: string | null = null;
let countEl: HTMLElement | null = null;
let elapsedEl: HTMLElement | null = null;
let ticker: number | undefined;
let startedAt = 0;

/* ---------- helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(text: string) {
  live.textContent = text;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function stopTicker() {
  if (ticker !== undefined) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

function startTicker() {
  stopTicker();
  const tick = () => {
    if (elapsedEl && startedAt) elapsedEl.textContent = formatDuration(Date.now() - startedAt);
  };
  tick();
  ticker = window.setInterval(tick, 1000);
}

function header(): HTMLDivElement {
  const row = el('div', 'header');
  const mark = el('div', 'logo');
  mark.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>';
  row.append(mark, el('span', undefined, 'Watch Later Cleaner'));
  return row;
}

function icon(kind: 'check' | 'alert'): HTMLDivElement {
  const box = el('div', `icon ${kind === 'check' ? 'icon-ok' : 'icon-warn'}`);
  const path =
    kind === 'check'
      ? '<path d="m4 12.5 5 5L20 6.5"/>'
      : '<path d="M12 8v5m0 3.5v.5M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>';
  box.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  return box;
}

function button(
  className: string,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const btn = el('button', `btn ${className}`, label);
  btn.addEventListener('click', onClick);
  return btn;
}

async function sendMessage(message: { type: string }): Promise<{ ok?: boolean; reason?: string } | undefined> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}

const openPlaylist = () => chrome.tabs.create({ url: WL_PLAYLIST_URL });

/* ---------- views ---------- */

function renderHome(opts: { wrongPage: boolean }) {
  app.textContent = '';
  app.append(header());

  if (opts.wrongPage) {
    const p = el('p', 'note', 'Open your Watch Later playlist on YouTube, then run the cleaner from that tab.');
    app.append(p, button('btn-primary', 'Open Watch Later', openPlaylist));
  } else {
    app.append(
      el('p', 'note', 'Removes every video in your Watch Later playlist, one by one, with built-in safe delays.'),
      button('btn-primary', 'Clean playlist', renderConfirm)
    );
  }
  announce('Idle. Ready to clean.');
}

function renderConfirm() {
  app.textContent = '';
  app.append(header());
  app.append(el('h1', undefined, 'Remove videos?'));
  app.append(
    el('p', 'confirm-text', 'Every video in your Watch Later playlist will be removed.')
  );

  const row = el('div', 'row');
  row.append(
    button('btn-secondary', 'Cancel', () => {
      currentStatus = null;
      void checkActiveTab().then((wrongPage) => renderHome({ wrongPage }));
    })
  );
  row.append(button('btn-danger', 'Start cleaning', async () => {
    viewLoading();
    const res = await sendMessage({ type: 'cleaner:start' });
    if (!res) {
      await sync();
    } else if (res.ok === false && res.reason === 'wrong-page') {
      currentStatus = null;
      renderHome({ wrongPage: true });
      announce('Please open the Watch Later playlist first.');
    }
  }));
  app.append(row);
  announce('Confirm: remove all Watch Later videos?');
}

function viewLoading() {
  app.textContent = '';
  app.append(header(), el('p', 'note', 'Starting…'));
}

function renderRunning(state: CleanerState) {
  app.textContent = '';
  app.append(header());

  const statusRow = el('div', 'status-row');
  statusRow.append(el('span', 'dot'), el('span', 'status-label', 'Cleaning\u2026'));
  app.append(statusRow);

  const big = el('div', 'count');
  countEl = el('span', 'count-num', String(state.removedCount));
  big.append(countEl, el('span', 'count-label', 'removed'));
  app.append(big);

  const barWrap = el('div', 'bar');
  barWrap.append(el('div', 'bar-fill'));
  app.append(barWrap);

  const meta = el('div', 'meta');
  elapsedEl = el('span', undefined, formatDuration(Date.now() - state.startedAt));
  startedAt = state.startedAt;
  meta.append(elapsedEl);
  app.append(meta);

  app.append(button('btn-danger-outline', 'Stop', () => void sendMessage({ type: 'cleaner:stop' })));
  startTicker();
  announce(`Running. ${state.removedCount} removed so far.`);
}

function renderStopping(state: CleanerState) {
  app.textContent = '';
  app.append(header());

  const statusRow = el('div', 'status-row');
  statusRow.append(el('span', 'dot dot-stopping'), el('span', 'status-label', 'Stopping\u2026'));
  app.append(statusRow);

  const big = el('div', 'count');
  countEl = el('span', 'count-num', String(state.removedCount));
  big.append(countEl, el('span', 'count-label', 'removed'));
  app.append(big);

  app.append(el('p', 'note', 'Finishing the current removal.'));
  announce('Stopping.');
}

function renderDone(state: CleanerState) {
  stopTicker();
  app.textContent = '';
  app.append(header(), icon('check'));
  app.append(el('h1', undefined, 'Done'));

  const line = el('p', 'done-text');
  const b = el('strong', undefined, String(state.removedCount));
  line.append(b, ` video${state.removedCount === 1 ? '' : 's'} removed`);
  app.append(line);

  if (state.startedAt && state.endedAt) {
    app.append(el('p', 'meta', `Took ${formatDuration(state.endedAt - state.startedAt)}`));
  }

  const row = el('div', 'row');
  row.append(
    button('btn-secondary', 'Run again', renderConfirm),
    button('btn-primary', 'Done', async () => {
      try {
        await resetCleanerState();
      } catch {
        /* still close */
      }
      window.close();
    })
  );
  app.append(row);
  announce(`Done. ${state.removedCount} removed.`);
}

function renderError(state: CleanerState) {
  stopTicker();
  app.textContent = '';
  app.append(header(), icon('alert'));
  app.append(el('h1', undefined, 'Something went wrong'));
  app.append(el('p', 'error-text', state.error || 'Unknown error'));

  const row = el('div', 'row');
  row.append(
    button('btn-secondary', 'Dismiss', () => {
      currentStatus = null;
      void resetCleanerState().then(() => void sync());
    }),
    button('btn-primary', 'Try again', renderConfirm)
  );
  app.append(row);

  if (!state.tabId) {
    app.append(button('btn-secondary open-btn', 'Open Watch Later', openPlaylist));
  }
  announce(`Error: ${state.error ?? 'unknown'}.`);
}

/* ---------- state sync ---------- */

function buildView(state: CleanerState) {
  stopTicker();
  countEl = null;
  elapsedEl = null;

  switch (state.status) {
    case 'idle':
      void checkActiveTab().then((wrongPage) => renderHome({ wrongPage }));
      break;
    case 'running':
      renderRunning(state);
      break;
    case 'stopping':
      renderStopping(state);
      break;
    case 'done':
      renderDone(state);
      break;
    case 'error':
      renderError(state);
      break;
  }
}

function updateData(state: CleanerState) {
  if (countEl) countEl.textContent = String(state.removedCount);
  if (elapsedEl && state.startedAt) {
    elapsedEl.textContent = formatDuration(Date.now() - state.startedAt);
  }
}

async function checkActiveTab(): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return !tab?.url || !tab.url.includes('list=WL');
  } catch {
    return true;
  }
}

async function sync(): Promise<void> {
  let state = await readCleanerState();

  if (isStale(state)) {
    state = {
      ...state,
      status: 'error',
      error: 'The cleaner stopped responding. It may have been interrupted.'
    };
  }

  if (state.status !== currentStatus) {
    currentStatus = state.status;
    buildView(state);
  }
  updateData(state);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.cleanerState) void sync();
});

void sync();
