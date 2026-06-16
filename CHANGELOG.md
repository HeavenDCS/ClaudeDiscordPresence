# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Test suite + CI.** A dependency-free [`node:test`](test/) suite covers the pure
  logic (presence building, config merge/resolve, duration formatting, model-name
  parsing, atomic writes, …). A GitHub Actions workflow runs the tests and a
  `node --check` pass on every `.js` file across Windows/macOS/Linux on Node
  20/22/24. New scripts: `npm test` and `npm run check`.

### Fixed
- **Usage stats can no longer be wiped by a crash.** `stats.json` (and `config.json`)
  are now written atomically via a temp-file + rename, so a process killed
  mid-write can never leave a truncated file — which `loadAll()` would otherwise
  read as empty, silently resetting today's/this-month's totals.
- **More reliable model auto-detection.** Detection now scans the few most-recent
  Claude session files and takes the first model ID found, instead of reading only
  the single newest file (which, if it happened to contain no model ID, blanked
  out detection entirely).

### Changed
- **Discord setup is now automatic by default.** With a shared `DEFAULT_CLIENT_ID`
  baked into `src/config.js`, installers get working Rich Presence with no Discord
  Developer Portal steps at all — the user-facing `clientId` defaults to empty and
  falls back to the built-in app. Creating your own Discord app is now an optional
  path (the README's setup section was rewritten accordingly).
- Set the repository owner to **HeavenDCS** across `README.md`, `package.json`,
  `config.example.json`, and the in-app button URLs.
- Ship a default `claude.png` logo and point `largeImage` at its raw GitHub URL,
  so the large icon shows out of the box with no Discord art-asset upload.

## [1.1.0] — 2026-06-12

### Added
- **Model display.** Show which model you're using as a reliable `model.label`
  (e.g. "Opus 4.8 · Actively in a conversation"), with an opt-in best-effort
  `model.detect` that reads the model ID from your newest local Claude session
  file and falls back to the label if it finds nothing.
- **Plan + usage display.** Because the desktop app is a flat subscription (no
  per-message dollar cost), the logo tooltip now shows your plan name plus real,
  locally-measured time — e.g. "Claude Max · 2h 14m today · 11h this month".
- **`claude-presence setup`** — an interactive first-time wizard that collects
  your Discord Application ID, model label, and plan, then offers autostart.
- **Zero-setup forks.** A bakeable `DEFAULT_CLIENT_ID` in `src/config.js` lets a
  repo owner ship a working Application ID so end-users need no Discord setup.
- **Image URLs.** `largeImage`/`smallImage` now accept a full `https://` URL to a
  hosted PNG/JPG, so you can skip uploading Discord art assets entirely.

### Changed
- Replaced the single `showDailyStats` toggle with the richer `usage` block.
- `doctor`/`status` now report the resolved Application ID (incl. built-in
  default) and the model that will be shown.

## [1.0.0] — 2026-06-12

### Added
- Initial release. 🎉
- Zero-dependency Discord Rich Presence helper for the Claude Desktop App.
- Hand-rolled Discord local-IPC client (no third-party packages).
- Cross-platform Claude detection via `tasklist` (Windows) and `ps` (macOS/Linux).
- Optional foreground-window detection to show **Active** vs **Idle** state.
- Single-instance lock — only one helper can ever run; closing/reopening Claude
  never spawns duplicates.
- Presence features: elapsed session timer, rotating status messages, large/small
  art-asset images, up to two link buttons, and an optional "time used today" tooltip.
- `claude-presence` CLI: `start`, `stop`, `restart`, `status`, `doctor`,
  `install`, `uninstall`, `config`.
- Run-at-login autostart for Windows (Startup `.vbs`), macOS (LaunchAgent), and
  Linux (XDG autostart).
- Auto-reconnect to Discord and graceful presence-clearing on shutdown.
- Local-only daily usage stats with automatic pruning.
