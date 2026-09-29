# Primio 0.2.16 Preview — Neo Graphite

Neo Graphite is a complete, optional neumorphic theme. Install it from **Settings → Plugins → Themes → Neo Graphite**.

- Soft graphite surfaces, raised controls, recessed fields and selected states, with restrained ivory accents.
- The material covers navigation, content pages, profiles, settings, filters, source selection and the Android/Windows native players. The default glass theme remains available.
- Keyboard focus, reduced motion and browser high-contrast fallbacks are preserved. Disabling or uninstalling the theme restores the original material immediately; new playback sessions use the selected theme.
- SDK 0.3.0 adds validated `material`, `colorScheme`, `shadowLight` and `shadowDark` tokens. Existing plugin manifests remain compatible. The release includes an importable Neo Graphite manifest and the compiled SDK.
- Native Windows titles and timestamps have compact graphite backings for readability over bright footage.

Validation: 115 client tests and 5 SDK tests; theme installation, persistence, disable/uninstall restoration and responsive browser checks at 390×844, 1024×768 and 1440×900; the existing desktop discovery/PIN/plugin flow; actual Windows playback, preview, countdown and scrubbing checks. Android universal APK and Windows NSIS installer compile successfully.

Phone/tablet browser checks use provider and native-bridge fixtures. Android device rendering has **not** been verified for this release: ARTEMIS is unavailable and Medium Primio was not running. No physical Android device was used. The Android APK retains the existing preview signing certificate; Windows remains an unsigned preview installer. Public sources contain the application and SDK only; the backend and website remain private.
