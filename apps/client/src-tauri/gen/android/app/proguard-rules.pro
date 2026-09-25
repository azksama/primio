# Add project specific ProGuard rules here.
-keep class fr.azks.primio.PrimioPlugin { *; }
-keep class fr.azks.primio.StoreArgs { *; }
-keep class fr.azks.primio.PlayArgs { *; }
-keep class fr.azks.primio.LinkArgs { *; }
-keep class fr.azks.primio.DownloadArgs { *; }
-keep class fr.azks.primio.IdArgs { *; }
-keep class fr.azks.primio.TextArgs { *; }
-keep class fr.azks.primio.PlayerActivity { *; }
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
-keep class fr.azks.primio.AuthArgs { *; }

-keep class fr.azks.primio.NotificationArgs { *; }

-keep class fr.azks.primio.PrimioCastOptions { *; }
-keep class fr.azks.primio.CastArgs { *; }
