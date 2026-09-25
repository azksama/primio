# Connected services

Each Primio account profile can connect its own Trakt, AniList and MyAnimeList account from **Settings → Connected services**. Authorization opens the provider's website; the callback returns to Primio. No provider password or client secret is stored in the public application.

Completed playback is sent while Primio is running and signed in. Failed requests retry on subsequent playback synchronization, with a minimum interval of one minute. Offline progress remains in Primio until connectivity returns. Disconnecting stops future synchronization; it does not delete the provider's history.

Trakt uses IMDb IDs, season and episode numbers. AniList and MyAnimeList use their own IDs, with Kitsu-to-MAL mappings when available. Unmatched titles are reported and skipped rather than guessed from their name. Multi-season anime require an unambiguous season-specific provider ID; ambiguous entries are skipped.

Trakt viewing history is read for titles already in the Primio profile. AniList and MyAnimeList viewing counts update previously opened episodes when the provider timestamp is newer. Explicit recent “unwatched” choices in Primio are preserved. Connecting a service does not import or remove library titles; use the import screen for library imports. Synchronization does not copy provider ratings or custom lists.

## Other 0.2.11 features

- **Collections:** profile-specific named groups of titles already in My List; synced with the Primio account.
- **TV mode:** automatic Android TV detection or manual selection in Options, larger cards and directional focus. No controller-specific certification is claimed.
- **Casting:** Google Cast on Android; DLNA discovery/control on Android and Windows. Receivers must share the local network and support the source's format. Sources requiring private HTTP headers are unavailable for casting. Keep the casting remote open to save playback progress. Google Cast from Windows is not included.
- **Preview:** a separate decoder extracts seekbar thumbnails when the source supports seeking. Unsupported or inaccessible streams may have no thumbnail. Android pinch-to-fill preserves the aspect ratio by cropping; pinch inward restores fit. Windows has the `Z` fit/fill shortcut.
- **Diagnostics:** local JavaScript/player errors, Android exit reports and Windows Rust panic reports can be reviewed and voluntarily uploaded. Recognized secrets, URLs, email addresses and private paths are masked; review remains available before submission. No automatic upload.

Provider consent and playback on physical Cast/DLNA receivers still require real-account and hardware validation.
