package ar.vaad.catalogo.app;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "PlayStoreUpdates")
public class PlayStoreUpdatesPlugin extends Plugin {
    private static final int UPDATE_REQUEST_CODE = 19001;
    private AppUpdateManager updateManager;

    private final InstallStateUpdatedListener installStateUpdatedListener = (InstallState state) -> {
        if (state.installStatus() != InstallStatus.DOWNLOADED) return;
        JSObject result = new JSObject();
        result.put("bytesDownloaded", state.bytesDownloaded());
        result.put("totalBytesToDownload", state.totalBytesToDownload());
        notifyListeners("updateDownloaded", result);
    };

    @Override
    public void load() {
        super.load();
        updateManager = AppUpdateManagerFactory.create(getContext());
        updateManager.registerListener(installStateUpdatedListener);
    }

    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        updateManager.getAppUpdateInfo()
            .addOnSuccessListener(info -> call.resolve(updateInfo(info)))
            .addOnFailureListener(error -> call.reject("No se pudo consultar Google Play", error));
    }

    @PluginMethod
    public void start(PluginCall call) {
        String requestedType = call.getString("type", "flexible");
        int updateType = "immediate".equals(requestedType) ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        Activity activity = getActivity();
        updateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
            boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
            if (!available || !info.isUpdateTypeAllowed(updateType)) {
                JSObject result = new JSObject();
                result.put("started", false);
                call.resolve(result);
                return;
            }
            try {
                AppUpdateOptions options = AppUpdateOptions.newBuilder(updateType).build();
                updateManager.startUpdateFlowForResult(info, activity, options, UPDATE_REQUEST_CODE);
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("type", requestedType);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("No se pudo iniciar la actualización de Google Play", error);
            }
        }).addOnFailureListener(error -> call.reject("No se pudo iniciar la actualización de Google Play", error));
    }

    @PluginMethod
    public void complete(PluginCall call) {
        updateManager.completeUpdate()
            .addOnSuccessListener(ignored -> call.resolve())
            .addOnFailureListener(error -> call.reject("No se pudo instalar la actualización", error));
    }

    private JSObject updateInfo(AppUpdateInfo info) {
        JSObject result = new JSObject();
        result.put("available", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE);
        result.put("downloaded", info.installStatus() == InstallStatus.DOWNLOADED);
        result.put("priority", info.updatePriority());
        result.put("stalenessDays", info.clientVersionStalenessDays());
        result.put("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        result.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        if (updateManager != null) updateManager.unregisterListener(installStateUpdatedListener);
        super.handleOnDestroy();
    }
}
