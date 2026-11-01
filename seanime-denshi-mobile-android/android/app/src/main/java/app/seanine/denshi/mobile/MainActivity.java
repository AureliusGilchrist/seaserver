package app.seanine.denshi.mobile;

import android.view.KeyEvent;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private FullscreenChromeClient chromeClient;

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
            chromeClient = new FullscreenChromeClient(bridge, this);
            webView.setWebChromeClient(chromeClient);
            webView.addJavascriptInterface(new ShellConfigInterface(this), "DenshiShellConfig");
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Back leaves fullscreen first; the fullscreen view would otherwise take the key and do nothing.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && chromeClient != null && chromeClient.isFullscreen()) {
            if (event.getAction() == KeyEvent.ACTION_UP) chromeClient.onHideCustomView();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
