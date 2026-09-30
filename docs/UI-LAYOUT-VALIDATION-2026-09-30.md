# Validation du lot de présentation 0.2.18 — 2026-09-30

## Changements examinés

Titres centrés et réduits dans les lecteurs, chevrons Hugeicons de saison, indications de saut plus grandes au centre vertical, jauges latérales luminosité/volume, épisode/saison dans les sources, bouton filtre de même hauteur que la recherche et compteur à côté de Ma liste.

Deux défauts ont été corrigés pendant la review : le compteur apparaissait aussi dans l’en-tête de la page Explorer conservée en cache ; l’ancien indicateur de volume uosc se superposait au nouveau sous Windows. Sur Android, les commandes ordinaires sont masquées pendant les gestes verticaux pour dégager les jauges et les timecodes.

## Preuves locales

| Contrôle | Résultat |
| --- | --- |
| Client | Build TypeScript/Vite réussi ; 126 tests dans 24 fichiers. |
| Rust | `cargo test --locked --lib` : 13 tests réussis. |
| UI partagée | Fixtures 390×844, 1024×900 et 1440×900 ; diamètre/hauteur du filtre = hauteur du champ ; compteur proche du titre ; sources S3E5 puis S3E6 ; retour et récupération de source en échec. Aucun débordement horizontal ni erreur JavaScript dans ces parcours. |
| Lecteur Windows natif | mpv réel, titre/contrôles, jauges à 60 % et 65 %, sélecteur de saison, épisode actif, bascule Vu/Non vu, +10 s/−5 s. Captures examinées, aucune erreur Lua relevée. Ancien indicateur uosc absent lors du contrôle final. |
| Android | Build release universel ARM64/x86_64 et debug de contrôle réussis ; suite existante `PlayerFlowTest` : 17 tests réussis après la correction finale. |
| Exploration Android | AVD `Primio_Medium_API_36_1`, `emulator-5554` ; ADB et CDP, vidéo locale et profil QA distinct. Titre S3E5, chevron de saison, indications +10 s/−5 s et gestes luminosité gauche/volume droite examinés. Journal original restauré et relu à l’identique. |
| Installation Windows | Installateur 0.2.18 exécuté silencieusement, code retour 0 ; version native 0.2.18, trois commandes de fenêtre personnalisées, absence de débordement horizontal et d’erreur JavaScript au lancement. |
| Signature Android | v2/v3 vérifiées ; même certificat Preview que 0.2.17 ; versionName 0.2.18, versionCode 2018, minSdk 26, targetSdk 36. |
| Détection Impeccable | Un avertissement sur la police Inter préexistante. Identité visuelle conservée conformément au design actif ; aucun autre signal sur les fichiers web modifiés. |

Captures et rapports : `tmp/layout-20260930/ui/`, `windows/`, captures Android et journaux de build/test dans `tmp/layout-20260930/`. Les helpers et données QA temporaires ne sont pas exportés dans les sources publiques.

## Limites

ARTEMIS MCP est absent et son ancienne installation locale a été désinstallée ; contrôle direct ADB sur l’émulateur demandé, sans service Gemini ni nouveau test Android écrit. Pas de validation sur téléphone/tablette physique ni de certification des flux des fournisseurs réels. Les fixtures navigateur ne constituent pas une preuve du lecteur natif.

Les vérifications des téléchargements, de la publication et du catalogue de mises à jour sont consignées avec la release 0.2.18. Le SDK et les fonctionnalités serveur ne changent pas dans ce lot ; seules les métadonnées de distribution privées sont actualisées.
