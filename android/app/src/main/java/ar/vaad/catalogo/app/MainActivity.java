package ar.vaad.catalogo.app;

import android.os.Bundle;
import android.os.Build;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void applySystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(0xFFF7F8F6);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setSystemBarsBehavior(WindowInsetsCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                    decorView.getSystemUiVisibility()
                            | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayStoreUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
        // Prevent Android's edge-glow/overscroll stretch from resizing the
        // WebView and the fixed navigation dock during pull-to-boundary.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Keep the WebView below Android's status bar so the clock and battery
        // never overlap the app content on modern edge-to-edge devices.
        applySystemBars();
        getWindow().getDecorView().post(this::applySystemBars);
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBars();
    }
}
