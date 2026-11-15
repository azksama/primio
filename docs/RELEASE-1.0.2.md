# Primio 1.0.2

- Déconnexion locale fiable, même hors ligne ou avec un token expiré. Elle est aussi accessible depuis le choix des sessions.
- Les changements d’addons et de préférences, les épisodes vus et les saisons terminées déclenchent immédiatement leur envoi. Les autres applications ouvertes détectent les changements toutes les 1,5 seconde lorsque le réseau est disponible. Une modification faite pendant un envoi est conservée et transmise ensuite.
- À la connexion à un compte existant, Primio présente ses sessions et le bouton « Créer ma session », sans demander de renommer le profil principal. Les profils protégés conservent leur PIN.
- Lecteurs Android et Windows : le sélecteur de saison se trouve à droite du titre « Épisodes », dans l’en-tête du menu.
- Windows : bouton « Écran » et raccourci Ctrl+M pour déplacer la lecture vers un autre moniteur. L’écran choisi est conservé pour les lectures suivantes tant que l’application reste ouverte.
- Windows : utiliser une autre fenêtre ou un autre écran ne réduit plus automatiquement la lecture en PiP. La réduction explicite et le retour vers l’application conservent leur comportement PiP.

Validation : 196 tests client, 39 tests API, 23 tests Rust et 18 tests instrumentés sur Android Emulator ; parcours de compte à 390/1440 px avec fixtures et lecteur Windows réel sur deux moniteurs. Aucun téléphone physique n’a été testé. Les écrans disponibles sont recensés à l’ouverture du lecteur ; relancer la lecture après un branchement ou débranchement de moniteur. La réception dépend du réseau et de l’activité de l’application ; hors ligne, les changements restent locaux jusqu’à reconnexion.
