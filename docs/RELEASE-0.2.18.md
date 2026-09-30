# Primio 0.2.18 Preview — Player and layout refinements

- Player titles are smaller, centered horizontally and aligned with the Back, Close and Episodes controls on Android and Windows.
- Season selectors use a Hugeicons chevron. Windows now opens a season dropdown instead of cycling through seasons.
- Seek feedback is larger and vertically centered, on the left for rewind and on the right for forward.
- Brightness and volume use vertical side indicators with real icons: brightness on the left, volume on the right. Android hides ordinary controls during these gestures to keep the indicators clear. The redundant Windows volume overlay is disabled.
- The source picker names the selected episode and includes its season when the title has multiple seasons.
- Explore's round filter button matches the search field's height. My List's title count appears beside its heading.

Validation: 126 client tests, 13 Rust tests, existing Android player instrumentation (17 tests), responsive UI review at phone/tablet/desktop sizes, native Windows playback and ADB exploration on Medium Primio. Release installers and downloadable artifact checks accompany this delivery. Physical Android devices and arbitrary provider streams are outside these fixture checks.

Android retains the existing preview signing certificate for in-place upgrades. The Windows preview installer is unsigned. Application and SDK sources are public; backend and website stay private. SHA256SUMS.txt covers the downloadable artifacts.
