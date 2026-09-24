# Compatibilité des addons Stremio

État de Primio 0.2.3. Le client consomme le protocole HTTP des addons ; il n’exécute pas leur code serveur JavaScript. Il ne revendique pas une compatibilité intégrale.

| Fonction | État dans Primio |
| --- | --- |
| Manifeste HTTPS, configuration, activation, ordre et liens Stremio | Implémenté |
| Ressources catalog, meta, stream, subtitles | Implémentées, avec les limites ci-dessous |
| Recherche, genre, pagination skip | Implémentés |
| Types personnalisés, autres extras, optionsLimit, extraSupported/extraRequired historiques | Partiel ou absent de l’interface |
| Filtrage types/idPrefixes par ressource | Implémenté partiellement ; le filtre global types est toujours appliqué |
| Métadonnées | Première réponse utilisable, sans fusion complète de tous les fournisseurs |
| Sources HTTP(S) directes, HLS/DASH | Lecture libmpv ; dépend du codec, du serveur et des en-têtes |
| externalUrl | Lien HTTPS ouvert dans le navigateur ; autres protocoles et Meta Links non gérés |
| En-têtes de requête proxyHeaders.request | Transmis à la lecture et au téléchargement |
| Autres behaviorHints, en-têtes de réponse proxyHeaders.response | Non traités intégralement |
| Sous-titres intégrés ou URL externe | Implémentés ; hash, taille et nom du fichier non envoyés aux addons |
| Torrents infoHash/fileIdx, trackers/DHT | Pas de moteur torrent embarqué |
| ytId, NZB, archives | Pas de résolveur dédié |
| addon_catalog et guide EPG | Non implémentés |
| Cache conseillé par l’addon, stale/revalidation | Non implémenté intégralement |
| Addons HTTP ou réseau local privé | Refusés par le transport actuel |
| Contenus DRM nécessitant un CDM | Non pris en charge |

Sources de référence vérifiées le 23 septembre 2026 : [ressources du SDK](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/README.md), [manifestes](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md), [sources vidéo](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md).

Les tests actuels valident les routes, filtres et formats courants ; ils ne constituent pas une certification de tous les addons tiers. Le fait qu’un manifeste s’installe ne garantit pas que tous ses types de sources soient lisibles.
