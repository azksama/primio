# Primio — interface et lecteur, 27 septembre 2026

## Changements

- Menu Windows aligné sur le menu flottant Android, largeur limitée à 470 px et boutons compacts.
- Actions Ajouter un addon / Installer un plugin en tête de page : à droite sur ordinateur, sous le titre sur téléphone.
- Hugeicons Stroke Rounded dans l'interface React et pour les commandes natives retour, lecture et pause. Tracés générés par `scripts/sync-native-icons.mjs`, licence MIT incluse.
- Recommandation à la une : un film, une série et un anime parmi les catalogues disponibles, rotation toutes les 15 secondes. Pause explicite, suspension pendant interaction ou lorsque la page est masquée. Une catégorie absente n'est pas inventée.
- Compte à rebours circulaire de cinq secondes avant les propositions manuelles de saut d'intro/générique ou d'épisode suivant. Les préférences de saut automatique restent applicables.
- Lecteur Windows : suppression des bandes noires, boutons translucides, indicateur de progression renforcé, timecode aligné au-dessus de la barre et aperçu vidéo borné près du curseur. Décodage séparé, temporisation des requêtes et cache limité à 24 images.
- Import local de polices TTF/OTF (5 Mo, dix polices), validation du format et du nom interne, aperçu immédiat, persistance et suppression. Acheminement vers libass sous Android et Windows.
- Blocage du zoom de l'interface Android, sans supprimer le redimensionnement de la vidéo dans le lecteur natif.
- Conservation des changements antérieurs de synchronisation des imports Stremio vers le compte Primio et de sélection multiple.

## Vérifications exécutées

- Client : 76 tests Vitest, 16 fichiers, réussis ; compilation TypeScript/Vite réussie.
- Rust Windows : `cargo check --locked --offline` réussi.
- Build Android release ARM64 + x86_64, compilation Kotlin, R8 et packaging réussis.
- Lecteur Android sur `Primio_Medium_API_36_1` / `emulator-5554` : suite de 16 scénarios. Première exécution entièrement réussie ; dernière exécution 15/16, avec un délai de lancement instrumentation de 45 secondes sur le volet Épisodes. Ce seul scénario a ensuite réussi isolément (11,7 s). Aucun échec fonctionnel n'est masqué par une relance automatique.
- Scénarios natifs : PiP retour/arrière-plan, sous-titres et audio sans rechargement, aperçu de recherche, compte à rebours, fins d'épisode, affichage de la police importée.
- Audit de la véritable WebView Android après exploration ARTEMIS : accueil, navigation, Addons, Plugins, réglages du lecteur, contrôle d'import, Explorer et Ma liste. Largeur bornée ; pincement tactile avec échelle restant à 1. Aucun service d'automatisation Gemini utilisé.
- Import d'Inter dans la WebView Android réelle : FontFace/CSP, IndexedDB, aperçu et préparation du fichier par le pont Rust vérifiés ; suppression de la police de test et restauration du choix précédent.
- `scripts/check-features-ui.mjs` : rotation à 15 secondes, pause, import/suppression/persistance des polices, placements des actions et largeur du menu desktop ; API et pont natif simulés pour ces contrôles navigateur.
- `scripts/check-adaptive-ui.mjs` : sept étapes d'onboarding sur téléphone, tablette et bureau ; défilement vertical nécessaire conservé à 320 × 640, sans débordement horizontal ni masquage des actions finales.
- Lecteur mpv Windows réel : compte à rebours avant saut manuel, aperçu 240 × 135 aux extrémités de la barre sans modifier la position de lecture, bascule fit/fill.

## Reproduction et captures

Lancer le serveur Vite sur le port 1420 pour les scripts navigateur. Construire les bibliothèques natives avant `scripts/test-android-player.ps1 -DeviceSerial emulator-5554`. Le contrôle `node scripts/check-android-ui.mjs emulator-5554` utilise l'APK debug, une interface anglaise et un onboarding terminé. Il exige explicitement l'AVD Medium Primio, n'importe aucune bibliothèque et ne modifie aucun compte.

Captures locales dans `tmp/validation-v0212/` : `desktop-addons.png`, `desktop-plugins.png`, `windows-preview.png`, `android-home.png`, `android-addons.png`, `android-plugins.png`, `android-player-settings.png`, `android-font-import.png`, `android-explore.png`, `android-library.png`. Résultats instrumentation dans `tmp/player-tests/`.

## Limites

Pas de validation sur téléphone physique. Les aperçus Windows ont été vérifiés avec une vidéo de test locale ; leur disponibilité distante dépend du format, de l'accès et des capacités de recherche de la source. Aucun nouvel installateur Windows, APK signé de distribution, push Git ou release n'a été publié dans ce lot.
