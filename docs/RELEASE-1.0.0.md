# Primio 1.0 — version officielle

- Accueil : rotation automatique fiable, compteur circulaire actif et commandes Pause/Reprendre ; les retours du lecteur ne bloquent plus le carrousel.
- Explorer : catégorie Tous par défaut, menus plus larges et textes lisibles, sélection de pays intégrée. Historique est accessible à côté du calendrier dans Ma liste.
- Lecteur : épisodes illustrés, progression et statuts dans le panneau ouvert ; le défilement Android s’arrête sur une ligne complète. Le PiP recalcule la surface vidéo et propose Lecture/Pause. Sans outro connue, le prochain épisode est proposé pendant la dernière minute.
- Mises à jour : progression revue, réutilisation du téléchargement vérifié après abandon de l’installateur, suppression des fichiers périmés quand la version installée ou disponible évolue.
- Magasin de plugins commun au site et à l’application, propositions communautaires, révisions et modération. Les labels Officiel, Vérifié et Mis en avant sont distincts de l’état de publication. Quatre créations enrichissent le catalogue : Salle obscure, Lisibilité, Version originale et Les débuts de Pixar.
- Espace compte : véritable pseudonyme, gestion des synchronisations AniList/Trakt/MyAnimeList, profils et état des addons avec temps de réponse. Administration dédiée aux comptes, plugins, rapports, versions, téléchargements, connexions et journal des actions.
- Après un crash, un rapport peut être consulté au redémarrage et envoyé avec accord explicite. Les rapports reçus sont expurgés, chiffrés et supprimés après 30 jours par nettoyage horaire.
- SDK déclaratif 0.5.0 avec catalogue partagé ; Intro Skipper reste en 0.2.1.

Validation : 179 tests client, 6 SDK, 14 Rust, 27 API sur base SQLite isolée et 4 site réussis. Parcours du site examinés à 390 et 1440 px et dans huit langues ; six corrections de revue visuelle résolues. L’émulateur Android a servi à contrôler carrousel, filtres, historique, miniatures, statuts, défilement, PiP Lecture/Pause, épisode suivant et consentement après un crash provoqué. Le lecteur Windows installé a chargé de vraies miniatures HTTPS avec progression. Les deux installateurs 1.0 ont été installés et lancés.

L’APK principal utilise une clé de production dédiée et une lignée de signature depuis les previews : l’installation conserve les données. Android 8 utilise encore le certificat historique via v2 ; Android 9+ utilise le certificat de production via v3. L’APK `android-compat` contient la même application mais le certificat historique : il sert uniquement de transition automatique aux anciens mécanismes de mise à jour. Utiliser `android-universal` pour une installation directe. Windows ne dispose pas de signature Authenticode.

Limites connues : les identifiants OAuth AniList du service déployé sont refusés par le fournisseur (`invalid_client`) et doivent être remplacés dans la configuration protégée de l’administration. Les données AniSkip restent propres à chaque épisode et ne sont pas inventées. La suite Android historique compte 16 réussites sur 17 : son test de préavertissement attend encore cinq secondes au lieu des trois actuelles. Il n’a pas été réécrit sans l’exploration ARTEMIS exigée. Aucun téléphone physique ni certification de tous les fournisseurs n’est revendiqué.

Les sources applicatives et SDK sont publiques. Les services de compte, le site, l’infrastructure, le contexte interne et les clés de signature restent privés.
