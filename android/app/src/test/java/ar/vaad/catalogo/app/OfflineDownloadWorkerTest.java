package ar.vaad.catalogo.app;
import static org.junit.Assert.*;
import android.content.Context;
import androidx.work.*;
import androidx.work.testing.TestWorkerBuilder;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.io.*;
import java.util.concurrent.Executors;

@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class OfflineDownloadWorkerTest {
    Context context; JSONObject job; String url="https://vaad.ar/cache.jpg";
    @Before public void setup()throws Exception {
        context=RuntimeEnvironment.getApplication();
        job=new JSONObject().put("id","test-generation").put("urls",new JSONArray().put(url)).put("signature","current").put("paused",false).put("wifiOnly",true);
        OfflineDownloadStore.write(context,"job.json",job);
        OfflineDownloadStore.write(context,"manifest.json",new JSONObject().put("images",new JSONObject()));
    }
    private OfflineDownloadWorker worker(String id) {
        return TestWorkerBuilder.from(context,OfflineDownloadWorker.class,Executors.newSingleThreadExecutor())
            .setInputData(new Data.Builder().putString("job",id).build()).build();
    }
    @Test public void migratedDownloadCompletesWithoutRedownloadingAndSurvivesReopening()throws Exception {
        String name=OfflineDownloadWorker.fileName(url);
        try(FileOutputStream out=new FileOutputStream(new File(OfflineDownloadStore.folder(context),name))){out.write(new byte[]{1,2,3});}
        JSONObject images=new JSONObject().put(url,new JSONObject().put("path","offline-catalog/"+name));
        OfflineDownloadStore.write(context,"manifest.json",new JSONObject().put("images",images).put("resume",new JSONObject().put("enabled",true)));
        assertEquals(ListenableWorker.Result.success(),worker("test-generation").doWork());
        JSONObject persisted=OfflineDownloadStore.manifest(context);
        assertEquals("current",persisted.getString("signature"));
        assertFalse(persisted.getJSONObject("resume").getBoolean("enabled"));
        assertTrue(persisted.getJSONObject("resume").getBoolean("autoUpdate"));
        assertTrue(OfflineDownloadStore.present(context,persisted.getJSONObject("images").getJSONObject(url)));
    }
    @Test public void pausedAndStaleWorkersCannotChangeTheCurrentDownload()throws Exception {
        assertEquals(ListenableWorker.Result.success(),worker("old-generation").doWork());
        assertFalse(OfflineDownloadStore.manifest(context).has("signature"));
        job.put("paused",true);OfflineDownloadStore.write(context,"job.json",job);
        assertEquals(ListenableWorker.Result.success(),worker("test-generation").doWork());
        assertEquals("test-generation",OfflineDownloadStore.read(context,"job.json").getString("id"));
        assertFalse(OfflineDownloadStore.manifest(context).has("signature"));
    }
    @Test public void cachePathsCannotEscapeApplicationStorage()throws Exception {
        assertFalse(OfflineDownloadStore.present(context,new JSONObject().put("path","../outside.jpg")));
        assertEquals(OfflineDownloadWorker.fileName(url),OfflineDownloadWorker.fileName(url));
        assertNotEquals(OfflineDownloadWorker.fileName(url),OfflineDownloadWorker.fileName("https://vaad.ar/other.jpg"));
    }
}
