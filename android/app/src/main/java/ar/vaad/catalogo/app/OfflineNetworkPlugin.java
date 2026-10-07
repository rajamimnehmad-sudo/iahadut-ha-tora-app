package ar.vaad.catalogo.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OfflineNetwork")
public final class OfflineNetworkPlugin extends Plugin {
    @PluginMethod
    public void getConnection(PluginCall call) {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        String type = "none";
        if (capabilities != null) {
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "wifi";
            else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) type = "cellular";
            else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) type = "ethernet";
            else type = "unknown";
        }
        JSObject result = new JSObject();
        result.put("type", type);
        result.put("metered", capabilities != null && manager.isActiveNetworkMetered());
        call.resolve(result);
    }
}
