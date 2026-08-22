/**
 * Verifies that the injected cleaner survives bundling/minification as a
 * fully self-contained function — the hard requirement for
 * chrome.scripting.executeScript({func}), which serializes the function
 * source alone. Any reference leaking to an outer scope would throw
 * ReferenceError inside the page at runtime.
 *
 * Extracts the cleaner from the built background bundle, re-creates it the
 * same way executeScript does (new Function), and executes it under
 * browser stubs in two scenarios: empty playlist (clean exit) and
 * immediate stop request.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const target = process.argv[2] ?? '.output/chrome-mv3/background.js';
const src = readFileSync(target, 'utf8');

function extractFunction(marker) {
  let idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`marker ${marker} not found in ${target}`);

  while (idx !== -1) {
    const kw = src.lastIndexOf('function', idx);
    if (kw !== -1) {
      const open = src.indexOf('{', kw);
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
          depth--;
          if (depth === 0) {
            const candidate = src.slice(kw, i + 1);
            if (candidate.includes(marker)) return candidate;
            break;
          }
        }
      }
    }
    idx = src.indexOf(marker, idx + 1);
  }
  throw new Error('could not extract enclosing function');
}

function makeSandbox() {
  const sent = [];
  let listener;
  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => (listener = fn) },
      sendMessage: (msg, cb) => {
        sent.push(msg);
        cb?.();
      },
      lastError: null
    }
  };
  const emptyList = () => ({ length: 0, [Symbol.iterator]: function* () {} });
  const document = {
    querySelectorAll: emptyList,
    querySelector: () => null,
    body: { dispatchEvent: () => {} }
  };
  const location = { href: 'https://www.youtube.com/playlist?list=WL' };
  const context = vm.createContext({
    chrome,
    document,
    location,
    window: { scrollTo: () => {}, location },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  });
  return { sent, listener: () => listener, context };
}

const cleanerSrc = extractFunction('cleaner:stop');
console.log(`extracted ${cleanerSrc.length} chars from ${target}`);

// Scenario 1: empty playlist → must exit cleanly reporting done(0).
{
  const { sent, context } = makeSandbox();
  const restored = vm.runInContext(`(${cleanerSrc})`, context);
  restored(); // would throw ReferenceError if it referenced outer-scope vars
  await new Promise((r) => setTimeout(r, 3500));
  const done = sent.find((m) => m.type === 'cleaner:done');
  if (!done || done.removedCount !== 0) {
    console.error('FAIL empty-playlist scenario:', sent);
    process.exit(1);
  }
  console.log('PASS empty playlist → done(0)');
}

// Scenario 2: stop signal before start → immediate exit.
{
  const { sent, listener, context } = makeSandbox();
  const restored = vm.runInContext(`(${cleanerSrc})`, context);
  restored();
  listener()?.({ action: 'cleaner:stop' });
  await new Promise((r) => setTimeout(r, 1500));
  const done = sent.find((m) => m.type === 'cleaner:done');
  if (!done || done.removedCount !== 0) {
    console.error('FAIL stop scenario:', sent);
    process.exit(1);
  }
  console.log('PASS stop signal → done(0)');
}

console.log('cleaner serialization verified');
