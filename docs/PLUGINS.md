# Extensions Primio

Deux niveaux d’extension sont disponibles.

Le module intégré [Primio Intro Skipper 0.2](../packages/intro-skipper/README.md) expose aussi `SkipProvider` pour ajouter des fournisseurs de repères. Il utilise IntroDB et AniSkip par défaut, sans serveur Jellyfin. L’ajout de code fournisseur exige une recompilation ; ce n’est pas une permission des manifestes déclaratifs. Le SDK déclaratif reste en version 0.1, son contrat n’ayant pas changé.

## Plugins installables

packages/sdk expose definePlugin, pluginSchema, activatePlugin et rankSources. Un plugin est un document JSON déclaratif validé intégralement avec Zod. Installer un fichier .primio.json depuis Préférences → Plugins et thèmes. Les permissions sont présentées avant l’installation et vérifiées par le runtime ; un fichier ne peut pas déclarer une fonctionnalité sans sa permission.

| Permission | Fonctions |
|---|---|
| theme | Couleurs background, surface, accent et text au format #RRGGBB |
| pages | Pages composées de textes, liens HTTPS et catalogues Stremio |
| addons | Addons proposés, installés individuellement après examen du manifeste |
| sources | Mots-clés de préférence et d’exclusion pour classer ou filtrer les sources |

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
