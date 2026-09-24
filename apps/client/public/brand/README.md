# Primio icon

Source: user-supplied 1000189130.jpg, retained unchanged as primio-launcher.jpg. The earlier artwork is retained in primio.jpg.

primio.png is a lossless PNG conversion of the supplied JPEG, without visual edits. Its built-in margins keep the play triangle inside Android's circular mask.

From apps/client, run `npm run tauri -- icon public/brand/icon-manifest.json`. The manifest sets the Android foreground scale to 85 percent. Tauri writes Android resources into src-tauri/gen/android/app/src/main/res; mirror only ic_launcher resources under src-tauri/icons/android. Both adaptive icons use the generated foreground and dark background. Copy icons/128x128@2x.png to res/drawable/primio_brand.png for the Android splash. The application loading screen uses public/brand/primio.png.
