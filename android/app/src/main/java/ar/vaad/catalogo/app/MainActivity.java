package ar.vaad.catalogo.app;

import android.os.Bundle;
import android.os.Build;
import android.view.View;

import androidx.core.view.WindowCompat;
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
        controller.setAppearanceLightNavigationBars(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                    decorView.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
