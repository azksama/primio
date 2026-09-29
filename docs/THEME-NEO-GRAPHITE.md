---
name: Primio — Neo Graphite
description: Thème facultatif sombre à commandes surélevées et états creusés.
colors:
  background: "#282B30"
  surface: "#282B30"
  accent: "#E6D3AC"
  text: "#F3F0E8"
  muted: "#BCC0C8"
  border: "#646A73"
  shadow-light: "#383D45"
  shadow-dark: "#191C20"
typography:
  body:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  section:
    fontSize: "21px"
    fontWeight: 500
    letterSpacing: "-0.4px"
  title:
    fontSize: "16px"
    fontWeight: 600
  small:
    fontSize: "12px"
rounded:
  theme: "18px"
  field: "14px"
  navigation: "26px"
  navigation-item: "19px"
spacing:
  chip-gap: "12px"
  source-gap: "18px"
components:
  button-primary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.theme}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
  navigation:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.navigation}"
---

# Primio — Neo Graphite

## Overview

Neo Graphite est un thème installable de Primio. Sa matière sombre partage le même fond et la même surface ; des ombres opposées distinguent les commandes surélevées, les champs creusés et les sélections. L’ivoire signale les actions et les états actifs. Les affiches et les images des contenus conservent leur place dans l’interface.

