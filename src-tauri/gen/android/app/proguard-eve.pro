# The page calls these by name through window.EveAndroid (MainActivity.Bridge); R8 would rename them.
-keepclassmembers class dev.happynut.eve.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
