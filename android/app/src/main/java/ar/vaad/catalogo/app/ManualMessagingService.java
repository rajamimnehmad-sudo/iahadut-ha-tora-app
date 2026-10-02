package ar.vaad.catalogo.app;

import android.content.Intent;
import android.os.Bundle;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;
import org.json.JSONObject;

/** Save notification+data messages before FCM displays them in the background. */
public final class ManualMessagingService extends MessagingService {
    @Override
    public void handleIntent(Intent intent) {
        String action = intent.getAction();
        Bundle extras = intent.getExtras();
        if (("com.google.android.c2dm.intent.RECEIVE".equals(action)
                || "com.google.firebase.messaging.RECEIVE_DIRECT_BOOT".equals(action)) && extras != null) {
            if (!PushHistoryStore.isEnabled(this)) return;
            RemoteMessage message = new RemoteMessage(extras);
            try {
                JSONObject data = new JSONObject(message.getData());
                RemoteMessage.Notification display = message.getNotification();
                String title = display != null ? display.getTitle() : data.optString("title");
                String body = display != null ? display.getBody() : data.optString("body", data.optString("text"));
                if ((title != null && !title.isEmpty()) || (body != null && !body.isEmpty())) {
                    JSONObject notification = new JSONObject();
                    notification.put("id", message.getMessageId());
                    notification.put("title", title == null ? "Aviso de Iahadut HaTora" : title);
                    notification.put("body", body == null ? "" : body);
                    notification.put("data", data);
                    PushHistoryStore.record(this, notification);
                }
                PushHistoryStore.ensureChannel(this);
            } catch (Exception error) {
                android.util.Log.e("PushHistory", "Could not read push message", error);
            }
        }
        // Preserve FCM handling, token rotation and Capacitor foreground/tap events.
        super.handleIntent(intent);
    }
}
