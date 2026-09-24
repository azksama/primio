# Primio

Lecteur multimédia pour Android et Windows : catalogues Stremio, profils, bibliothèque, reprise et lecture libmpv.

- [Télécharger l’application](https://primio.azks.fr)
- [Versions Android et Windows](https://github.com/azksama/primio/releases)
- [Créer un plugin Primio](docs/PLUGINS.md)
- [SDK TypeScript](packages/sdk) · [SDK Rust](packages/native-sdk) · [Intro Skipper](packages/intro-skipper)
- [Compatibilité Stremio](docs/STREMIO-COMPATIBILITY.md)

## Développement

Node 24+, Rust stable. Android : SDK 36, NDK 29, JDK 21. Windows : outils Visual Studio C++.

```powershell
npm --prefix packages/sdk ci
npm --prefix packages/intro-skipper ci
npm --prefix packages/intro-skipper run build
npm --prefix apps/client ci
npm run dev
```

```powershell
npm run build
npm test
```

[Compiler Android](docs/ANDROID.md) · [Compiler Windows](docs/WINDOWS.md).

Le backend de comptes et le site sont hébergés séparément et ne font pas partie de ce dépôt. Aucun secret de signature ou d’hébergement n’est fourni. Les commandes de compilation produisent des binaires de développement ; les APK de préversion utilisent actuellement le certificat Android de développement. L’installateur Windows n’est pas signé.

Les sources doivent fournir une URL HTTP(S). Les torrents `infoHash` seuls et les flux DRM ne sont pas pris en charge. Les notifications locales nécessitent une autorisation et restent soumises aux restrictions du système.

## Licence

MIT pour Primio et ses SDK. Voir [THIRD_PARTY.md](THIRD_PARTY.md) pour les bibliothèques embarquées.
