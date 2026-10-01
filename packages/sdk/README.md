# @primio/sdk

SDK TypeScript des plugins déclaratifs de Primio. Exportez un manifeste avec definePlugin, puis installez le fichier JSON dans Primio → Plugins et thèmes.

Exemple complet : examples/cinema.primio.json.

Permissions : theme (couleurs, matières et reliefs), pages (textes, liens et catalogues), addons (suggestions de manifestes), sources (classement et filtrage).

Documentation : https://github.com/azksama/primio/blob/main/docs/PLUGINS.md

## Installation

```sh
npm install https://github.com/azksama/primio/releases/download/sdk-v0.5.0/primio-sdk-0.5.0.tgz
```

Cette archive contient le module JavaScript compilé et ses types TypeScript. Aucun serveur Primio n’est requis pour développer un plugin déclaratif. Voir [le guide et l’exemple complet](https://github.com/azksama/primio/blob/main/docs/PLUGINS.md).


## Schema v2 (SDK 0.2.0)

Version 1 manifests remain supported. Version 2 adds declarative, permission-scoped customization:

SDK 0.4.0 accepts an optional top-level `icon` HTTPS URL without embedded credentials. Primio 0.2.20 and newer display it in the installed list and store, with a theme/capability fallback if it cannot load. This field does not request an extra permission; existing manifests remain compatible.

- `theme`: background, surface, accent, text, muted, border, radius (8–28), glassOpacity (0.4–1), font (Inter/serif/monospace).
- `layout`: columns (3/4/5), labels and density (compact/comfortable).
- `accessibility`: reduceMotion and fontScale (1–1.3).
- `spoilers`: hideUnwatched episode titles, descriptions and thumbnails; watched episodes stay visible and users can reveal individual episodes.
- `watchOrder`: up to 20 release, chronological or custom lists with 200 movie/series/anime entries each. Optional entries and episode video IDs are supported.

Each capability requires its matching permission. No JavaScript or arbitrary CSS executes. Values outside the documented bounds and unknown fields are rejected. Disabling a plugin removes its effects. Installing a theme disables other themes while retaining them.

```ts
import { definePlugin } from '@primio/sdk'
export default definePlugin({
  schemaVersion: 2, id: 'community.night', name: 'Night', version: '1.0.0',
  description: 'A calm dark layout', author: 'Your name',
  permissions: ['theme', 'layout', 'spoilers'], category: 'theme',
  theme: { background: '#0B1220', surface: '#172236', accent: '#B7D6FF', radius: 18 },
  layout: { columns: 4, labels: true, density: 'compact' },
  spoilers: { hideUnwatched: true },
})
```

Build this checkout with `npm install && npm run build`. Export the returned object as JSON and import it in Primio’s Plugins settings.

## Materials (SDK 0.3.0 · Primio 0.2.16+)

Themes can select a built-in rendering material in addition to their palette. Older themes keep the glass material. No custom CSS or native code is loaded.

| Theme property | Values / default | Purpose |
| --- | --- | --- |
| `material` | `glass` (default), `neumorphic` | Raised controls, recessed fields and pressed states throughout the app and the native Android/Windows players |
| `colorScheme` | `dark` (default), `light` | Browser controls and Android system bars |
| `shadowLight` | `#RRGGBB` | Upper-left relief highlight |
| `shadowDark` | `#RRGGBB` | Lower-right relief shadow |

The host owns geometry, interaction states, keyboard focus, motion and high-contrast fallbacks. Select text and muted colors with sufficient contrast against both background and surface. Light themes should explicitly supply the full palette, not just `colorScheme`.

```ts
theme: {
  material: 'neumorphic', colorScheme: 'dark',
  background: '#282B30', surface: '#282B30', accent: '#E6D3AC',
  text: '#F3F0E8', muted: '#BCC0C8', border: '#646A73',
  shadowLight: '#383D45', shadowDark: '#191C20',
  radius: 18, glassOpacity: 1,
}
```

Import [Neo Graphite](examples/neo-graphite.primio.json) as a complete example. The same theme is available in Settings → Plugins → Themes. Theme selection stays on this device and is applied to new playback sessions; disabling it restores the default material.
