# Android

Cible : Android 8.0 (API 26) et versions suivantes. La préversion embarque ARM64 et x86_64. Les tablettes et le paysage utilisent la mise en page responsive ; leur validation visuelle est distincte du test téléphone.

## Architecture de lecture

Le client demande les streams Stremio depuis Rust, puis ouvre PlayerActivity (non exportée). Le SurfaceView est transmis par JNI sous forme de référence globale à libmpv. La crate libmpv2 possède le contexte mpv ; Kotlin gère la surface, les commandes accessibles, le focus audio et le cycle de vie. Le contexte est détruit avant de libérer la surface.

Les certificats du magasin système Android sont exportés dans le répertoire privé pour libmpv ; la vérification TLS demeure active. Aucun chemin de fichier local ne peut être demandé comme URL de lecture depuis un addon.

Le lecteur gère pause, retour/avance indépendants de 5 à 60 secondes, position absolue, sélection audio/sous-titres, mise en mémoire tampon et émission de progression vers Tauri. Sa timeline, ses panneaux et son indicateur de chargement utilisent le thème Primio. Le double toucher à gauche/droite recule/avance ; le glissement vertical à gauche ajuste la luminosité de la fenêtre, à droite le volume multimédia. Il se met en pause quand l’activité passe en arrière-plan. Il n’y a pas de service de lecture en arrière-plan, Cast ni PiP.

## Cache et téléchargements

Le budget de cache disque est réglable de 0 à 10 Go décimaux par lecture, réduit selon l’espace disponible avec une réserve de 512 Mo. Le cache mpv écrit à la suite : Primio surveille sa taille et arrête les écritures disque à 90 % du budget ou si l’espace libre descend sous 256 Mo. Cette marge couvre les paquets en transit ; ce mécanisme n’est pas un quota strict du système de fichiers. Le tampon mémoire demeure borné à 64 Mo. Le cache temporaire est libéré par mpv à la fermeture. La consommation à 10 Go n’a pas été éprouvée sur appareil.

Les téléchargements passent par DownloadManager pour continuer en arrière-plan, dans le répertoire Movies privé à l’application sur le stockage externe Android. Ils ne sont pas exportés dans la galerie et sont distincts du cache temporaire. Les fichiers MP4/MKV/WebM directs sont pris en charge ; les playlists HLS/DASH sont refusées. Le mode Wi-Fi uniquement est activé par défaut. L’app vérifie l’espace avant démarrage ; DownloadManager signale les erreurs de stockage pendant le transfert.

Les fichiers sont associés au compte et au profil. La suppression d’un profil propose également celle de ses téléchargements locaux. Les autres appareils conservent leurs fichiers locaux. L’option « supprimer après lecture » retire un téléchargement à la fermeture du lecteur si la position finale atteint 95 % de la durée. Elle est désactivée par défaut. Les téléchargements et les repères de saut ne sont pas synchronisés dans le compte ; les sous-titres intégrés au fichier restent accessibles hors connexion.

## Liens profonds

- `stremio://example.org/config/manifest.json` : aperçu d’installation de l’addon, avec confirmation dans Primio.
- `primio://example.org/config/manifest.json` : même comportement.
- `primio://addon?url=https%3A%2F%2Fexample.org%2Fmanifest.json` : manifeste HTTPS explicite.
- `primio://detail/series/tt1234567` : ouverture d’une fiche via les addons ; types `movie`, `series` et `anime` acceptés.

Les liens n’exécutent aucune commande arbitraire, ne lancent pas directement une source média et n’acceptent pas de chemin local. Android peut demander de choisir l’application quand Stremio est également installé.

## Signature

Le script build-android.ps1 produit un APK non signé. Le build de test local peut être signé avec le certificat Android de développement déjà présent :

~~~powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
& "$env:ANDROID_HOME/build-tools/36.1.0/apksigner.bat" sign --ks "$env:USERPROFILE/.android/debug.keystore" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out primio-preview.apk app-universal-release-unsigned.apk
~~~

Ne pas utiliser cette clé de développement pour Google Play ou une distribution de production. Créer et sauvegarder une clé de signature dédiée avant la première version stable ; une application installée avec une autre clé doit être désinstallée avant son remplacement.

Ne jamais ajouter de keystore ni de mot de passe au dépôt. Les règles .gitignore les excluent.

## Test

L’émulateur choisi dans cette session est Primio_Medium_API_36_1. ARTEMIS doit disposer de sa clé fournisseur pour lancer ses tests autonomes. Les observations directes et ADB permettent les diagnostics ; aucune validation sur téléphone physique n’est implicite.

Les APKs de préversion n’intègrent pas de jeton de compte, de configuration d’addon secrète, ni de clé backend.


### Tests instrumentés du lecteur

Après `./scripts/build-android.ps1 -Profile release`, exécuter `./scripts/test-android-player.ps1 -DeviceSerial emulator-5554` sur l’émulateur sélectionné. Le script remplace l’APK par un build debug, installe la suite AndroidJUnit et télécharge la bande-annonce publique Big Buck Bunny du W3C avec contrôle SHA-256. La lecture du test utilise ensuite ce fichier local, sans dépendance réseau.

Les sept scénarios vérifient le volet d’épisodes, la position d’Audio/ST, la proposition dans les 30 dernières secondes, les passages sur outro/fin de fichier et le dernier épisode, les changements de pistes sans réinitialisation du média et les notifications locales sans doublon. FFmpeg est nécessaire pour préparer la fixture à deux pistes audio et deux pistes de sous-titres. Un serveur HTTP local au test sert un sous-titre externe. Le journal de progression préexistant est restauré après chaque test. Résultat dans `tmp/player-tests/instrumentation.txt`. Réinstaller ensuite l’APK release pour la validation de livraison.

L’autoremplissage de connexion et d’inscription utilise des champs Android natifs portant les identifiants du paquet Primio. Aucun domaine web artificiel n’est injecté. Le nom et l’association affichés par Proton Pass restent une décision du gestionnaire ; ils doivent être vérifiés avec Proton Pass installé.


### Notifications locales

Le centre de notifications permet d’activer les sorties d’épisodes et les mises à jour. Android demande l’autorisation d’afficher les notifications. Aucun service Firebase ni jeton push n’est utilisé.

WorkManager vérifie les dates connues et la version de l’API environ toutes les heures. Android peut différer ce travail selon la batterie, Doze ou les restrictions constructeur ; un arrêt forcé empêche le travail jusqu’à la réouverture. Il ne s’agit pas d’un push serveur instantané.

Les dates d’épisodes sont récupérées depuis les métadonnées des titres de Ma liste lorsque Primio est ouvert ou que le calendrier est actualisé. Le travail en arrière-plan utilise ces dates enregistrées : les changements de date ou les nouveaux épisodes absents des métadonnées seront découverts au prochain rafraîchissement. Les alertes concernent le profil actif, n’annoncent pas les sorties antérieures à sa première initialisation et sont dédupliquées. Les réglages et données du travail sont stockés dans le coffre chiffré.
