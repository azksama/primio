# UI and playback validation — 28 September 2026

## Scope and observed corrections

- Progressive sources: delayed first addon, fast second addon, stable priority tabs, immediate usable results and stable DOM keys when the first response arrives. Pending status is compact.
- Mobile 390×844 and desktop 1440×900: Random discovery, advanced filters, hero/detail logo, personal TMDB token validation/error/save flow, source list. No horizontal overflow found in these flows.
- TMDB settings: initial review found a short unstyled token field and excessive margins inherited from generic actions. The final field is 48 px high with compact, spaced actions. Credentials are not rendered after saving.
- Native player: removed broad black overlays, retained circular glass buttons, improved timeline position/knob and added text shadow for bright video frames. Seek icons use Hugeicons Stroke Rounded on both platforms.
- Windows: preview stays above the cursor/timecode without changing playback; hold and drag advances by whole seconds and preserves pause state.
- Countdown follows the video clock during the five seconds preceding intro/recap/outro, pauses when playback pauses, and yields immediately to segment actions after the start. Tests include seeking directly into a segment.
- Android testing uses Primio_Medium_API_36_1 / emulator-5554, direct ARTEMIS observations and ADB, without autonomous Gemini tasks.

## Evidence

- `scripts/check-discovery-ui.mjs`: native/provider fixtures, mobile and desktop. Includes wrong TMDB token, valid fixture token, separate secure storage, external metadata query, progressive addon results and existing discovery/profile/plugin flows.
- `apps/client/src/random-discovery.test.ts`: filters, canonical IDs, anime classification, exclusions, credentials, provider errors, caching and separate account credential storage.
- `scripts/check-windows-preview.mjs`: actual bundled mpv player, decoded frames, countdown timing and hold-to-scrub behavior.
- `scripts/test-android-player.ps1`: 17 Android instrumentation scenarios, including audio/subtitle changes, subtitle style/fonts, preview, PiP, next episode, notification checks, countdown and horizontal scrubbing.
- `scripts/check-android-ui.mjs`: real Android WebView, navigation, settings, font import, layout bounds and pinch policy.
- `impeccable detect`: one advisory about the established Inter font. Existing Primio typography retained.

Screenshots are saved under `tmp/validation-discovery`, `tmp/validation-discovery-desktop`, and `tmp/validation-v0212` (the native validation scripts retain that existing output directory).

## Limits

TMDB success paths use fixtures because no personal credential was supplied; AniList metadata was also queried live. No physical-device or additional two-device account validation is claimed. Token setup uses TMDB's documented [API Read Access Token](https://developer.themoviedb.org/docs/authentication-application) and [credential validation endpoint](https://developer.themoviedb.org/reference/authentication-validate-key).