Cette référence décrit le code de la version cible **Primio 0.2.16 / SDK 0.3.0**, avec le plugin `primio.neo-graphite` en version `1.0.0`. Elle complète la documentation des [plugins](PLUGINS.md) et du [SDK](../packages/sdk/README.md#materials-sdk-030--primio-0216). Le [DESIGN.md historique](../DESIGN.md) décrit la maquette Prisme ; il est conservé et ne constitue pas la spécification de ce thème.

### Activer le thème

1. Ouvrir **Paramètres → Plugins → Thèmes**.
2. Choisir **Installer** sur **Neo Graphite**.
3. Vérifier la permission **Modifier les couleurs**, puis choisir **Autoriser et installer**.

Le [manifeste JSON prêt à importer](../packages/sdk/examples/neo-graphite.primio.json) peut aussi être ouvert avec **Installer un plugin**, sur la page Plugins Primio. Une installation ou une réactivation désactive les autres thèmes installés. Cliquer sur **Activé** désactive Neo Graphite ; **Activer** le rétablit. La désinstallation retire le thème. En l’absence d’un autre thème actif, le rendu par défaut de Primio est restauré.

Le choix reste local à l’appareil et persiste au redémarrage. Les lecteurs natifs reçoivent le thème à l’ouverture d’une nouvelle session de lecture. Le manifeste est déclaratif : il fournit des propriétés validées, sans CSS, JavaScript ou code natif chargé depuis le plugin.

### Sources de référence

| Responsabilité | Source |
| --- | --- |
| Palette intégrée, installation, exclusivité des thèmes | [plugin-store.tsx](../apps/client/src/plugin-store.tsx) |
| Valeurs par défaut, résolution et application au document | [themes.ts](../apps/client/src/themes.ts) |
| Matière, géométrie et états WebView | [neumorphic.css](../apps/client/src/neumorphic.css) |
| Typographie et dispositions héritées | [style.css](../apps/client/src/style.css), [desktop.css](../apps/client/src/desktop.css) |
| Contrat du manifeste | [SDK](../packages/sdk/src/index.ts) |
| Palette et dessin Android | [PrimioTheme.kt](../apps/client/src-tauri/gen/android/app/src/main/java/fr/azks/primio/PrimioTheme.kt), [PrimioViews.kt](../apps/client/src-tauri/gen/android/app/src/main/java/fr/azks/primio/PrimioViews.kt) |
| Lecteur Windows mpv | [primio-ui.lua](../apps/client/src-tauri/resources/windows/player/scripts/primio-ui.lua) |

## Colors

Les valeurs du frontmatter sont extraites du manifeste Neo Graphite. Le code et le manifeste restent les sources à consulter avant de modifier cette référence.

### Primary

L’ivoire `accent` distingue les actions principales, les sélections, la progression et le focus. Les petits aplats d’accent, notamment les compteurs et les sélections d’affiches, emploient un texte sombre prévu par le moteur (`--neo-on-accent: #22252a`).

### Neutral

`background` et `surface` ont une valeur commune pour rendre les reliefs continus. `text` porte les informations principales ; `muted` porte les descriptions, métadonnées et placeholders. `border` reste disponible pour les séparations utiles, les listes d’options, les interrupteurs et les messages. `shadow-light` éclaire le bord supérieur gauche ; `shadow-dark` assombrit le bord inférieur droit.

Les erreurs et les actions dangereuses gardent leurs traitements sémantiques : le thème ne remplace pas tous les indicateurs par de l’ivoire.

## Typography

Neo Graphite reprend la typographie de Primio. Le manifeste ne définit pas `font` ; le résolveur conserve Inter, avec Arial et sans-serif comme replis. Le frontmatter relève les tailles réutilisées du corps, des titres de section, des titres de carte et des petits textes. Les paragraphes conservent une interligne de `1.6`.

Les titres cinéma conservent Cormorant Garamond avec Georgia et serif en repli ; le titre du héros utilise `clamp(44px, 12vw, 64px)`. Le thème ne crée pas de nouvelle hiérarchie typographique. Côté Android, les vues natives utilisent la typographie Android existante, avec des libellés courants à `15sp` et des titres de panneau à `20sp`. Le lecteur Windows conserve Inter pour ses commandes et Cormorant Garamond Light pour ses titres.

## Layout

Le thème conserve les parcours et les adaptations de Primio : navigation basse sur téléphone, rail sur les grandes fenêtres tactiles et navigation du shell bureau. Les règles existantes de largeur, de zone sûre et de défilement restent applicables.

La matière réserve de l’espace pour ses ombres : les rangées de filtres utilisent un espacement de `12px` et une marge intérieure de `8px` ; les sources sont espacées de `18px`, avec une marge intérieure latérale de `4px`. Les liens de réglages reçoivent `16px` de marge intérieure et `14px` de marge verticale. Les affiches gardent leur format et leur contenu.

## Elevation & Depth

**Règle du relief fonctionnel.** Une commande au repos est surélevée ; un champ, un appui ou une sélection est creusé. La couleur d’accent et les indicateurs explicites accompagnent le relief.

Les surfaces principales du thème sont opaques (`glassOpacity: 1`). Le moteur retire le flou d’arrière-plan des panneaux concernés ; les dégradés de lisibilité devant les images et les voiles des dialogues restent présents.

| Rôle WebView | Géométrie exacte |
| --- | --- |
| Panneau surélevé | `7px 7px 16px var(--shadow-dark), -7px -7px 16px var(--shadow-light)` |
| Commande surélevée | `4px 4px 9px var(--shadow-dark), -4px -4px 9px var(--shadow-light)` |
| Champ ou sélection creusé | `inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light)` |
| Navigation | `9px 12px 22px var(--shadow-dark), -5px -5px 13px var(--shadow-light)` |
| Dialogue | `14px 20px 48px #0007` |

La face des commandes est un dégradé à `145deg`, de `surface` mélangée à `4%` de blanc vers `surface` mélangée à `3%` de noir. L’effet reste une variation de matière, sans modifier les couleurs des contenus.

Android reproduit cette logique avec `PrimioRelief` : dessins bitmap mis en cache, ombres surélevées de `6dp` décalées de `±3dp`, ombres intérieures de `5dp` et trait de focus de `2dp`. Le cache est invalidé lorsque les dimensions ou l’état changent. Windows utilise des couches ASS/mpv dessinées avec les couleurs du thème. Ces moteurs partagent la palette et les rôles de relief ; leurs géométries ne sont pas des copies pixel à pixel du CSS.

## Shapes

Les boutons principaux et secondaires, cartes concernées et panneaux d’options utilisent le rayon du thème. Les champs ont leur propre rayon ; la navigation associe un conteneur plus arrondi à des éléments internes plus petits, selon les valeurs du frontmatter. Les boutons d’icône conservent leur forme adaptée à leur fonction.

Les composants natifs conservent leurs dimensions propres. Android utilise notamment un rayon courant de panneau de `26dp`, des champs à `16dp` et des commandes d’au moins `48dp`. Dans le lecteur Windows, le rayon des commandes est limité à `18` unités du canevas ou à la moitié de leur hauteur ; les boutons d’icône sont circulaires.

## Components

| Élément | Repos et états |
| --- | --- |
| Boutons et filtres | Face surélevée ; texte principal ivoire pour l’action principale. Appui ou sélection : surface creusée, accent et déplacement de `1px` vers le bas. |
| Survol avec souris | Accent et déplacement de `1px` vers le haut pour les commandes concernées. Le survol est limité aux appareils capables de survol. |
| Navigation | Conteneur surélevé, élément actif creusé et ivoire. |
| Recherche et champs | Fond de surface, relief intérieur, texte principal et placeholder atténué. Le champ de recherche porte le focus sur son conteneur. |
| Choix déroulant | Commande surélevée, creusée à l’ouverture ; panneau d’options surélevé et bordé ; option choisie creusée et ivoire. |
| Interrupteurs | Piste creusée ; état actif indiqué par le curseur et la bordure d’accent. |
| Profils | Profil choisi creusé, avec contour d’accent de `2px` décalé de `2px`. |
| Affiches et progression | Ombre de commande sur l’image ; piste de progression creusée et partie lue ivoire. |
| Dialogues et notifications | Surface opaque ; voile derrière le dialogue ; bordure visible sur les toasts, avis et états hors ligne. |
| Chargement | Squelettes creusés sans animation. Les autres comportements de chargement appartiennent aux composants existants. |
| Commandes désactivées | Ombre supprimée, opacité à `0.5`, aucun déplacement. |

### Accessibilité

**Règle du focus explicite.** Le focus ne dépend pas de l’ombre : les éléments WebView interactifs reçoivent un contour d’accent de `2px`, décalé de `4px`. Android dessine son propre contour dans `PrimioRelief`.

Les commandes WebView utilisent une transition de `140ms` sur l’ombre, la couleur et le déplacement. `prefers-reduced-motion` et le réglage `data-motion="reduced"` suppriment ces transitions et déplacements. En mode couleurs forcées, les commandes et champs retrouvent une bordure système, les ombres disparaissent et les sélections reçoivent un contour `Highlight`.

Les boutons natifs Android conservent leurs descriptions accessibles et leur zone minimale de `48dp`. La barre de lecture expose un rôle SeekBar et une plage de valeurs ; les flèches gauche/droite et les actions accessibles changent la position de `2%`. Ces mécanismes décrivent le code présent ; ils ne valent pas validation complète avec lecteur d’écran ni essai sur appareil Android.

### Compatibilité et validation

Les propriétés `material`, `colorScheme`, `shadowLight` et `shadowDark` sont facultatives. Les thèmes existants conservent `glass` et le mode sombre lorsqu’ils ne précisent rien. Le SDK valide les couleurs au format `#RRGGBB`, un rayon entier entre `8` et `28`, une opacité entre `0.4` et `1` et les valeurs déclarées de matière, de mode et de police. Un thème clair doit fournir une palette cohérente ; Neo Graphite reste un thème sombre.

État des vérifications de cette implémentation, au **29 septembre 2026** :

- Le [parcours navigateur](../scripts/check-theme-ui.mjs) a réussi à `390 × 844`, `1024 × 768` et `1440 × 900` : installation, navigation, focus clavier, persistance après rechargement, désactivation, réactivation et désinstallation ; aucun débordement de page ni erreur JavaScript détecté sur les écrans couverts. Les données fournisseurs et le pont natif sont simulés dans ce test.
- Les résultats locaux se trouvent dans `tmp/validation-neo-graphite/results.json` et les captures correspondantes dans le même dossier. Les écrans couverts comprennent le magasin, l’accueil, l’exploration, les filtres, les sources, les paramètres, les profils et les réglages du lecteur.
- Les essais locaux du lecteur natif Windows pour l’aperçu, le compte à rebours et les gestes ont réussi, puis ont été relancés après l’ajout d’un fond graphite derrière le titre et le repère temporel affichés sur la vidéo. La lisibilité a été vérifiée visuellement sur une image blanche pendant le déplacement dans la vidéo. Les captures sont dans `tmp/validation-neo-graphite/native/` et l’installateur Windows a été reconstruit.
- L’APK Android de release a été compilé. Aucun essai sur appareil ou émulateur n’a été réalisé pendant cette passe : ARTEMIS était indisponible et aucun émulateur actif n’était disponible.
- Le verdict de finition a confirmé les deux correctifs demandés : contraste des libellés Windows et documentation persistante. Ce verdict porte sur ces correctifs, pas sur une validation Android sur appareil. Le statut de publication se vérifie sur la release GitHub ; ces essais ne constituent pas une certification d’accessibilité.

## Do's and Don'ts

- **Do** utiliser les tokens résolus et les composants communs lorsqu’une nouvelle surface doit adopter cette matière. Le manifeste choisit la palette ; le moteur de Primio possède le dessin des états.
- **Do** maintenir ensemble la palette du magasin et le manifeste d’exemple, puis vérifier installation, persistance, désactivation et désinstallation après une évolution du contrat.
- **Do** préserver un signe explicite de sélection et de focus, ainsi que les libellés, descriptions et actions accessibles.
- **Do** contrôler les nouvelles surfaces à plusieurs tailles et vérifier les lecteurs natifs séparément : une capture du navigateur ne valide pas Android ou mpv.
- **Don't** appliquer les règles Neo Graphite hors du sélecteur de matière ou changer le thème par défaut lors de l’ajout d’un composant.
- **Don't** utiliser les ombres comme seul indicateur d’état, réduire les zones tactiles pour faire entrer un relief, ou animer continuellement les surfaces.
- **Don't** importer du CSS ou du code exécutable depuis un manifeste de thème. Étendre le contrat du SDK et les moteurs concernés si une nouvelle propriété est nécessaire.
- **Don't** transformer cette extension facultative en remplacement silencieux du système visuel global ou du document Prisme historique.
