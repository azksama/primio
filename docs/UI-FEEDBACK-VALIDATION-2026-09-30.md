# Validation des retours UI et lecture — 2026-09-30

Corrections locales sur la version de travail 0.2.16. Cette note ne remplace pas les preuves de la release publiée et ne signale pas un déploiement.

## Comportements corrigés

- Retour système Android dans Primio, priorité déroulant → modale → fiche/sous-page → historique, gestes horizontaux avec verrouillage de direction et respect des rails défilants.
- Source mémorisée en échec ou abandonnée au chargement : réouverture de la sélection ; aucune relance automatique en boucle. Un choix explicite peut réessayer la source et conserve l’avancement.
- « Regarder » : S3E5 partiel → S3E5 ; S3E5 vu → S3E6 ; dernier épisode d’une saison vu → saison suivante. Les métadonnées partielles ne ramènent pas à la saison 1. Une série ou un anime sans épisode identifié affiche une erreur au lieu de rechercher un flux par identifiant de fiche. Les films et les types d’addons sans épisodes conservent leur identifiant de lecture directe.
- Épisode courant mis en évidence et marquage Vu/Non vu dans les deux lecteurs natifs, avec journal et transmission des statuts par profil. Petites indications de l’impact réel des sauts à gauche/droite, animations réduites si configurées.
- Couleur secondaire OLED par roue et aperçu ; micro dans la recherche, bouton de filtre séparé ; État/Tri de Ma liste conformes aux contrôles Explorer. Sélection multiple par appui prolongé conservée.

## Vérifications exécutées

| Surface | Résultat et périmètre |
| --- | --- |
| Vitest client | 126 tests, 24 fichiers ; reprise par saison, métadonnées partielles, types d’addons sans épisodes, échec avant durée connue, marquage réversible, couleur et gestes. |
| Rust | `cargo test --locked --lib` : 13 tests ; notamment maintien de l’avancement et des statuts d’autres épisodes dans la synchronisation native. |
| Build client | TypeScript/Vite et génération des traductions natives réussis ; avertissement préexistant de taille de bundle. |
| Build Android | Debug universel ARM64/x86_64, compilation Rust/Kotlin réussie. Ce certificat debug n’est pas le certificat de release. |
| Instrumentation Android existante | 17 tests `PlayerFlowTest` réussis : lecteur, pistes, sous-titres, aperçus, segments, épisode suivant et PiP. Aucun nouveau test Android écrit dans cette tâche. |
| Exploration Android | AVD `Primio_Medium_API_36_1`, `emulator-5554`, API 36. Retour système, gestes Accueil/Explorer, épisode courant S3E5, bascule Vu puis Non vu, +10 s/−5 s et annulation d’un chargement avec durée 0 vérifiés par ADB/CDP. |
| Lecteur Windows | mpv réel : test de préférences réussi ; épisode courant/saison 3, bascule Vu/Non vu, impacts de saut et accent OLED examinés. Aucun échec Lua relevé dans ces contrôles. |
| UI partagée | Fixtures isolées en 390×844, 1024×900 et 1440×900 : recherche, filtres, sources en échec, reprise/suivant et fermeture d’un filtre sans quitter la fiche. Aucun débordement horizontal ni erreur JavaScript dans ces parcours. |

Les contrôles UI utilisent `tmp/feedback-20260930/review-ui.mjs` et les captures sous `tmp/feedback-20260930/ui/`. Les captures natives de cette tâche sont sous `tmp/feedback-20260930/` et `windows/`. Les différences de code ont été examinées contre les copies avant intervention, sans écraser les modifications préexistantes du dépôt.

L’exploration native utilise un petit fichier vidéo de validation et un contexte QA distinct ; le journal original du lecteur a été restauré et vérifié à l’identique. Aucune écriture de compte QA en production. ARTEMIS MCP n’est pas disponible dans cette session ; pas de délégation au service Gemini ni de nouvelle suite Android générée.

## Limites

Pas de téléphone/tablette physique, de validation exhaustive de fournisseurs réels ou de nouvelle publication. Les tests navigateur ne prouvent pas à eux seuls les lecteurs natifs. Le SDK, le backend et le site ne changent pas dans ce lot.
