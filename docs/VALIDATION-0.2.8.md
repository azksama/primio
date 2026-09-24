# Primio 0.2.8 — validation du 24 septembre 2026

- Accueil : visuel principal réduit de 30 % en hauteur, titre limité à deux lignes ; barres de reprise alignées malgré des titres et métadonnées de longueurs différentes.
- Reprise : miniature et numéro de l’épisode enregistrés avec la progression. Saison affichée seulement si plusieurs saisons sont connues. Enrichissement des anciennes entrées depuis les métadonnées disponibles.
- Explorer : tri des résultats chargés par nom, note ou année, dans les deux sens. Les valeurs absentes restent à la fin. La pagination conserve le fonctionnement des addons.
- Addons : copie du manifeste, priorité et suppression sur une ligne ; configuration et descriptions compactes.
- Sources : onglet Tous et filtres mémorisés par profil ; ouverture directe des options de saut des génériques depuis Plugins.
- Android : fenêtre audio/sous-titres bornée à la fenêtre réelle et espacement de 16 dp avant les réglages du style.

## Vérifications

- 51 tests client réussis, dont tri naturel, notes/dates manquantes et conservation des informations d’épisode après reprise/changement de source.
- 6 tests API réussis ; conservation des nouveaux filtres et des métadonnées d’épisodes lors de la synchronisation chiffrée.
- Parcours navigateur avec fournisseurs et pont natif simulés : reprise, filtres persistants après fermeture/réouverture, tri, réglages du générique, actions des addons, navigation et contrôles précédents.
- Alignement des dix barres de progression et absence de chevauchement du titre long de l’accueil vérifiés aux largeurs 320, 390, 800 et 1280 pixels.
- 9 tests AndroidJUnit réussis sur l’émulateur Android 16 : lecture, changements de pistes sans rechargement, sous-titres, épisode suivant, notifications et téléchargements. Le test du style vérifie aussi que la fenêtre reste dans le lecteur et que les boutons sont espacés.
- Builds Android ARM64/x86_64 et Windows x64 de production. Captures dans tmp/validation-v028.

## Limites

Pas de téléphone physique ni de flux d’addon privé validé. Les notes et miniatures dépendent des métadonnées fournies. Le tri agit sur les résultats déjà chargés ; le protocole des addons ne garantit pas un tri global côté fournisseur. APK de préversion signé avec la clé de développement existante ; installateur Windows non signé.
