package ar.vaad.catalogo.app;

import android.content.Context;
import androidx.work.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="OfflineDownload")
public final class OfflineDownloadPlugin extends Plugin {
    private final java.util.concurrent.ExecutorService io = Executors.newSingleThreadExecutor();
    @PluginMethod public void clear(PluginCall call) { run(call, () -> {
        synchronized (OfflineDownloadStore.class) {
            OfflineDownloadStore.write(getContext(),"job.json",new JSONObject().put("id",UUID.randomUUID().toString()).put("paused",true));
            WorkManager.getInstance(getContext()).cancelUniqueWork(OfflineDownloadStore.WORK);
            File folder=OfflineDownloadStore.folder(getContext());
            try(java.util.stream.Stream<java.nio.file.Path> paths=Files.walk(folder.toPath())) {
                for(java.nio.file.Path path:paths.sorted(Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(path);
            }
        }
        return new JSObject();
    }); }
    @PluginMethod public void start(PluginCall call) { run(call, () -> {
        synchronized (OfflineDownloadStore.class) {
            JSONObject args = call.getData(); JSONArray urls = args.getJSONArray("urls");
            if (urls.length() > 15000) throw new IOException("Demasiadas imágenes");
            for (int i=0;i<urls.length();i++) OfflineDownloadStore.validateUrl(urls.getString(i));
            JSONObject manifest = OfflineDownloadStore.manifest(getContext());
            JSONObject job = new JSONObject().put("id", UUID.randomUUID().toString()).put("urls", urls)
                .put("signature", args.getString("signature")).put("wifiOnly",args.optBoolean("wifiOnly",true))
                .put("paused",false).put("error","");
            WorkManager.getInstance(getContext()).cancelUniqueWork(OfflineDownloadStore.WORK);
            OfflineDownloadStore.write(getContext(),"catalog.json",args.getJSONObject("snapshot"));
            OfflineDownloadStore.write(getContext(),"job.json",job);
            manifest.put("resume",new JSONObject().put("enabled",true).put("autoUpdate",true).put("allowMobile",!job.getBoolean("wifiOnly")));
            OfflineDownloadStore.write(getContext(),"manifest.json",manifest);
            OfflineDownloadStore.enqueue(getContext(),job,ExistingWorkPolicy.REPLACE);
        }
        return new JSObject();
    }); }
    @PluginMethod public void status(PluginCall call) { run(call, () -> {
        synchronized (OfflineDownloadStore.class) {
            JSONObject job=OfflineDownloadStore.read(getContext(),"job.json");
            JSONObject manifest=OfflineDownloadStore.manifest(getContext());
            JSONArray urls=job.optJSONArray("urls"); int done=0, total=urls==null?0:urls.length();
            JSONObject images=manifest.getJSONObject("images");
            for(int i=0;i<total;i++) if(OfflineDownloadStore.present(getContext(),images.optJSONObject(urls.getString(i)))) done++;
            boolean ready=total>0 && done==total && manifest.optString("signature").equals(job.optString("signature"));
            boolean busy=false,waiting=false;
            if(!job.optString("id").isEmpty()) for(WorkInfo info:WorkManager.getInstance(getContext()).getWorkInfosByTag(job.getString("id")).get()) {
                if(!info.getState().isFinished()) {busy=true;waiting |= info.getState()!=WorkInfo.State.RUNNING;}
            }
            for(Iterator<String> it=images.keys();it.hasNext();) {String url=it.next();JSONObject item=images.getJSONObject(url);
                if(OfflineDownloadStore.present(getContext(),item)) item.put("uri",android.net.Uri.fromFile(new File(getContext().getFilesDir(),item.getString("path"))).toString());
                else it.remove();
            }
            return new JSObject().put("manifest",manifest).put("busy",busy).put("waiting",waiting)
                .put("paused",job.optBoolean("paused")).put("ready",ready).put("percent",total==0?0:Math.min(ready?100:99,done*100/total))
                .put("error",job.optString("error"));
        }
    }); }
    @PluginMethod public void pause(PluginCall call) { run(call, () -> {
        synchronized(OfflineDownloadStore.class) {
            JSONObject job=OfflineDownloadStore.read(getContext(),"job.json"); job.put("paused",true);
            OfflineDownloadStore.write(getContext(),"job.json",job);
            WorkManager.getInstance(getContext()).cancelUniqueWork(OfflineDownloadStore.WORK);
            JSONObject manifest=OfflineDownloadStore.manifest(getContext());
            manifest.put("resume",new JSONObject().put("enabled",false).put("autoUpdate",false).put("allowMobile",manifest.optJSONObject("resume")!=null&&manifest.getJSONObject("resume").optBoolean("allowMobile")));
            OfflineDownloadStore.write(getContext(),"manifest.json",manifest);
        }
        return new JSObject();
    }); }
    @PluginMethod public void preference(PluginCall call) { run(call, () -> {
        synchronized(OfflineDownloadStore.class) {JSONObject manifest=OfflineDownloadStore.manifest(getContext());
            manifest.put("resume",new JSONObject().put("enabled",call.getBoolean("enabled",false)).put("autoUpdate",call.getBoolean("autoUpdate",false)).put("allowMobile",call.getBoolean("allowMobile",false)));
            OfflineDownloadStore.write(getContext(),"manifest.json",manifest);return new JSObject();}
    }); }
    interface Operation {JSObject execute() throws Exception;}
    private void run(PluginCall call,Operation operation) {
        io.execute(()->{try{call.resolve(operation.execute());}catch(Exception e){call.reject("No se pudo gestionar la descarga",e);}});
    }
}

final class OfflineDownloadStore {
    static final String WORK="offline-image-download";
    static File folder(Context c) {return new File(c.getFilesDir(),"offline-catalog");}
    static JSONObject read(Context c,String name) throws Exception {
        File f=new File(folder(c),name);return f.exists()?new JSONObject(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8)):new JSONObject();
    }
    static JSONObject manifest(Context c)throws Exception {JSONObject m=read(c,"manifest.json");if(!m.has("images"))m.put("images",new JSONObject());return m;}
    static void write(Context c,String name,JSONObject data)throws Exception {
        folder(c).mkdirs();android.util.AtomicFile f=new android.util.AtomicFile(new File(folder(c),name));FileOutputStream out=f.startWrite();
        try {out.write(data.toString().getBytes(StandardCharsets.UTF_8));f.finishWrite(out);}catch(Exception e){f.failWrite(out);throw e;}
    }
    static boolean present(Context c,JSONObject item){
        if(item==null)return false;String path=item.optString("path");
        if(!path.matches("offline-catalog/[a-f0-9]{64}\\.(jpg|jpeg|png|webp|gif|svg)"))return false;
        return new File(c.getFilesDir(),path).length()>0;
    }
    static void validateUrl(String value)throws Exception {java.net.URL u=new java.net.URL(value);if(!u.getProtocol().equals("https")||u.getUserInfo()!=null)throw new IOException("URL inválida");}
    static void enqueue(Context c,JSONObject job,ExistingWorkPolicy policy)throws Exception {
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(OfflineDownloadWorker.class)
            .setInputData(new Data.Builder().putString("job",job.getString("id")).build()).addTag(job.getString("id"))
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(job.optBoolean("wifiOnly",true)?NetworkType.UNMETERED:NetworkType.CONNECTED).setRequiresStorageNotLow(true).build()).build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK,policy,request);
    }
}
