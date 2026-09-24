# @primio/sdk

SDK TypeScript des plugins déclaratifs de Primio. Exportez un manifeste avec definePlugin, puis installez le fichier JSON dans Primio → Plugins et thèmes.

Exemple complet : examples/cinema.primio.json.

Permissions : theme (couleurs), pages (textes, liens et catalogues), addons (suggestions de manifestes), sources (classement et filtrage).

Documentation : https://github.com/azksama/primio/blob/main/docs/PLUGINS.md

## Installation

```sh
npm install https://github.com/azksama/primio/releases/download/sdk-v0.1.0/primio-sdk-0.1.0.tgz
```

Cette archive contient le module JavaScript compilé et ses types TypeScript. Aucun serveur Primio n’est requis pour développer un plugin déclaratif. Voir [le guide et l’exemple complet](https://github.com/azksama/primio/blob/main/docs/PLUGINS.md).
