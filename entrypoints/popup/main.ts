import './styles.css';

const app = document.getElementById('app')!;
let port: chrome.runtime.Port | null = null;

function viewNormal() {
  app.textContent = '';
  const h1 = document.createElement('h1');
  h1.textContent = 'Watch Later Cleaner';
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = 'Clean';
  btn.onclick = viewConfirm;
  app.append(h1, btn);
}

function viewConfirm() {
  app.textContent = '';
  const p = document.createElement('p');
  p.className = 'confirm-text';
  p.textContent = 'Remove videos from Watch Later?';
  const row = document.createElement('div');
  row.className = 'row';
  const cancel = document.createElement('button');
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  cancel.onclick = viewNormal;
  const start = document.createElement('button');
  start.className = 'danger';
  start.textContent = 'Start';
  start.onclick = startDeletion;
  row.append(cancel, start);
  app.append(p, row);
}

function viewRunning() {
  app.textContent = '';
  const h1 = document.createElement('h1');
  h1.textContent = 'Watch Later Cleaner';
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = 'Running\u2026';
  btn.disabled = true;
  app.append(h1, btn);
}

function viewDone(count: number) {
  app.textContent = '';
  const p = document.createElement('p');
  p.className = 'done-text';
  p.textContent = `Done \u2014 ${count} removed`;
  app.append(p);
}

function startDeletion() {
  viewRunning();
  port = chrome.runtime.connect({ name: 'popup' });
  port.postMessage({ action: 'startDeletion', settings: {} });
  port.onMessage.addListener((msg: { type: string; removedCount?: number }) => {
    if (msg.type === 'cleaner:done' || msg.type === 'cleaner:stopped') {
      viewDone(msg.removedCount ?? 0);
      port?.disconnect();
      port = null;
    }
  });
  port.onDisconnect.addListener(() => {
    if (port) { port = null; viewNormal(); }
  });
}

viewNormal();
