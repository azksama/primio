# Primio 0.2.11 validation

- Client build and 64 unit tests pass, including anime classification, collection profile isolation, diagnostic redaction and OAuth deep links.
- API build and 13 functional tests pass locally with SQLite. Tests cover single-use OAuth state, encrypted credentials, refresh-token preservation, profile ownership, disconnection, diagnostic authentication/redaction/encryption/quota and progress conflict handling.
- Nine Rust tests pass, including updater checksum/stack regression and LAN discovery URL restrictions.
- Android universal release compiles for ARM64 and x86_64. APK signature and 16 KiB zip alignment verified. APK starts on Android 16 emulator.
- Thirteen Android native player instrumentation tests pass: playback, episode transitions, PiP and track changes. These regression tests do not prove receiver compatibility or the pinch gesture on a physical tablet.
- Windows installer builds. Native mpv preview test extracts a 240×135 frame and presents its overlay without changing playback position; fit/fill shortcut checked.
- Browser UI checks pass for existing client navigation, collections and diagnostics. Eight-language website checks and simulated future-release/offline checks pass. Three site server tests pass.

## External validation still needed

OAuth authorization by a real user with each provider; provider-specific mappings for the user's actual library; physical Cast and DLNA receivers and their codecs; real TV remote navigation; preview seeking on authenticated/unsupported formats. Google Cast sender is Android-only; DLNA sender is available on both platforms. See [Connected services](CONNECTED-SERVICES.md) for exact synchronization scope.

The six provider credentials were checked for presence in Dokploy without printing their values. The public application and SDK contain no OAuth client secrets. API and website remain in the private services repository.
