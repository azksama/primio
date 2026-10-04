# Primio 1.0.1

- Aperçu pendant le glissement de la barre de lecture, avec une vignette par seconde préparée progressivement en arrière-plan. Le point demandé passe en priorité. Les JPEG restent sur disque, avec un petit cache d'images pour l'affichage ; leur décodage est indépendant du lecteur principal et le cache est supprimé à la fermeture.
- Décalage des sous-titres dans les lecteurs Android et Windows : −0,5 s, +0,5 s, valeur signée et remise à zéro. Une valeur positive retarde leur apparition. Le réglage appartient à la lecture en cours.
- Windows : correction du redimensionnement empêchant certains aperçus et du déplacement de fenêtre interceptant le glissement de la barre.
- Android : aperçus compatibles API 26, suspension du préchargement pendant buffering, chauffe, économie d'énergie et lorsque le lecteur n'est pas visible.
- Synchronisation : suppressions appliquées avant le plafond d'historique ; événements de fermeture du lecteur conservés pendant un envoi en cours.
- Restauration locale protégée : un échec de lecture du coffre propose de réessayer sans remplacer les données par un état vide. Les écritures d'une même clé conservent leur ordre.
- Réponses d'addons normalisées, lectures différées annulées après un changement de compte/profil, recherche Tous corrigée et dialogues maintenus ouverts pendant leur sauvegarde.
- Chemins inutilisés supprimés, modules spécialisés extraits et opérations réseau/fixtures mutualisées.
- SDK 0.5.1 : URL malformées rejetées sans exception inattendue. Intro Skipper 0.2.2 : fournisseurs défaillants isolés, cache invalidé correctement et correspondances MAL ambiguës refusées.

Le préchargement cède la priorité à la lecture et reste borné : un worker, petit cache mémoire et cache disque de 256 Mio sur Android / 512 Mio sur Windows. Une vidéo très longue, un manque d'espace, un format incompatible ou un réseau lent peuvent empêcher le remplissage complet. Cela ne garantit pas un coût CPU/réseau nul. Android est compilé et linté ; aucun appareil physique n'est validé pour ce lot. Les parcours navigateur utilisent des fixtures.
