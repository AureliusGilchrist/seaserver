package app.seanine.denshi.mobile;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Plugins must be registered before the bridge is built in super.onCreate.
        registerPlugin(MobileShellPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        super.load();
        // The shell script's synchronous native bridge (see ShellConfigInterface) must exist
        // before the page's scripts run; loadUrl is only queued at this point, so adding the
        // interface here lands it in every page load.
        WebView webView = bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new ShellConfigInterface(this), "DenshiShellConfig");
        }
    }
}
