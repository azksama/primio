# Extensions Primio

Deux niveaux d’extension sont disponibles.

Le module intégré [Primio Intro Skipper 0.2](../packages/intro-skipper/README.md) expose aussi `SkipProvider` pour ajouter des fournisseurs de repères. Il utilise IntroDB et AniSkip par défaut, sans serveur Jellyfin. L’ajout de code fournisseur exige une recompilation ; ce n’est pas une permission des manifestes déclaratifs. Le SDK déclaratif 0.2 accepte les manifestes de schéma 1 et 2.

## Plugins installables

packages/sdk expose definePlugin, pluginSchema, activatePlugin et rankSources. Un plugin est un document JSON déclaratif validé intégralement avec Zod. Installer un fichier .primio.json depuis Préférences → Plugins et thèmes. Les permissions sont présentées avant l’installation et vérifiées par le runtime ; un fichier ne peut pas déclarer une fonctionnalité sans sa permission.

| Permission | Fonctions |
|---|---|
| theme | Couleurs background, surface, accent, text, muted et border ; rayon, transparence, police, matière glass/neumorphic, ombres et mode sombre/clair |
| pages | Pages composées de textes, liens HTTPS et catalogues Stremio |
| addons | Addons proposés, installés individuellement après examen du manifeste |
| sources | Mots-clés de préférence et d’exclusion pour classer ou filtrer les sources |
| layout | Colonnes, densité et libellés des affiches |
| accessibility | Réduction des animations et échelle du texte |
| spoilers | Masquage des épisodes non vus |
| watchOrder | Parcours de visionnage et entrées de contenus |

Exemple complet : packages/sdk/examples/cinema.primio.json. Il peut être importé directement. Pour produire le manifeste depuis TypeScript :

~~~ts
import { definePlugin } from '@primio/sdk'
import { writeFileSync } from 'node:fs'

const plugin = definePlugin({
  schemaVersion: 1,
  id: 'community.mon-cinema',
  name: 'Mon cinéma',
  version: '1.0.0',
  author: 'Votre nom',
  description: 'Des couleurs et un classement personnalisés.',
  permissions: ['theme', 'sources'],
  theme: { accent: '#DAD4C5' },
  sources: { prefer: ['VFF', 'MULTI'], hide: ['CAM'] },
})
writeFileSync('mon-cinema.primio.json', JSON.stringify(plugin, null, 2))
~~~

Les plugins déclaratifs n’exécutent pas de JavaScript, ne reçoivent pas de jeton de compte et ne peuvent pas appeler les commandes natives. Aucune archive n’est extraite. Un changement de version repasse par l’installation et l’accord des permissions. La désinstallation retire immédiatement les effets du plugin.

Les blocs catalogue contactent le domaine indiqué dans le manifeste du plugin. Ne publier aucun lien contenant un secret personnel dans un plugin partagé.

## Extensions natives Rust

packages/native-sdk est la crate primio-plugin-sdk. Le trait PrimioExtension fournit resource (transformation d’une réponse d’addon) et before_play (transformation de l’URL, du titre et des en-têtes de lecture). Les résultats de before_play sont validés avant lecture.

~~~rust
use primio_plugin_sdk::{PrimioExtension, PlaybackRequest};

struct MyExtension;
impl PrimioExtension for MyExtension {
    fn id(&self) -> &'static str { "community.my-extension" }
    fn before_play(&self, mut request: PlaybackRequest) -> Result<PlaybackRequest, String> {
        request.title = format!("Mon cinéma · {}", request.title);
        Ok(request)
    }
}
~~~

Ajouter la crate au Cargo.toml du client et une instance Arc::new(MyExtension) dans le registre apps/client/src-tauri/src/extensions.rs, puis reconstruire l’APK. Le registre est appelé par les commandes réelles de catalogue et de lecture. Pour ajouter d’autres interactions natives, utiliser un plugin Tauri 2 et des commandes Kotlin Android ; le pont PrimioPlugin constitue un exemple dans le projet.

Les extensions Rust sont du code de confiance lié au binaire et disposent des privilèges de l’application. Il n’y a pas de chargement de DLL/.so communautaires téléchargées à chaud. Remplacer arbitrairement les fonctions internes implique de reconstruire l’application ; les plugins installables couvrent le contrat déclaratif ci-dessus.

## Magasin intégré

Le magasin contient 17 extensions déclaratives : sept thèmes (Neo Graphite, Graphite, Midnight, Sakura, Forest, Amber, OLED), trois préférences de sources, deux présentations de bibliothèque, deux options d’accessibilité, un mode anti-spoilers et deux parcours (Terre du Milieu, Star Wars). Les installations et permissions restent locales à l’appareil. Les thèmes peuvent être désactivés sans être supprimés.

Depuis le SDK 0.3.0 et Primio 0.2.16, Neo Graphite applique le néomorphisme à la navigation, aux champs, aux filtres, aux réglages, aux profils, aux fenêtres de sources et aux lecteurs natifs Android et Windows. Les boutons sont surélevés, les champs et les états sélectionnés sont creusés. Le focus clavier et les indicateurs de sélection restent visibles. Les propriétés `material`, `colorScheme`, `shadowLight` et `shadowDark` sont facultatives et validées ; les thèmes existants gardent le rendu verre. Voir [le manifeste prêt à importer](../packages/sdk/examples/neo-graphite.primio.json) et [les propriétés du SDK](../packages/sdk/README.md#materials-sdk-030--primio-0216).

Un constructeur permet aussi de créer un ordre personnalisé à partir de Ma liste. Le magasin est un catalogue intégré à la version de l’application ; il ne télécharge pas de code communautaire. Voir le README du SDK pour les limites et exemples de chaque permission.
