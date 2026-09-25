# Primio 0.2.12 validation

- 66 client unit tests: history deletion propagation/profile isolation/replay and per-episode source matching, missing and ambiguous sources, URL token protection.
- 14 API functional tests with local SQLite; history deletion remains after stale playback and library synchronization; all three configured provider authorization endpoints return valid URLs.
- Browser checks: name-only collections, long press, multiple selection, batch addition, deletion and visible structured API errors. Unsynced profile is saved before authorization starts. Providers and native bridge are mocked in browser tests.
- Native Windows mpv: a decoded thumbnail follows the pointer horizontally, sits above its timestamp and does not seek the active playback.
- All 14 Android instrumentation tests pass on the Android 16 emulator, including decoded seek-preview positioning. The preview fixture uses baseline H.264 with even dimensions because the platform decoder rejected the original 853-pixel-wide fixture. Unsupported platform codecs and authenticated remote sources still require device/provider validation.
- Android ARM64/x86_64 release and Windows x64 installer build successfully. APK signature and 16 KiB ZIP alignment verified.

The exact reported provider error is awaiting the user's message. Credentials are present in the running backend. Preparing unsynced profiles and displaying native structured error messages are fixed; these findings do not establish that real-account OAuth authorization succeeds with every provider.
