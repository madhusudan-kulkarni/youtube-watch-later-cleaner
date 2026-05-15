import { useEffect, useState } from 'react';
import './styles.css';

export function App() {
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const port = chrome.runtime.connect({ name: 'popup' });
    port.postMessage({ action: 'startDeletion', settings: {} });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'cleaner:done' || msg.type === 'cleaner:stopped') {
        setRunning(false);
        setDone({ count: msg.removedCount ?? 0 });
      }
    });

    port.onDisconnect.addListener(() => {
      setRunning(false);
    });
  }, [running]);

  if (done) {
    return (
      <main>
        <p className="done-text">Done — {done.count} removed</p>
      </main>
    );
  }

  if (confirming) {
    return (
      <main>
        <p className="confirm-text">Remove videos from Watch Later?</p>
        <div className="row">
          <button className="secondary" onClick={() => setConfirming(false)}>Cancel</button>
          <button className="danger" onClick={() => { setConfirming(false); setRunning(true); }}>
            Start
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Watch Later Cleaner</h1>
      <button className="primary" disabled={running} onClick={() => setConfirming(true)}>
        {running ? 'Running\u2026' : 'Clean'}
      </button>
    </main>
  );
}
