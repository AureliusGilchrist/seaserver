package app.seanine.denshi.mobile;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's client cancels every fullscreen request, so the page's requestFullscreen() did nothing.
 * This shows what the WebView hands over on top of the app, in landscape with the system bars hidden.
 */
public class FullscreenChromeClient extends BridgeWebChromeClient {

    private final Activity activity;
    private View fullscreenView;
    private CustomViewCallback fullscreenCallback;

    public FullscreenChromeClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
    }

    public boolean isFullscreen() {
        return fullscreenView != null;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden();
            return;
        }
        fullscreenView = view;
        fullscreenCallback = callback;
        ((ViewGroup) activity.getWindow().getDecorView()).addView(
            view,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        systemBars().hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onHideCustomView() {
        if (fullscreenView == null) return;
        ((ViewGroup) activity.getWindow().getDecorView()).removeView(fullscreenView);
        fullscreenView = null;
        activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        systemBars().show(WindowInsetsCompat.Type.systemBars());
        fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }

    private WindowInsetsControllerCompat systemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        return controller;
    }
}
