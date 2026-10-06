package ar.vaad.catalogo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import org.json.JSONArray;
import org.json.JSONObject;

/** Durable inbox, independent of the WebView and Android's notification tray. */
final class PushHistoryStore {
    static final String CHANNEL = "catalog-updates-v2";
    private static final String PREFS = "manual_push_history";

    static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        // Existing installations may already be subscribed before migration.
        return preferences(context).getBoolean("enabled", true);
    }
    static synchronized String inboxTopic(Context context) {
        String topic = preferences(context).getString("inbox_topic", "");
        if (!topic.matches("iahadut-test-[a-f0-9]{20}")) {
            topic = preferences(context).getString("test_topic", "");
            if (!topic.matches("iahadut-test-[a-f0-9]{20}")) topic = "iahadut-test-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 20);
            if (!preferences(context).edit().putString("inbox_topic", topic).commit()) throw new IllegalStateException("Could not save inbox identity");
        }
        return topic;
    }

    static synchronized JSONArray read(Context context) {
        try { return new JSONArray(preferences(context).getString("notifications", "[]")); }
        catch (Exception error) { return new JSONArray(); }
    }

    static synchronized void record(Context context, JSONObject notification) {
        try {
            JSONArray current = read(context);
            String id = notification.optString("id");
            for (int i = 0; i < current.length(); i++) {
                if (!id.isEmpty() && id.equals(current.getJSONObject(i).optString("id"))) return;
            }
            notification.put("unread", true);
            notification.put("receivedAt", System.currentTimeMillis());
            JSONArray next = new JSONArray();
            next.put(notification);
            for (int i = 0; i < current.length(); i++) next.put(current.get(i));
            // Commit before handing off to FCM: process death must not lose the inbox.
            if (!preferences(context).edit().putString("notifications", next.toString()).commit()) {
                throw new IllegalStateException("Could not save notification history");
            }
        } catch (Exception error) {
            android.util.Log.e("PushHistory", "Could not save push history", error);
        }
    }

    static synchronized void markRead(Context context) throws Exception {
        JSONArray current = read(context);
        for (int i = 0; i < current.length(); i++) current.getJSONObject(i).put("unread", false);
        if (!preferences(context).edit().putString("notifications", current.toString()).commit()) {
            throw new IllegalStateException("Could not mark push history as read");
        }
    }

    static synchronized JSONArray readAndMark(Context context, boolean markRead) throws Exception {
        JSONArray snapshot = read(context);
        if (markRead) markRead(context);
        return snapshot;
    }

    static void ensureChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Avisos de Iahadut HaTora", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Avisos enviados por el equipo");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLightColor(Color.BLUE);
        manager.createNotificationChannel(channel);
    }
}
