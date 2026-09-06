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
        JSObject result = new JSObject();
        result.put("catalog", CatalogBackgroundSyncWorker.read(getContext(), "catalog.json"));
        result.put("productDetails", CatalogBackgroundSyncWorker.read(getContext(), "product-details.json"));
        result.put("content", CatalogBackgroundSyncWorker.read(getContext(), "content.json"));
        call.resolve(result);
    }
}
