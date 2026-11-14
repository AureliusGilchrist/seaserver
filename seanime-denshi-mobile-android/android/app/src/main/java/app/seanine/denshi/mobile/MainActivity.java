package app.seanine.denshi.mobile;

import android.graphics.Color;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private FullscreenChromeClient chromeClient;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Plugins must be registered before the bridge is built in super.onCreate.
        registerPlugin(MobileShellPlugin.class);
        super.onCreate(savedInstanceState);
        paintEdgesBlack();
    }

    /**
     * Everything around the page is black: the status bar, the navigation bar, and the margins
     * Capacitor leaves around the WebView on edge-to-edge phones (Android 15+ draws the window
     * background there and ignores the bar colours). Without this the theme's gray shows.
     */
    private void paintEdgesBlack() {
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);
        if (android.os.Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(Color.BLACK);
            getWindow().setNavigationBarColor(Color.BLACK);
        }
        // Light icons on the black bars.
        androidx.core.view.WindowInsetsControllerCompat insets =
            androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setAppearanceLightStatusBars(false);
        insets.setAppearanceLightNavigationBars(false);
    }

    @Override
    protected void load() {
        super.load();
        // The shell script's synchronous native bridge (see ShellConfigInterface) must exist
        // before the page's scripts run; loadUrl is only queued at this point, so adding the
        // interface here lands it in every page load.
        WebView webView = bridge.getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.BLACK);
            if (webView.getParent() instanceof View) ((View) webView.getParent()).setBackgroundColor(Color.BLACK);
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
