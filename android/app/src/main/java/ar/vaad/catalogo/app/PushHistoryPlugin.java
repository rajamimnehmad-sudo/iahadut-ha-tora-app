package ar.vaad.catalogo.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "PushHistory")
public final class PushHistoryPlugin extends Plugin {
    @Override
    public void load() { PushHistoryStore.ensureChannel(getContext()); }

    @PluginMethod
    public void getHistory(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("notifications", new JSArray(PushHistoryStore.readAndMark(getContext(), Boolean.TRUE.equals(call.getBoolean("markRead", false))).toString()));
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read notification history", error); }
    }

    @PluginMethod
    public void markAllRead(PluginCall call) {
        try { PushHistoryStore.markRead(getContext()); call.resolve(); }
        catch (Exception error) { call.reject("Could not mark notifications as read", error); }
    }

    @PluginMethod
    public void clearHistory(PluginCall call) {
        if (PushHistoryStore.preferences(getContext()).edit().putString("notifications", "[]").commit()) call.resolve();
        else call.reject("Could not clear notification history");
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (!PushHistoryStore.preferences(getContext()).edit().putBoolean("enabled", enabled).commit()) {
            call.reject("Could not save notification preference");
            return;
        }
        FirebaseMessaging.getInstance().setAutoInitEnabled(enabled);
        call.resolve();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String testTopic = call.getString("testTopic", "");
        if (enabled && !testTopic.matches("iahadut-test-[a-f0-9]{20}")) {
            call.reject("Invalid test topic");
            return;
        }
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        String previousTopic = PushHistoryStore.preferences(getContext()).getString("test_topic", "");
        if (!PushHistoryStore.preferences(getContext()).edit().putBoolean("enabled", enabled).commit()) {
            call.reject("Could not save notification preference");
            return;
        }
        messaging.setAutoInitEnabled(enabled);
        Task<Void> task;
        if (enabled) {
            task = messaging.subscribeToTopic("catalog-updates")
                    .onSuccessTask(unused -> messaging.subscribeToTopic(testTopic))
                    .onSuccessTask(unused -> previousTopic.isEmpty() || previousTopic.equals(testTopic)
                            ? Tasks.forResult(null) : messaging.unsubscribeFromTopic(previousTopic));
        } else {
            task = messaging.unsubscribeFromTopic("catalog-updates")
                    .onSuccessTask(unused -> previousTopic.isEmpty() ? Tasks.forResult(null) : messaging.unsubscribeFromTopic(previousTopic))
                    .onSuccessTask(unused -> messaging.deleteToken());
        }
        task.addOnCompleteListener(result -> {
            if (!result.isSuccessful()) { call.reject("Could not update FCM subscriptions", result.getException()); return; }
            PushHistoryStore.preferences(getContext()).edit().putString("test_topic", enabled ? testTopic : "").apply();
            call.resolve();
        });
    }
}
