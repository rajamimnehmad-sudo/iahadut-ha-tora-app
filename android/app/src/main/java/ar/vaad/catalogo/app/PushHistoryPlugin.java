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
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "PushHistory")
public final class PushHistoryPlugin extends Plugin {
    private final AtomicInteger configurationGeneration = new AtomicInteger();
    @PluginMethod
    public void getTestTopic(PluginCall call) {
        try { JSObject result = new JSObject(); result.put("topic", PushHistoryStore.inboxTopic(getContext())); call.resolve(result); }
        catch (Exception error) { call.reject("Could not save inbox identity",error); }
    }
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
        configurationGeneration.incrementAndGet();
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
        int generation = configurationGeneration.incrementAndGet();
        String previousTopic = PushHistoryStore.preferences(getContext()).getString("test_topic", "");
        if (!PushHistoryStore.preferences(getContext()).edit().putBoolean("enabled", enabled).commit()) {
            call.reject("Could not save notification preference");
            return;
        }
        messaging.setAutoInitEnabled(enabled);
        Task<Void> task;
        if (enabled) {
            task = messaging.subscribeToTopic("catalog-updates")
                    .onSuccessTask(unused -> generation != configurationGeneration.get() ? Tasks.forException(new IllegalStateException("Superseded configuration")) : messaging.subscribeToTopic(testTopic))
                    .onSuccessTask(unused -> generation != configurationGeneration.get() || previousTopic.isEmpty() || previousTopic.equals(testTopic)
                            ? Tasks.forResult(null) : messaging.unsubscribeFromTopic(previousTopic));
        } else {
            task = messaging.unsubscribeFromTopic("catalog-updates")
                    .onSuccessTask(unused -> generation != configurationGeneration.get() || previousTopic.isEmpty() ? Tasks.forResult(null) : messaging.unsubscribeFromTopic(previousTopic));
            // Opt-out removes subscriptions; deleting the installation token is
            // unnecessary and can strand a quick subsequent activation.
        }
        Tasks.withTimeout(task, 30, TimeUnit.SECONDS).addOnCompleteListener(result -> {
            if (!result.isSuccessful()) { call.reject("Could not update FCM subscriptions", result.getException()); return; }
            if (generation != configurationGeneration.get()) { call.reject("Superseded configuration"); return; }
            // Keep the inbox identity when push is disabled or FCM rotates its token.
            if (enabled) PushHistoryStore.preferences(getContext()).edit().putString("test_topic", testTopic).putString("inbox_topic", testTopic).apply();
            // USB diagnostics expose only an irreversible topic hash, never
            // the registration token. This permits private device-only tests.
            if (enabled && android.provider.Settings.Global.getInt(getContext().getContentResolver(), android.provider.Settings.Global.ADB_ENABLED, 0) == 1) {
                android.util.Log.i("IhtPushTest", testTopic);
            }
            call.resolve();
        });
    }
}
