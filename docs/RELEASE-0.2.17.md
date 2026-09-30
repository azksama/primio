# Primio 0.2.17 Preview — Navigation and playback

- Android's system Back button navigates within Primio. Dropdowns and dialogs close before the page behind them; horizontal navigation gestures respect scrollable content.
- **Watch** resumes the exact episode and season for the active profile. Finishing S3E5 selects S3E6, then continues into the next season. Partial metadata no longer resets playback to season one.
- A failed or cancelled loading source opens the source picker on the next attempt, preserving progress and allowing a different provider.
- Android and Windows episode drawers highlight the current episode and include reversible watched badges. These changes are saved and synchronized with the correct profile.
- Seek controls briefly show the actual time change on the corresponding side of the player.
- The OLED theme gains a color wheel, brightness control and live preview for its accent color.
- Voice search is inside the search field, with a separate round filter button. My List uses the same State/Sort controls as Explorer and removes redundant synchronization/selection buttons; long-press selection remains available.

Validation: 126 client tests, 13 Rust tests and 5 SDK tests; existing Android player instrumentation (17 tests); responsive review on phone, tablet and desktop layouts; native Windows playback and Android emulator exploration on Medium Primio. Release builds and artifact verification are recorded with this delivery. Physical devices and arbitrary real-provider streams are not covered by the local fixtures.

Android retains the existing preview signing certificate so upgrades do not require uninstalling the app. The Windows preview installer remains unsigned. Public source archives contain only the application and SDK; the backend and website remain private. SHA256SUMS.txt covers the downloadable artifacts.
