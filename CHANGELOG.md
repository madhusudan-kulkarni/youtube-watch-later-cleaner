# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.1.0] - 2026-08-22

### Added

- **Live toolbar badge** — displays running count (`12`, `150`, `1.2k`), cooldown indicator (`⏳`), and completion badge (`✓`) directly on the extension icon
- **Total count & percentage progress** — detects total playlist count and renders a deterministic progress fill bar
- **Cooldown countdown** — 5-minute safety pauses display a live countdown timer in the popup
- **Keyboard navigation** — press <kbd>Escape</kbd> to cancel confirm dialogs or dismiss errors
- **Stop button** — aborts a run cleanly between removals; already-completed work is kept
- **Live progress** — popup shows running removal count and elapsed time while cleaning
- **Done view** — final count plus duration, with *Run again* and *Done* actions
- **Error handling** — failed injections and interruptions surface as an explicit error state instead of hanging on "Running…"
- **Wrong-page detection** — starting outside the Watch Later playlist offers an *Open Watch Later* shortcut
- **Interruption detection** — closing or reloading the tab mid-run is detected and reported
- **Minimum browser versions** — Chrome 102+, Firefox 115+ (required by `storage.session`)
- **ESLint** (`npm run lint`) and a build-time verifier (`npm run test`) that proves the injected cleaner stays self-contained after minification

### Changed

- Run state persists in `chrome.storage.session`, so the popup can be closed and reopened mid-run without losing progress or the final result
- Menu matching is locale independent: structural selectors plus a phrase dictionary covering 25+ languages replace English-only labels
- Fixed delays replaced with polling (`waitFor`) and up to three verified retries per step; each removal is confirmed before counting
- Popup redesigned with a YouTube-style dark theme (light-mode aware), focus rings, `aria-live` status announcements, and reduced-motion support

### Fixed

- Completion message is no longer lost when the MV3 service worker suspends during long runs
- Silent failure on non-Watch Later pages (previously reported "Done — 0 removed")
- A single transient hiccup no longer ends the run misreported as success
- Reopening the popup mid-run can no longer start a second competing cleaner

### Removed

- Dead settings plumbing (batch size and delay parameters were never user-configurable)

## [2.0.0]

- Migrated to WXT, dropped React, shipped Firefox MV2 alongside Chrome MV3

## [1.0.0]

- Initial release
