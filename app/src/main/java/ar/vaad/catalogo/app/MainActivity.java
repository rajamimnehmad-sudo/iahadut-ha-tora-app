package ar.vaad.catalogo.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 41;
    private WebView webView;
    private PermissionRequest pendingRequest;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        webView.setWebViewClient(new AppClient());
        webView.setWebChromeClient(new AppChrome());
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void requestCamera(PermissionRequest request) {
        pendingRequest = request;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            grantCamera(request);
        } else {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        }
    }

    private void grantCamera(PermissionRequest request) {
        if (request != null) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        }
        webView.evaluateJavascript("window.__ihtCameraReady && window.__ihtCameraReady()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != CAMERA_REQUEST) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            grantCamera(pendingRequest);
        } else {
            webView.evaluateJavascript("window.__ihtCameraDenied && window.__ihtCameraDenied()", null);
        }
        pendingRequest = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private class AppChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> requestCamera(request));
        }
    }

    private class AppClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if ("vaadscan".equals(request.getUrl().getScheme())) {
                requestCamera(null);
                return true;
            }
            return false;
        }
    }
}
