# Dépendances et licences

Le code de Primio est MIT. Ce choix ne modifie pas la licence de ses dépendances ou contenus.

- Tauri 2 et Wry : MIT / Apache-2.0.
- React et Lucide : MIT / ISC selon package.
- AdonisJS : MIT.
- libmpv2 6.0.0 : LGPL-2.1, https://github.com/kohsine/libmpv-rs.
- libmpv, FFmpeg, libass et bibliothèques associées : licences amont, dont LGPL et éventuellement GPL selon options de compilation.
- Inter : SIL Open Font License, https://github.com/rsms/inter.
- Cormorant Garamond : SIL Open Font License, https://github.com/CatharsisFonts/Cormorant.
- Big Buck Bunny : Blender Foundation, Creative Commons Attribution 3.0. La démonstration pointe vers https://media.w3.org/2010/05/bunny/trailer.mp4 ; la vidéo n’est pas redistribuée dans l’APK.
- Les illustrations pen.dev d’origine sont conservées dans Prisme-assets. Les posters et métadonnées réels sont fournis à la demande par les addons.

## Bibliothèques natives Android

Source de l’artefact : https://github.com/jarnedemeulemeester/libmpv-android/releases/tag/v1.0.0

Fichier : libmpv-release.aar
SHA-256 : df146592480fc8418415a06b1f1a1d6318b0088e21f52254b0e9a82b61ca8fa2

scripts/prepare-native.ps1 ne conserve que les bibliothèques natives du paquet (sans libplayer.so). Primio possède son propre pont JNI en Rust et ne réutilise pas le wrapper Kotlin de cette dépendance. Les sources et scripts de compilation correspondants sont disponibles dans le dépôt amont ; buildscripts/include/depinfo.sh épingle les révisions de ses composants.

Avant une redistribution publique stable, reproduire et archiver les sources correspondantes des bibliothèques effectivement livrées, vérifier les options GPL/LGPL et préparer les mentions/relinking nécessaires. Cette première préversion reste dans un dépôt privé et ne constitue pas une déclaration de conformité Google Play.

