# Primio

Primio est une application de découverte, de bibliothèque et de lecture de films, séries et animes sur Android et Windows. Son interface partagée utilise React dans Tauri ; les sessions de lecture natives utilisent libmpv sur Android et mpv sur Windows. L’aperçu navigateur sert au développement et ne reproduit pas toutes les fonctions natives.

## Parcours et contenu

L’utilisateur installe des addons Stremio, explore leurs catalogues, recherche un titre, consulte ses informations puis choisit une source pour lancer la lecture. Il organise sa liste, retrouve sa progression et gère ses profils. Les réglages couvrent notamment les addons, les services connectés, le lecteur, les sous-titres, les téléchargements et les extensions. Les données et préférences peuvent rester locales ; les comptes ajoutent une synchronisation avec gestion des conflits.

Les catalogues, métadonnées, sources et sous-titres proviennent des addons ou services configurés. Leur disponibilité et leur compatibilité sont distinctes de celles de l’interface. Voir [la compatibilité Stremio](docs/STREMIO-COMPATIBILITY.md) et les [limites de validation](docs/RELEASE-0.2.16.md).

## Contrat de personnalisation

Les plugins installables sont des manifestes déclaratifs validés par le [SDK](packages/sdk/README.md). L’application présente leurs permissions avant installation. Le moteur possède les composants, les interactions et les rendus natifs ; un thème apporte des propriétés, sans charger de CSS ou de code exécutable.

Neo Graphite est une extension facultative locale de ce système, issue du code existant et de la demande d’un thème néomorphique complet. Son périmètre est la matière des surfaces, commandes et états dans l’interface partagée et les lecteurs Android/Windows. La structure du produit, ses parcours et son thème par défaut restent les références de l’application.

L’activation suit **Paramètres → Plugins → Thèmes → Neo Graphite → Installer → Autoriser et installer**. Installer ou réactiver un thème désactive les autres thèmes installés. Le choix persiste localement ; les nouvelles sessions de lecture reçoivent le thème actif. La désactivation ou la désinstallation restaure le rendu par défaut lorsqu’aucun autre thème n’est actif. Les palettes, géométries et états sont documentés dans [Neo Graphite](docs/THEME-NEO-GRAPHITE.md).

## Contraintes durables

- Préserver la lecture, la navigation, les profils, les préférences et la compatibilité des plugins lors d’une évolution visuelle.
- Conserver des libellés et états de sélection lisibles, un focus explicite, les descriptions accessibles, des commandes tactiles adaptées et la réduction des animations.
- Maintenir la distinction entre vérification de l’interface sur données simulées, essais des lecteurs natifs, essai Android sur appareil et publication publique.
- Traiter cette intervention comme une extension visuelle locale guidée par le code. Le `DESIGN.md` et les livrables Prisme restent l’archive de la maquette initiale ; les modifier ou remplacer l’identité globale constitue un travail distinct.

## Sources

Cette description reflète les fonctionnalités et contrats présents dans [README.md](README.md), [App.tsx](apps/client/src/App.tsx), [plugin-store.tsx](apps/client/src/plugin-store.tsx), [themes.ts](apps/client/src/themes.ts) et la [documentation des plugins](docs/PLUGINS.md). Elle ne constitue pas une validation de livraison de chaque plateforme.
