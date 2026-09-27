# Primio 0.2.14 Preview

- Automatic Primio account synchronization across devices, including conflict-safe updates and deletions.
- New plugin store with 16 themes and customization plugins, plus Plugin SDK 0.2.0.
- Collections with icons, viewing states, sorting and automatic progress updates; custom watch orders and anti-spoiler options.
- Profile PIN protection, random picks, richer profile recommendations and dismissible suggestions.
- Search suggestions, typo-tolerant and natural-language filters, voice search support and combined Discover filters.
- Home and Explore retain results, filters and scroll position when returning from a detail page.
- More resilient metadata loading: merge complementary addon responses, deduplicate requests, retry incomplete results and avoid caching failures.
- Player source switching, playback speed, remembered audio/subtitle preferences across episodes and AniSkip recap support.

Validation: 101 client tests, 4 SDK tests, 15 API tests and 16 Android player instrumentation checks passed. Native Windows player checks cover previews, track preferences, playback speed, source selection and recap skipping. Mobile and desktop discovery/navigation checks passed. No physical-device or live two-device account validation is claimed.

Discovery and recommendations use the installed catalogs and their available metadata. Voice search depends on the operating system's speech services. Profile PINs protect profile access within the app. New labels use English fallback where translations are unavailable.

Android retains the existing preview signing certificate for upgrades. Windows is distributed as an unsigned preview installer. Application and SDK sources are public; backend and website sources remain private. SHA256SUMS.txt covers the downloadable artifacts.
