package ar.vaad.catalogo.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CatalogBackgroundSync")
public final class CatalogBackgroundSyncPlugin extends Plugin {
    @Override
    public void load() {
        CatalogBackgroundSyncWorker.schedule(getContext());
    }

    @PluginMethod
    public void readCache(PluginCall call) {
        org.json.JSONObject snapshot = CatalogBackgroundSyncWorker.readSnapshot(getContext());
        JSObject result = new JSObject();
        result.put("catalog", snapshot.optString("catalog.json", ""));
        result.put("productDetails", snapshot.optString("product-details.json", ""));
        result.put("content", snapshot.optString("content.json", ""));
        call.resolve(result);
    }
}
