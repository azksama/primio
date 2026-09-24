# Primio for Windows — 0.2.6 preview

The Windows application shares the Android application's React client, addon SDK, account API, profiles, library and playback history. Platform-specific code lives in `desktop*.rs`, `desktop.tsx` and `desktop.css`.

## Installation

Run `Primio_0.2.6_x64-setup.exe`. The installer includes the native media player and registers `primio://` and `stremio://` links. Microsoft Edge WebView2 is required; the installer handles its bootstrap if it is missing. This preview is not code-signed.

The portable archive must be extracted completely: keep the `windows` directory beside `primio.exe`. Starting only the executable without its resources will prevent playback. Portable use does not register protocol associations.

## Desktop behavior

- Frameless window with custom drag area, minimize, maximize/restore and close controls.
- Dedicated content scroller. The title bar and bottom navigation occupy separate layout rows, so scrollbars cannot cover either bar.
- Fluid page width with 40 px side margins, responsive poster grids and settings cards arranged in two or three columns. Poster size controls the desktop grid density; Android retains its explicit column setting.
- Dialogs keep the window controls available while preventing interaction with the page behind them.
- Bundled mpv and uosc run in a separate frameless playback window. Audio/subtitle track changes and subtitle styling happen directly in that player without reloading the media.
- Progress is saved every five seconds and on player closure using the content/episode ID. Changing the source URL does not change the resume key.
- Episode selection returns to Primio's source picker. The next episode can be offered in the final 30 seconds or at a supplied outro marker.
- Direct-file offline downloads, local playback, retention policies and optional deletion after watching. Interrupted transfers are marked failed on restart; automatic transfer resumption and offline HLS/DASH packaging are not implemented.
- Account/session/state files use Windows DPAPI for the current Windows user. Application data stays in `%APPDATA%\fr.azks.primio`.
- Episode notifications are checked while Primio is running. This Windows build does not install a background service.

## Build

Prerequisites: Node.js, Rust MSVC toolchain, Visual Studio C++ build tools, WebView2 and 7-Zip.

```powershell
./scripts/prepare-windows.ps1
cd packages/sdk
npm ci
npm run build
cd ../intro-skipper
npm ci
npm run build
cd ../../apps/client
npm ci
npm run tauri -- build --bundles nsis
```

The platform-specific Tauri configuration is merged automatically on Windows. Android's native player and window configuration remain separate. Player downloads are pinned by SHA-256; third-party licenses and source references ship in `windows/licenses`.

## Native integration checks

Use an isolated test profile. Start Primio with the child-process environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9237`. Do not enable it for normal use.

With FFmpeg on PATH, run `node scripts/serve-windows-fixture.mjs` in a separate terminal. It creates a 120-second MKV fixture with H.264 video and two AAC audio tracks, then serves it with byte ranges alongside an SRT track. Run the checks from the repository root:

```powershell
node scripts/check-windows-native.mjs
```

The script exercises Tauri commands and the bundled player's JSON IPC, uses explicit readiness conditions and verifies downloaded bytes against the fixture's SHA-256. `PRIMIO_INSPECT_PLAYER=1` pauses for 45 seconds for visual inspection. It restores the previous encrypted progress file and removes its test download.

## Validation on 24 September 2026

- Client: 38 tests passed; TypeScript and Vite production build passed.
- Rust: library tests and formatting check passed.
- Browser regression harness: navigation, source filters, descriptions, profiles, calendar, library, density and scrolling passed with mock providers/native bridge. This is not an Android device test.
- Native integration: 12 checks passed, including playback, pause, track changes without reload, subtitle style, episode menu, end-of-file prompt, progress, alternative-source resume, download integrity, local playback, deletion and invalid input rejection.
- Windows UI: home and settings inspected at 1280 px and 2048 px window widths. Custom maximize/restore, minimize, close and controls during an open dialog verified. Episode menu inspected in the native player.
- NSIS installation completed with exit code 0. Native integration checks also passed against the installed application, including its bundled player. The `primio://` registry command resolves to the installed executable.

These checks use a generated local media fixture. Arbitrary provider streams, DRM playback, Windows 10, and physical Android devices were not validated by this Windows pass.
