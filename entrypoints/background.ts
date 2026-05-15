let popupPort: chrome.runtime.Port | null = null;

export default defineBackground(() => {
  chrome.runtime.onConnect.addListener((port) => {
    popupPort = port;
    port.onDisconnect.addListener(() => { popupPort = null; });

    port.onMessage.addListener((msg) => {
      if (msg.action === 'startDeletion') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (!tab?.id) return;

          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runCleaner,
            args: [msg.settings ?? {}]
          });
        });
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg, _sender) => {
    if (msg.type === 'cleaner:done' || msg.type === 'cleaner:stopped') {
      popupPort?.postMessage({ type: msg.type, removedCount: msg.removedCount ?? 0 });
    }
  });
});

function runCleaner(settings: Record<string, number>) {
  const batchSize = settings.batchSize ?? 200;
  const waitBetweenBatchesMs = settings.waitBetweenBatchesMs ?? 300000;
  const waitBetweenDeletionsMs = settings.waitBetweenRemovalsMs ?? 700;

  let count = 0;

  async function deleteVideoFromWatchLater() {
    const video = document.querySelector('ytd-playlist-video-renderer');
    if (!video) return false;

    const menuButton = video.querySelector<HTMLElement>('button[aria-label="Action menu"], button[aria-label*="Action"]');
    if (!menuButton) return false;

    menuButton.click();
    await new Promise((r) => setTimeout(r, 300));

    const removeItem = document.evaluate(
      '//span[contains(text(),"Remove from")]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue as HTMLElement | null;

    if (!removeItem) return false;

    removeItem.click();
    await new Promise((r) => setTimeout(r, 300));
    return true;
  }

  async function run() {
    while (true) {
      const removed = await deleteVideoFromWatchLater();
      if (!removed) break;
      count++;
      if (count % batchSize === 0) {
        await new Promise((r) => setTimeout(r, waitBetweenBatchesMs));
      } else {
        await new Promise((r) => setTimeout(r, waitBetweenDeletionsMs));
      }
    }
    chrome.runtime.sendMessage({ type: count > 0 ? 'cleaner:done' : 'cleaner:stopped', removedCount: count });
  }

  run();
}
