# Primio Intro Skipper

Plugin TypeScript intégré à Primio, sans serveur Jellyfin. Il fournit les segments intro, récapitulatif et générique au lecteur natif. Le lecteur affiche un bouton contextuel, marque la timeline et peut sauter automatiquement les intros.

```ts
import { createIntroSkipper } from '@primio/intro-skipper'
const skipper = createIntroSkipper(fetchJson)
const segments = await skipper.resolve(media, videoId, {skipIntro:true,aniSkip:true})
```

`fetchJson` est injecté par l’hôte : dans Primio, il utilise le transport Rust HTTPS protégé. Le plugin ne stocke aucun jeton ni URL de source vidéo. Les identifiants de titre/épisode sont transmis aux fournisseurs activés.

- IntroDB : titres IMDb, films ou saisons/épisodes.
- AniSkip : identifiants MyAnimeList, correspondance exacte Kitsu → MyAnimeList.
- Un fournisseur communautaire peut implémenter `SkipProvider` et être enregistré avec `createIntroSkipper(fetchJson, providers)` lors de la compilation.
- Cache en mémoire de dix minutes ; erreurs de fournisseur isolées ; segments invalides rejetés.

Ce plugin ne porte pas le logiciel Jellyfin Intro Skipper et ne réalise pas encore d’analyse acoustique des fichiers. Sans repères fournis, aucun intervalle n’est inventé. Les montages peuvent différer ; le lecteur contrôle la durée AniSkip et permet de désactiver le saut automatique.

Références : https://introdb.app/docs/api et https://api.aniskip.com/api-docs.
