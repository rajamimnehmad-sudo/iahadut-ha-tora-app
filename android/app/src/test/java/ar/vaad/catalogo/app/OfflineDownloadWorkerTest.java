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
import java.net.SocketTimeoutException;
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
    public static class NetworkFixtureWorker extends OfflineDownloadWorker {
        static boolean failFirst; static boolean permanentFailure; static int secondRequests;
        public NetworkFixtureWorker(Context c,WorkerParameters p){super(c,p);}
        @Override void download(String value,File target)throws Exception {
            if(value.endsWith("cache.jpg")&&permanentFailure)throw new UnavailableImageException(404);
            if(value.endsWith("cache.jpg")&&failFirst)throw new SocketTimeoutException();
            if(value.endsWith("second.jpg"))secondRequests++;
            try(FileOutputStream out=new FileOutputStream(target)){out.write(new byte[]{1,2,3});}
        }
    }
    @Test public void unavailablePhotoDoesNotBlockOtherPhotosAndRetryReusesCompletedFiles()throws Exception {
        String second="https://vaad.ar/second.jpg";
        job.put("urls",new JSONArray().put(url).put(second));
        OfflineDownloadStore.write(context,"job.json",job);
        NetworkFixtureWorker.permanentFailure=false;NetworkFixtureWorker.failFirst=true;NetworkFixtureWorker.secondRequests=0;
        NetworkFixtureWorker first=TestWorkerBuilder.from(context,NetworkFixtureWorker.class,Executors.newSingleThreadExecutor())
            .setInputData(new Data.Builder().putString("job","test-generation").build()).build();
        assertEquals(ListenableWorker.Result.retry(),first.doWork());
        assertTrue(OfflineDownloadStore.present(context,OfflineDownloadStore.manifest(context).getJSONObject("images").getJSONObject(second)));
        assertFalse(OfflineDownloadStore.manifest(context).has("signature"));
        NetworkFixtureWorker.failFirst=false;
        NetworkFixtureWorker retry=TestWorkerBuilder.from(context,NetworkFixtureWorker.class,Executors.newSingleThreadExecutor())
            .setInputData(new Data.Builder().putString("job","test-generation").build()).build();
        assertEquals(ListenableWorker.Result.success(),retry.doWork());
        assertEquals(1,NetworkFixtureWorker.secondRequests);
        assertEquals("current",OfflineDownloadStore.manifest(context).getString("signature"));
    }
    @Test public void official404DoesNotRetryOrClaimOfflineCompletion()throws Exception {
        String second="https://vaad.ar/second.jpg";
        job.put("urls",new JSONArray().put(url).put(second));OfflineDownloadStore.write(context,"job.json",job);
        NetworkFixtureWorker.permanentFailure=true;NetworkFixtureWorker.failFirst=false;
        try {
            OfflineDownloadWorker w=TestWorkerBuilder.from(context,NetworkFixtureWorker.class,Executors.newSingleThreadExecutor()).setInputData(new Data.Builder().putString("job","test-generation").build()).build();
            assertEquals(ListenableWorker.Result.failure(),w.doWork());
            assertTrue(OfflineDownloadStore.present(context,OfflineDownloadStore.manifest(context).getJSONObject("images").getJSONObject(second)));
            assertFalse(OfflineDownloadStore.manifest(context).has("signature"));
            assertTrue(OfflineDownloadStore.read(context,"job.json").getString("error").contains("fuente oficial"));
        } finally {NetworkFixtureWorker.permanentFailure=false;}
    }
    public static class ParallelFixtureWorker extends OfflineDownloadWorker {
        static java.util.concurrent.CountDownLatch firstWave;
        static java.util.concurrent.atomic.AtomicInteger active,maximum,requests;
        public ParallelFixtureWorker(Context c,WorkerParameters p){super(c,p);}
        @Override void download(String value,File target)throws Exception {
            int concurrent=active.incrementAndGet();maximum.accumulateAndGet(concurrent,Math::max);
            try {
                requests.incrementAndGet();firstWave.countDown();
                if(!firstWave.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IOException("Transfers did not overlap");
                try(FileOutputStream out=new FileOutputStream(target)){out.write(new byte[]{1,2,3});}
            } finally {active.decrementAndGet();}
        }
    }
    @Test public void downloadsUseThreeLanesWithoutLosingManifestEntries()throws Exception {
        JSONArray urls=new JSONArray();for(int i=0;i<6;i++)urls.put("https://vaad.ar/parallel-"+i+".jpg");
        job.put("urls",urls);OfflineDownloadStore.write(context,"job.json",job);
        ParallelFixtureWorker.firstWave=new java.util.concurrent.CountDownLatch(3);
        ParallelFixtureWorker.active=new java.util.concurrent.atomic.AtomicInteger();
        ParallelFixtureWorker.maximum=new java.util.concurrent.atomic.AtomicInteger();
        ParallelFixtureWorker.requests=new java.util.concurrent.atomic.AtomicInteger();
        OfflineDownloadWorker w=TestWorkerBuilder.from(context,ParallelFixtureWorker.class,Executors.newSingleThreadExecutor())
            .setInputData(new Data.Builder().putString("job","test-generation").build()).build();
        assertEquals(ListenableWorker.Result.success(),w.doWork());
        assertEquals(3,ParallelFixtureWorker.maximum.get());assertEquals(6,ParallelFixtureWorker.requests.get());
        JSONObject persisted=OfflineDownloadStore.manifest(context);
        assertEquals(6,persisted.getJSONObject("images").length());assertEquals("current",persisted.getString("signature"));
        for(int i=0;i<urls.length();i++)assertTrue(OfflineDownloadStore.present(context,persisted.getJSONObject("images").getJSONObject(urls.getString(i))));
    }
    @Test public void temporaryNetworkErrorsRetryWithinABoundedBudget(){
        assertTrue(OfflineDownloadWorker.shouldRetry(new SocketTimeoutException(),0));
        assertTrue(OfflineDownloadWorker.shouldRetry(new IOException("connection lost"),2));
        assertFalse(OfflineDownloadWorker.shouldRetry(new IOException("connection lost"),3));
        assertFalse(OfflineDownloadWorker.shouldRetry(new IllegalArgumentException(),0));
        assertFalse(OfflineDownloadWorker.shouldRetry(new OfflineDownloadWorker.UnavailableImageException(410),0));
    }
    @Test public void cachePathsCannotEscapeApplicationStorage()throws Exception {
        assertFalse(OfflineDownloadStore.present(context,new JSONObject().put("path","../outside.jpg")));
        assertEquals(OfflineDownloadWorker.fileName(url),OfflineDownloadWorker.fileName(url));
        assertNotEquals(OfflineDownloadWorker.fileName(url),OfflineDownloadWorker.fileName("https://vaad.ar/other.jpg"));
    }
}
