# Primio 0.2.21 Preview — Episode previews, home and discovery

- Episode previews use a readable 16:9 thumbnail, a one-line title and a clipped synopsis. Their viewing progress is shown inside the thumbnail. Native artwork downloads follow up to three HTTPS redirects, and Windows keeps images visible beneath the player interface.
- Marking an episode watched or unwatched updates the open list immediately. Its measured playback position is preserved. The current episode remains selected and scrolled into view.
- Seeking feedback is smaller and fades once. Repeated taps or clicks accumulate the configured forward or backward step; the native commands preserve every requested seek.
- Featured titles follow the selected interface font. Swipe left or right to change the featured title. Automatic rotation runs every 15 seconds, with a circular remaining-time indicator around Pause; pausing, leaving Home or hiding the app freezes its clock.
- Search results and suggestions honor the selected category and advanced filters even when a search term is present. The Anime filter keeps unrelated movies and series out of the results.
- Standard genre names follow the interface language while provider filter values remain unchanged. Surprise me and its secondary action are translated in all eight supported languages, including Spanish.
- Continue watching's See all button opens the complete Continue watching list, with its own back navigation.

Validation: 177 client tests, 6 SDK tests, 13 Rust tests, 19 API tests on isolated SQLite and 3 site tests passed. Responsive browser checks passed at 390, 1024 and 1440 px, including carousel timing, both swipe directions, episode progress, status edits and filtered search. Localization was checked in all eight languages. The production Windows player was exercised in real mpv, including accumulated configurable seeks, thumbnails, watched edits, countdown cancellation and 4:3 PiP.

Android was exercised on the Primio Medium API 36.1 emulator. Real HTTPS episode images, progress bars and edits in the open selector were visually checked; four taps displayed +30 seconds. The existing instrumentation suite passed 16 of 17 tests, including audio/subtitle controls, episode transitions and PiP. The remaining historical warning test pauses four seconds before a segment and still expects the former five-second warning; the application now starts that warning three seconds before the segment. A warning at two seconds before the segment was observed manually. The test source was not rewritten because the required ARTEMIS exploration tools were unavailable in this session.

Native release builds, APK versionCode 2021, ARM64/x86_64 libraries, v2/v3 signatures and 16 KB ZIP alignment were verified. The final Windows installer was installed and launched in version 0.2.21. The Android preview retains its existing development certificate; Windows remains an unsigned preview. Physical Android devices and every provider stream are outside this validation.

Application and SDK sources are public. Account services, website, deployment configuration and internal context remain private. The SDK stays at 0.4.0 and Intro Skipper at 0.2.1.
