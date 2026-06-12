# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
