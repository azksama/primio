# @primio/sdk

SDK TypeScript des plugins déclaratifs de Primio. Exportez un manifeste avec definePlugin, puis installez le fichier JSON dans Primio → Plugins et thèmes.

Exemple complet : examples/cinema.primio.json.

Permissions : theme (couleurs), pages (textes, liens et catalogues), addons (suggestions de manifestes), sources (classement et filtrage).

Documentation : https://github.com/azksama/primio/blob/main/docs/PLUGINS.md

## Installation

```sh
npm install https://github.com/azksama/primio/releases/download/sdk-v0.2.0/primio-sdk-0.2.0.tgz
```

Cette archive contient le module JavaScript compilé et ses types TypeScript. Aucun serveur Primio n’est requis pour développer un plugin déclaratif. Voir [le guide et l’exemple complet](https://github.com/azksama/primio/blob/main/docs/PLUGINS.md).


## Schema v2 (SDK 0.2.0)

Version 1 manifests remain supported. Version 2 adds declarative, permission-scoped customization:

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

Build this checkout with `npm install && npm run build`. The 0.2.0 archive is not published yet; the download above remains the previously published 0.1.0 package. Export the returned object as JSON and import it in Primio’s Plugins settings.
