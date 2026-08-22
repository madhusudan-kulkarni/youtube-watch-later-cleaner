export type CleanerStatus = 'idle' | 'running' | 'stopping' | 'done' | 'error';

export interface CleanerState {
  status: CleanerStatus;
  removedCount: number;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  error?: string;
  tabId?: number;
}

export const WL_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=WL';
export const WL_URL_PATTERN = /^https:\/\/www\.youtube\.com\/playlist\?(?:.*&)?list=WL(?:&|$|#)/;
const STATE_KEY = 'cleanerState';
export const STALE_MS = 15_000;

export const idleState = (): CleanerState => ({
  status: 'idle',
  removedCount: 0,
  startedAt: 0,
  updatedAt: Date.now()
});

export async function readCleanerState(): Promise<CleanerState> {
  const result = await chrome.storage.session.get(STATE_KEY);
  return (result[STATE_KEY] as CleanerState | undefined) ?? idleState();
}

export async function writeCleanerState(patch: Partial<CleanerState>): Promise<CleanerState> {
  const next = { ...(await readCleanerState()), ...patch, updatedAt: Date.now() };
  await chrome.storage.session.set({ [STATE_KEY]: next });
  return next;
}

export async function resetCleanerState(): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: idleState() });
}

export function isStale(state: CleanerState): boolean {
  if (state.status !== 'running' && state.status !== 'stopping') return false;
  return Date.now() - state.updatedAt > STALE_MS;
}
