# Primio 0.2.13 Preview

- Use the same compact floating navigation on Windows and Android, with Hugeicons Stroke Rounded throughout the app and native playback controls.
- Rotate featured recommendations between a movie, series and anime every 15 seconds, with manual selection and pause.
- Show a five-second circular countdown before manual intro, credits and next-episode actions.
- Improve player controls and timeline visibility. Remove the Windows player's dark overlay bands and show bounded seek thumbnails without seeking the playing video.
- Import TTF/OTF subtitle fonts, preview them immediately and use them in the Android and Windows players. Fonts are stored on the device.
- Move addon and plugin installation actions to the top of the page, and prevent interface pinch zoom on Android while retaining native video resizing.
- Automatically synchronize completed Stremio imports to the connected Primio account, including retry after an offline restart. This does not continuously monitor the Stremio account.

Validation: 76 client unit tests; Android ARM64/x86_64 release build; real Medium Primio emulator UI/font/gesture checks; Android player instrumentation (one launch-timeout scenario passed on isolated rerun); native Windows seek-preview and countdown checks. No physical-device validation is claimed.

Android uses the same preview signing certificate as previous versions, so it can update an existing installation. Windows uses the existing unsigned preview installer distribution. Backend and website sources are excluded from this public release.

SHA-256 checksums are provided in SHA256SUMS.txt.
