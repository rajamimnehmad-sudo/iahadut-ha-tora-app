package ar.vaad.catalogo.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "ScannerPermissions", permissions = {
    @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
})
public final class ScannerPermissionsPlugin extends Plugin {
    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) cameraResult(call);
        else requestPermissionForAlias("camera", call, "cameraResult");
    }

    @PermissionCallback
    private void cameraResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("camera") == PermissionState.GRANTED);
        call.resolve(result);
    }
}
