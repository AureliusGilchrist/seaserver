package app.seanine.denshi.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

/**
 * A synchronous window into native prefs for the shell script. Capacitor plugin calls are
 * promise-based, but the shell script runs as a plain head script ahead of the app's deferred
 * scripts — it must seed the server URL into localStorage before the app's first status fetch,
 * and cannot wait on a bridge round trip. A JavascriptInterface method call is synchronous.
 */
public class ShellConfigInterface {

    private static final String SHELL_PREFS_NAME = "DenshiMobileShell";
    private static final String SERVER_URL_KEY = "serverUrl";

    private final Context context;

    public ShellConfigInterface(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String getServerUrl() {
        SharedPreferences prefs = context.getSharedPreferences(SHELL_PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(SERVER_URL_KEY, null);
    }
}
