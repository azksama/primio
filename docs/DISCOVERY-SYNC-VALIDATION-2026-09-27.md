# Primio — discovery, personalization and navigation

Implemented locally after the published 0.2.13 preview. This document does not announce a new release.

## Changes

- Primio account synchronization at startup, after local edits, every 30 seconds while visible, and on reconnect/focus. Three-way merging preserves concurrent changes and deletions; version conflicts are retried. This is not permanent Stremio synchronization.
- Declarative SDK 0.2, compatible with schema 1 and 2. Permissions cover themes, layout, accessibility, spoilers, viewing orders, pages, addons and source ranking. The integrated store contains 16 validated plugins including six themes. Themes/plugins remain local to each device.
- Custom viewing orders; optional collection icons, sorting and planned/watching/completed states. Playback updates automatically supersede a manual state when actual progress changes.
- Episode anti-spoilers with an explicit reveal action. Watched episodes stay visible.
- Player source switching at the current position, playback speed, semantic audio/subtitle preferences between episodes, and separate recap skipping. AniSkip was already integrated; recap controls extend that integration.
- Random selection with optional constraints; profile recommendations use up to four watched/library titles, shared genres/actors/directors, mood and runtime. Dismissals are stored per profile.
- Profile PINs use salted PBKDF2 hashes and local retry throttling. Protected profiles require unlocking again after restart, including automatically selected profiles. This is a profile access control, not a separate account authorization system.
- Search includes title completion, typo matching, actors/directors available in metadata, collections in completion, supported natural-language filters and voice input. Discover combines years, rating, runtime, country and genre.
- Home and Explorer stay mounted after first visit within the active profile. Results, filters and scroll are retained when opening a detail or changing tabs. Profiles have separate page instances.
- Metadata: merge useful fields from multiple eligible addons, retain higher-priority nonempty values and artwork, merge episodes by ID, share concurrent requests and cache successful results briefly. Failed requests are retryable. Malformed scalar/array fields are discarded, and detail loading always exits even after an unexpected failure. Partial/unavailable details have a retry button.

## Validation

| Check | Result |
|---|---|
| Client Vitest | 101 tests / 20 files passed |
| SDK Vitest | 4 tests passed |
| API functional/validator suite | 15 tests passed |
| SDK, intro-skipper, client TypeScript/Vite and API builds | Passed |
| Windows Rust cargo check | Passed |
| Android ARM64 + x86_64 debug APK | Built |
| Medium Primio API 36.1 native player instrumentation | 16 scenarios passed |
| Real Android WebView | Navigation, Addons/Plugins, subtitle settings, font import/native bridge, horizontal bounds and blocked interface pinch zoom passed |
| Windows mpv | Real decoded cursor thumbnail, fit/fill, five-second intro countdown, semantic track restoration/manual persistence, recap skip, speed and current-episode source request passed |
| Browser mobile + desktop shell | Mocked providers/native bridge: random draw, completion, combined natural filters, PIN restart/wrong code/unlock, plugin activation, retained catalog DOM/scroll and no extra catalog fetch on navigation passed |

Runnable checks: `npm --prefix apps/client test`, `npm --prefix packages/sdk test`, `npm --prefix apps/api test`, `node scripts/check-discovery-ui.mjs` (set `PRIMIO_UI_DESKTOP=1` for desktop shell), `scripts/test-android-player.ps1 -DeviceSerial emulator-5554`, `node scripts/check-android-ui.mjs emulator-5554`, `node scripts/check-windows-preview.mjs`, `node scripts/check-windows-preferences.mjs`.

Browser captures are under `tmp/validation-discovery` and `tmp/validation-discovery-desktop`; native artifacts are under `tmp/player-tests` and `tmp/validation-v0212` (existing validation script output directory). Provider responses are mocked in browser tests; native player tests use controlled local media.

Medium Primio initially crashed in NVIDIA `nvoglv64.dll`, terminating QEMU. Switching this AVD from GPU auto to software rendering allowed all 16 scenarios to complete. The original AVD config is backed up beside config.ini. ARTEMIS screenshots and ADB were used directly, without the autonomous Gemini service.

## Limits and release prerequisites

- Search/recommendations use installed catalog results and available metadata, not a global people index or a language model. At most two catalogs per requested type and 100 results per catalog are loaded; detailed enrichment is limited to 36 candidates (24 for recommendations). Missing metadata cannot satisfy a constrained filter. Natural-language parsing supports the documented French/English examples, not arbitrary questions.
- Voice uses Android's installed recognizer or Windows System.Speech; microphone permissions and an installed speech language are required. Actual spoken recognition has not been validated on physical devices.
- AniSkip/IntroDB results depend on provider coverage and matching media duration; unknown segment types are ignored.
- New labels are supplied in French/English; other app languages fall back to English for new keys.
- Cross-device merge/conflict behavior is tested against the local API and controlled responses. A live Android-to-PC account round trip with these new fields has not been performed.
- Deploy the private API validator before distributing the new client so PINs, collection controls, track choices and recap/recommendation settings survive server validation. Backend and site remain outside the public app repository.
- No new release, production API deployment or SDK registry publication was performed for this feature batch. A new release must have its own version and signed installation/update validation.
