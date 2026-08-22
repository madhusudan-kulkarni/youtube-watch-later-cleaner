# YouTube Watch Later Cleaner

[![Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/watch-later-cleaner/)

Clears your entire Watch Later playlist with built-in safe delays, live progress, and a Stop button.

## Features

- **One click cleanup** — removes every video in Watch Later from the playlist page
- **Live progress** — the popup shows the running removal count and elapsed time
- **Stop anytime** — aborts cleanly between removals; already-completed work is kept
- **Locale independent** — matches YouTube's context menu across 25+ languages instead of relying on English labels
- **Resilient** — retries transient failures, verifies each removal, and detects interruptions (tab closed or reloaded)
- **Safe pacing** — small delay between removals and a longer pause every 200 videos to stay gentle with YouTube
- **Private** — no analytics, no remote code, nothing leaves your browser. State lives in `chrome.storage.session` and is cleared when the browser closes

## Usage

1. Open `https://www.youtube.com/playlist?list=WL`
2. Click the extension icon → **Clean playlist** → **Start cleaning**
3. Watch the count climb — hit **Stop** whenever you like

## How it works

The popup asks the background worker to inject a cleaner into the active tab.
The cleaner opens each video's action menu, clicks "Remove from Watch Later"
(matched against a localized phrase dictionary), verifies the video actually
left the list, then moves on. Progress is written to `chrome.storage.session`,
so the popup can be closed and reopened mid-run without losing state.

## Development

```bash
npm install
npm run dev            # Chrome dev mode
npm run dev:firefox    # Firefox dev mode

npm run compile        # typecheck
npm run lint           # eslint
npm run build          # build both targets + verify injected-script integrity
npm run test           # verify bundled cleaner serialization (requires prior build)
```

- **Chrome:** Load `.output/chrome-mv3` from `chrome://extensions`
- **Firefox:** Load `.output/firefox-mv2` from `about:debugging#/runtime/this-firefox`

## License

MIT
