# Validation des collections, plugins et polices 0.2.19 — 2026-09-30

## Périmètre

Déroulant des collections et suppression rouge « Supprimer » ; règles automatiques SI/ET/OU, exemples, aperçu, exceptions et tris ; tri Explorer flottant ; compteur de Ma liste centré verticalement avec son titre ; titres Reprendre sur une ligne ; recommandations conservées pendant le rafraîchissement avec deux titres de référence au maximum ; cinq polices embarquées et imports pour l’interface et les sous-titres. Plugins installés présentés d’abord, magasin séparé, configuration dans une modale avec brouillon Enregistrer/Annuler, accent OLED et parcours transformés en collections chronologiques. Classification anime japonaise/coréenne/chinoise partagée avec la découverte aléatoire.

Les règles s’appliquent à Ma liste et suivent le profil. L’API valide leur forme bornée et les identifiants des polices embarquées dans l’état existant, sans migration SQL. Les fichiers et sélections importés restent locaux à l’appareil. Les contrôles des lecteurs natifs sont inchangés.

## Contrôles terminés

| Contrôle | Résultat |
| --- | --- |
| Client | 156 tests dans 26 fichiers ; règles ET/OU, intervalles, métadonnées absentes, exceptions, tris stables, fusion par profil, couleurs lisibles, collections de parcours idempotentes et classification anime ; cinq familles de police valides. |
| SDK et site | 5 tests SDK et 3 tests site réussis. |
| Rust | `cargo test --locked --lib` : 13 tests réussis. |
| API | 17 tests sur SQLite de test isolé ; aller-retour de l’état avec règles/exclusions/tris et polices, rejet de champ inconnu et de groupes excessifs. Typecheck réussi. |
| Build partagé | TypeScript/Vite réussi. |
| UI navigateur | `scripts/check-collections-ui.mjs` réussi à 390×844, 1024×900 et 1440×900 : sauvegarde des règles, retrait explicite conservé, options flottantes sans déplacer les affiches, Échap fermant d’abord le déroulant, titre Reprendre sur une ligne, rafraîchissement conservant les recommandations, import/rechargement/suppression de police. Aucun débordement horizontal ni erreur JavaScript dans ces parcours. |
| UI plugins | `scripts/check-plugins-ui.mjs` réussi aux trois mêmes formats : Save/Cancel, fermeture par croix/Échap, réglages Intro Skipper en brouillon, accent OLED appliqué/restauré, collection Star Wars de treize films chronologiques, filtres de source sauvegardés, collection conservée après désinstallation, suppression persistante et création à l’installation. Aucun débordement ni erreur JavaScript. |
| Review visuelle | Les 46 captures ont été examinées par l’agent principal et le reviewer de finition indépendant : aucun blocage UI restant. Fermeture/sauvegarde persistantes pendant le scroll, largeur compacte du tri desktop et absence de cartes imbriquées superflues contrôlées. |
| Détecteur Impeccable | Une seule passe ; avertissement sur Inter préexistante, conservée selon l’identité active graphite/ivoire/verre, Cormorant éditorial et Hugeicons. |
| Android final | Build release universel 0.2.19 signé, installé et lancé sur Medium Primio ; bibliothèque existante préservée. VersionCode 2019, minSdk 26, targetSdk 36, ARM64/x86_64 ; signatures v2/v3 et alignement ZIP 16 Ko vérifiés. Exploration des réglages, plugins installés, modale et retour système fermant la modale. |
| Windows final | Installateur NSIS final installé (code 0), application lancée : commandes de fenêtre personnalisées, compteur centré, plugins installés, modale et annulation vérifiés. Cinq polices chargées par FontFace dans WebView2 ; pont Tauri réel préparant des fichiers aux SHA-256 identiques aux assets. Import Lora pour l’interface, application et suppression contrôlés, puis application relancée normalement. |

Captures et rapports conservés localement dans `.impeccable/review/collections/`, `.impeccable/review/plugins/` et `tmp/layout-20260930/`, hors archive publique. Sources publiques des assertions : [script collections](../scripts/check-collections-ui.mjs), [script plugins](../scripts/check-plugins-ui.mjs), [tests règles](../apps/client/src/collection-rules.test.ts), [tests parcours](../apps/client/src/watch-collections.test.ts), [tests polices](../apps/client/src/subtitle-fonts.test.ts). Les tests du contrat et de l’aller-retour API restent dans le dépôt privé. Les fixtures visuelles ne sont pas des catalogues réels.

## Limites

L’APK final a été exploré sur **Medium Primio** (`Primio_Medium_API_36_1`, `emulator-5554`). La validation Windows utilise le pont Tauri réel, en complément des fixtures navigateur. La préparation et le chargement des polices ne constituent pas une preuve de leur rendu libass dans une vidéo native. Une restriction CSP empêchant le chargement des assets embarqués sur Windows a été corrigée par l’ajout ciblé de `connect-src 'self'` et vérifiée sur l’installation finale.

ARTEMIS MCP est absent ; l’exploration Android utilise ADB sur l’émulateur demandé, sans nouveau test Android écrit. Aucun résultat de 0.2.18 n’est présenté comme un essai 0.2.19. Pas d’appareil Android physique ni de certification des fournisseurs réels. Publication, signatures, assets, téléchargements et déploiement sont consignés dans le contexte privé et [les notes de release](RELEASE-0.2.19.md) après vérification.

Persistance : contexte et ADR actualisés dans la même tâche ; `DESIGN.md` reste l’archive Prisme, aucune sidecar de design n’est présente ni créée. Le lot est une extension de l’interface existante.
