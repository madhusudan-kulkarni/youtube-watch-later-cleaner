/**
 * Injected into the YouTube tab via chrome.scripting.executeScript({func}).
 * MUST stay fully self-contained: no imports, no references to anything
 * outside this function body — the source is serialized at injection time.
 */
export function runCleaner() {
  const BATCH_SIZE = 200;
  const BATCH_WAIT_MS = 300000;
  const DELETION_WAIT_MS = 700;

  const STEP_TIMEOUT_MS = 4000;
  const STEP_RETRIES = 3;
  const POLL_MS = 100;
  const EMPTY_CHECK_MS = 1200;
  const HEARTBEAT_INTERVAL_MS = 5000;

  let count = 0;
  let stopped = false;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  chrome.runtime.onMessage.addListener((msg: { action?: string }) => {
    if (msg && msg.action === 'cleaner:stop') stopped = true;
  });

  function report(type: string) {
    try {
      chrome.runtime.sendMessage(
        { type, removedCount: count },
        () => void chrome.runtime.lastError
      );
    } catch {
      /* extension context gone — keep cleaning */
    }
  }

  async function waitFor<T>(
    check: () => T | null | undefined | false,
    timeoutMs: number
  ): Promise<T | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = check();
      if (value) return value;
      if (stopped || Date.now() >= deadline) return null;
      await sleep(POLL_MS);
    }
  }

  function visible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function firstRenderer(): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>('ytd-playlist-video-renderer')) {
      if (visible(el)) return el;
    }
    return null;
  }

  /**
   * Locale-proof matching for the "Remove from Watch later" menu item.
   * Substring fragments of that phrase per language; first hit wins.
   */
  const REMOVE_PHRASES: string[] = [
    'remove from', // en
    'entfernen', // de — "Aus "Später ansehen" entfernen"
    'supprimer de', // fr
    'eliminar de', // es
    'eliminar del', // es
    'remover de', // pt
    'remover do', // pt
    'remover da', // pt
    'rimuovi da', // it
    'удалить из', // ru
    'видалити з', // uk
    'から削除', // ja — "「後で見る」から削除"
    '에서 삭제', // ko
    '移除', // zh-CN / zh-TW
    '刪除', // zh-TW variant
    'إزالة من', // ar
    "से हटाएं", // hi
    'kaldır', // tr
    'usuń z', // pl
    'verwijderen uit', // nl
    'hapus dari', // id
    'xóa khỏi', // vi
    'ta bort från', // sv
    'fjern fra', // da / no
    'poista soittolistasta' // fi
  ];

  const MENU_ITEM_SELECTOR =
    'ytd-menu-popup-renderer tp-yt-paper-item, ytd-menu-popup-renderer ytd-menu-service-item-renderer';

  function findRemoveItem(): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)) {
      if (!visible(el)) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text) continue;
      if (REMOVE_PHRASES.some((phrase) => text.includes(phrase))) return el;
    }
    return null;
  }

  function findMenuButton(video: HTMLElement): HTMLElement | null {
    for (const btn of video.querySelectorAll<HTMLElement>('ytd-menu-renderer button')) {
      if (visible(btn)) return btn;
    }
    return null;
  }

  function closeMenu() {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    );
  }

  async function removeVideo(video: HTMLElement): Promise<boolean> {
    const menuButton = findMenuButton(video);
    if (!menuButton) return false;

    menuButton.click();

    const item = await waitFor(findRemoveItem, STEP_TIMEOUT_MS);
    if (!item) {
      closeMenu();
      return false;
    }

    item.click();

    const gone = await waitFor(() => !video.isConnected, STEP_TIMEOUT_MS);
    if (!gone) closeMenu();
    return !!gone;
  }

  function scrollListToTop() {
    const list = document.querySelector('ytd-playlist-video-list-renderer');
    const scroller = list?.querySelector('#contents') ?? list;
    scroller?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  /** Sleep in slices, reporting progress so the popup never sees a stale run. */
  async function pacedWait(totalMs: number) {
    let nextBeat = Date.now() + HEARTBEAT_INTERVAL_MS;
    const end = Date.now() + totalMs;
    while (Date.now() < end && !stopped) {
      await sleep(Math.min(POLL_MS * 5, Math.max(0, end - Date.now())));
      if (!stopped && Date.now() >= nextBeat) {
        report('cleaner:progress');
        nextBeat += HEARTBEAT_INTERVAL_MS;
      }
    }
  }

  async function run() {
    while (!stopped) {
      let video = await waitFor(firstRenderer, EMPTY_CHECK_MS);

      // Virtualized list may need a nudge to render more items.
      if (!video) {
        scrollListToTop();
        video = await waitFor(firstRenderer, EMPTY_CHECK_MS);
        if (!video) break; // playlist exhausted
      }

      let removed = false;
      for (let attempt = 0; attempt < STEP_RETRIES && !stopped && !removed; attempt++) {
        removed = await removeVideo(video);
        if (!removed) {
          closeMenu();
          await sleep(300);
        }
      }

      if (!stopped && !removed) {
        report('cleaner:error');
        return;
      }

      count++;
      report('cleaner:progress');

      if (!stopped && count % BATCH_SIZE === 0) {
        await pacedWait(BATCH_WAIT_MS);
      } else if (!stopped) {
        await pacedWait(DELETION_WAIT_MS);
      }
    }

    report('cleaner:done');
  }

  run();
}
