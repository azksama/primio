# Primio 0.2.20 Preview — Playback, episodes and continue watching

- Click a three-second opening or ending countdown to cancel its automatic skip for that segment. Manual skipping stays available. The countdown takes priority over the next-episode prompt; canceling the fallback countdown also suspends automatic chaining until you choose the next episode.
- Native episode selectors show a thumbnail on the left with a one-line title and clipped synopsis on the right. Every row has the same height, and the current season and episode are selected and scrolled into view. Episode titles on detail pages stay on one line too.
- Watching more than 50% of an episode marks preceding regular episodes as watched without changing their saved positions. Manual status edits during that playback session remain respected.
- After finishing an episode, Continue watching offers the next available episode. Future releases are reconsidered when metadata refreshes. Starting from Continue watching hydrates the full episode list before launching the player, preserving the Episodes button.
- Picture-in-picture follows the actual video aspect ratio. Android's source rectangle excludes screen letterboxing, and the previous fill mode is restored after PiP. Windows applies the corresponding window size without stretching the video.
- OLED accent colors persist through account synchronization and imports of older states. Installed plugins have icons, with a theme or capability fallback when no image is available.
- AniSkip matching supports MAL, Kitsu and AniList identifiers and unambiguous exact title aliases for first-season anime. Empty results have a shorter cache, concurrent requests are shared, and IntroDB remains a fallback. Tougen Anki resolves to MAL 58811; AniSkip's observed coverage remains partial and missing segments are not invented.
- Plugin SDK 0.4.0 adds an optional HTTPS `icon` URL without embedded credentials. Existing manifests remain compatible. Intro Skipper is updated to 0.2.1.

Validation: 174 client tests, 6 SDK tests, 13 Rust tests, 19 related server tests on an isolated SQLite test database and 3 site tests passed. TypeScript/Vite and native release builds passed. The Android artifact's version, ARM64/x86_64 libraries, v2/v3 signatures, unchanged preview certificate and 16 KB ZIP alignment were verified. SDK 0.4.0 was installed and checked from its packed artifact in a fresh project. Responsive browser checks covered 390×844, 1024×900 and 1440×900; site release labels, links and offline fallback passed in eight languages. The production Windows player scripts were exercised in real mpv with a synthetic video: countdown cancellation, manual skip, episode scrolling and status changes, completion handoff and 4:3 PiP all passed without Lua errors.

The final Windows installer was installed and launched; its app version, custom window controls and absence of overflow or JavaScript errors were checked in WebView2. Installed native scripts match the tested sources byte for byte, and the playback check passed using the installed mpv runtime.

The Android universal release includes ARM64 and x86_64. The new Android player interactions have not been executed on a device in this release: build and signing checks do not establish PiP transitions, touch behavior or thumbnail downloads on hardware. Windows thumbnail rendering used a local fixture; the native HTTPS loader compiled but its network path was not exercised by that playback check. Provider coverage and physical device compatibility remain partial. The Windows preview installer is unsigned; Android retains the existing preview development certificate.

Application and SDK sources are public. Account services, the website and deployment configuration remain private.

The source ZIP includes a follow-up correction to the root project's version number. Application and SDK code remain identical to the release tag; the published binaries and their checksums are unchanged.
