package ar.vaad.catalogo.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Time-bounded resumable transfers: no foreground service or extra Play permission. */
public class OfflineDownloadWorker extends Worker {
    public OfflineDownloadWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();String id=getInputData().getString("job");long deadline=System.currentTimeMillis()+240000;
        try {
            JSONObject job; synchronized(OfflineDownloadStore.class){job=OfflineDownloadStore.read(c,"job.json");}
            JSONArray urls=job.getJSONArray("urls");
            AtomicInteger next=new AtomicInteger();
            AtomicBoolean timeExpired=new AtomicBoolean();
            AtomicReference<IOException> lastImageFailure=new AtomicReference<>();
            ExecutorService transfers=Executors.newFixedThreadPool(3);
            java.util.List<Future<?>> workers=new java.util.ArrayList<>();
            try {
                for(int lane=0;lane<3;lane++) workers.add(transfers.submit((Callable<Void>)()->{
                    int i;
                    while((i=next.getAndIncrement())<urls.length()){
                        String url=urls.getString(i);
                        synchronized(OfflineDownloadStore.class){
                            if(!active(c,id))return null;
                            if(OfflineDownloadStore.present(c,OfflineDownloadStore.manifest(c).getJSONObject("images").optJSONObject(url)))continue;
                        }
                        if(System.currentTimeMillis()>=deadline){timeExpired.set(true);return null;}
                        String name=fileName(url);File target=new File(OfflineDownloadStore.folder(c),name);File temporary=new File(target.getPath()+".part-"+id);
                        try {download(url,temporary);
                            synchronized(OfflineDownloadStore.class){
                                if(!active(c,id))return null;
                                if(!temporary.renameTo(target))throw new IOException("No se pudo guardar imagen");
                                JSONObject manifest=OfflineDownloadStore.manifest(c);
                                manifest.getJSONObject("images").put(url,new JSONObject().put("path","offline-catalog/"+name));
                                OfflineDownloadStore.write(c,"manifest.json",manifest);
                            }
                        } catch(IOException imageFailure){
                            synchronized(OfflineDownloadStore.class){if(!active(c,id))return null;}
                            // Preserve completed photos and prefer retryable failures over a 404.
                            lastImageFailure.updateAndGet(previous -> previous==null || !(imageFailure instanceof UnavailableImageException) ? imageFailure : previous);
                        } finally {temporary.delete();}
                    }
                    return null;
                }));
                // Join every transfer before marking ready, retrying or rescheduling.
                Exception failure=null;
                for(Future<?> worker:workers)try {worker.get();}catch(ExecutionException error){if(failure==null)failure=error.getCause() instanceof Exception ? (Exception)error.getCause() : error;}
                if(failure!=null)throw failure;
            } finally {transfers.shutdownNow();}
            synchronized(OfflineDownloadStore.class){
                if(!active(c,id))return Result.success();
                if(timeExpired.get()){OfflineDownloadStore.enqueue(c,job,ExistingWorkPolicy.APPEND_OR_REPLACE);return Result.success();}
            }
            if(lastImageFailure.get()!=null)throw lastImageFailure.get();
            synchronized(OfflineDownloadStore.class){if(active(c,id)){
                JSONObject manifest=OfflineDownloadStore.manifest(c);manifest.put("signature",job.getString("signature"));
                manifest.put("resume",new JSONObject().put("enabled",false).put("autoUpdate",true).put("allowMobile",!job.optBoolean("wifiOnly",true)));
                OfflineDownloadStore.write(c,"manifest.json",manifest);job.put("error","");OfflineDownloadStore.write(c,"job.json",job);
            }}
            return Result.success();
        }catch(Exception error){
            // WorkManager reschedules interrupted constraints itself. Never mark those as failed.
            if(isStopped()) return Result.success();
            if(shouldRetry(error,getRunAttemptCount())) return Result.retry();
            synchronized(OfflineDownloadStore.class){try{if(active(c,id)){
                JSONObject job=OfflineDownloadStore.read(c,"job.json");job.put("error",error instanceof UnavailableImageException ? "Descarga parcial · Hay fotos que la fuente oficial no tiene disponibles. Podés reintentar más adelante." : "Descarga incompleta · Reintentar");OfflineDownloadStore.write(c,"job.json",job);
            }}catch(Exception ignored){}}
            return Result.failure();
        }
    }
    static class UnavailableImageException extends IOException { UnavailableImageException(int code){super("Imagen no disponible: HTTP "+code);} }
    static boolean shouldRetry(Exception error,int attempt){return error instanceof IOException && !(error instanceof UnavailableImageException) && attempt<3;}
    private boolean active(Context c,String id)throws Exception {JSONObject job=OfflineDownloadStore.read(c,"job.json");return !isStopped()&&id!=null&&id.equals(job.optString("id"))&&!job.optBoolean("paused");}
    static String fileName(String url)throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();for(byte b:hash)s.append(String.format("%02x",b));
        String path=new URL(url).getPath();java.util.regex.Matcher m=java.util.regex.Pattern.compile("\\.(jpe?g|png|webp|gif|svg)$",java.util.regex.Pattern.CASE_INSENSITIVE).matcher(path);
        return s+"."+(m.find()?m.group(1).toLowerCase(java.util.Locale.ROOT):"jpg");
    }
    void download(String value,File target)throws Exception {
        OfflineDownloadStore.validateUrl(value);URL current=new URL(value);HttpURLConnection connection=null;
        for(int redirect=0;redirect<=5;redirect++){
            connection=(HttpURLConnection)current.openConnection();
            connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);
            int response=connection.getResponseCode();
            if(response!=301&&response!=302&&response!=303&&response!=307&&response!=308)break;
            String location=connection.getHeaderField("Location");connection.disconnect();
            if(location==null||redirect==5)throw new IOException("Redirección inválida");
            current=new URL(current,location);OfflineDownloadStore.validateUrl(current.toString());
        }
        try {
            int code=connection.getResponseCode();
            if(code==404 || code==410)throw new UnavailableImageException(code);
            if(code!=200)throw new IOException("Imagen HTTP "+code);
            String type=connection.getContentType();if(type!=null&&(type.contains("text/html")||type.contains("application/json")))throw new IOException("Respuesta no es imagen");
            try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(target)){
                byte[] buffer=new byte[32768];int n,total=0;long deadline=System.currentTimeMillis()+45000;
                while((n=in.read(buffer))!=-1){if(isStopped()||System.currentTimeMillis()>deadline)throw new IOException("Descarga interrumpida");total+=n;if(total>25*1024*1024)throw new IOException("Imagen demasiado grande");out.write(buffer,0,n);}
                if(total==0||connection.getContentLengthLong()>0&&total!=connection.getContentLengthLong())throw new IOException("Imagen incompleta");
            }
            if(value.toLowerCase(java.util.Locale.ROOT).matches(".*\\.svg(?:[?#].*)?$")){
                if(!new String(java.nio.file.Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8).contains("<svg"))throw new IOException("SVG inválido");
            }else if(!value.toLowerCase(java.util.Locale.ROOT).matches(".*\\.svg(?:[?#].*)?$")){
                android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;
                android.graphics.BitmapFactory.decodeFile(target.getPath(),options);if(options.outWidth<=0)throw new IOException("Imagen inválida");
            }
        }finally{connection.disconnect();}
    }
}
