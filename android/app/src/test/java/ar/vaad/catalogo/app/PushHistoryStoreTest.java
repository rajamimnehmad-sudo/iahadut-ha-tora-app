package ar.vaad.catalogo.app;

import static org.junit.Assert.*;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class PushHistoryStoreTest {
    private Context context;
    @Before public void reset() {
        context = RuntimeEnvironment.getApplication();
        PushHistoryStore.preferences(context).edit().clear().commit();
    }
    private JSONObject notice(String id) throws Exception {
        return new JSONObject().put("id", id).put("title", "Aviso").put("body", "Texto")
                .put("data", new JSONObject().put("eventKey", id));
    }
    @Test public void inboxSurvivesReopeningAndDeduplicatesMessageId() throws Exception {
        PushHistoryStore.record(context, notice("first"));
        PushHistoryStore.record(context, notice("first"));
        JSONArray stored = PushHistoryStore.read(context.getApplicationContext());
        assertEquals(1, stored.length());
        assertEquals("first", stored.getJSONObject(0).getJSONObject("data").getString("eventKey"));
        assertTrue(stored.getJSONObject(0).getLong("receivedAt") > 0);
        assertTrue(stored.getJSONObject(0).getBoolean("unread"));
    }
    @Test public void olderNoticesNeverExpireByQuantity() throws Exception {
        for (int i = 0; i < 40; i++) PushHistoryStore.record(context, notice("id-" + i));
        JSONArray stored = PushHistoryStore.read(context);
        assertEquals(40, stored.length());
        assertEquals("id-0", stored.getJSONObject(39).getString("id"));
    }
    @Test public void readingSnapshotDoesNotMarkLaterArrivalAsRead() throws Exception {
        PushHistoryStore.record(context, notice("first"));
        JSONArray imported = PushHistoryStore.readAndMark(context, true);
        assertTrue(imported.getJSONObject(0).getBoolean("unread"));
        PushHistoryStore.record(context, notice("later"));
        JSONArray stored = PushHistoryStore.read(context);
        assertTrue(stored.getJSONObject(0).getBoolean("unread"));
        assertFalse(stored.getJSONObject(1).getBoolean("unread"));
    }
    @Test public void disabledPreferenceSurvivesReopening() {
        PushHistoryStore.preferences(context).edit().putBoolean("enabled", false).commit();
        assertFalse(PushHistoryStore.isEnabled(context.getApplicationContext()));
    }
    @Test public void inboxIdentitySurvivesDisablingAndTokenRotation() {
        String first = PushHistoryStore.inboxTopic(context);
        assertTrue(first.matches("iahadut-test-[a-f0-9]{20}"));
        PushHistoryStore.preferences(context).edit().putBoolean("enabled",false).remove("test_topic").commit();
        assertEquals(first,PushHistoryStore.inboxTopic(context.getApplicationContext()));
    }
    @Test public void existingTestDestinationMigratesWithoutChangingIt() {
        String previous = "iahadut-test-552db89ef08fff79938a";
        PushHistoryStore.preferences(context).edit().putString("test_topic",previous).commit();
        assertEquals(previous,PushHistoryStore.inboxTopic(context));
    }
}
