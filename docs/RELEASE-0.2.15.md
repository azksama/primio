# Primio 0.2.15 Preview

- Streaming sources appear as each addon responds, while keeping addon priority and stable result positions.
- Android and Windows players gain circular seek icons, a separate Close control next to Back, icon actions, a clearer timeline and hold-to-scrub gestures. Scrubbing shows only the timeline and timecode.
- Intro, outro and recap warnings start five seconds before the segment. Their countdown follows playback and pauses with the video; skip actions are available immediately inside the segment.
- Larger loading logos with transparent margins removed, content logos over detail artwork, and adaptive detail/player titles without truncation.
- Redesigned Random discovery and advanced filters, plus discreet poster dislike actions.
- Random discovery queries TMDB directly for movies/series using each user's personal API Read Access Token, configured in Settings → Connected services. Credentials are kept in the device's secure vault and separated by Primio account; they are not sent to the Primio backend or included in synchronized state. AniList anime discovery requires no token.
- The source-switching action is named Source.

Validation: 111 client tests, 3 native network checks, native Windows playback/preview/countdown/gesture checks and mobile/desktop browser flow checks. The Android Medium Primio emulator is used for player and real WebView checks. TMDB UI and successful responses are covered with test fixtures; no valid personal TMDB credential or physical phone is used for release validation.

Android retains the existing preview signing certificate. Windows remains an unsigned preview installer. Only application and SDK source code is included; backend and website remain private.
