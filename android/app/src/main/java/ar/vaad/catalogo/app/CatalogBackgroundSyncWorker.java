package ar.vaad.catalogo.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Keeps a fresh copy of the public catalog outside the WebView lifecycle.
 * WorkManager persists this job across app minimization, process death and
 * device reboots, while Android still controls the exact execution window.
 */
public final class CatalogBackgroundSyncWorker extends Worker {
    private static final String WORK_NAME = "catalog-background-sync";
    private static final String INITIAL_WORK_NAME = "catalog-background-sync-initial";
    private static final String CACHE_DIR = "catalog-background-cache";
    private static final String PREFS = "catalog_background_sync";
    private static final String PREF_LAST_SUCCESS = "last_success_ms";
    private static final int MAX_BYTES = 16 * 1024 * 1024;
    private static final String RAW_BASE = "https://raw.githubusercontent.com/rajamimnehmad-sudo/iahadut-ha-tora-app/main/web/data/";
    private static final String[] FILES = {"catalog.json", "product-details.json", "content.json"};

    public CatalogBackgroundSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void schedule(Context context) {
        Context appContext = context.getApplicationContext();
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                CatalogBackgroundSyncWorker.class, 12, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic);

        SharedPreferences prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        File catalog = new File(new File(appContext.getFilesDir(), CACHE_DIR), "catalog.json");
        if (!catalog.exists() || prefs.getLong(PREF_LAST_SUCCESS, 0L) == 0L) {
            OneTimeWorkRequest initial = new OneTimeWorkRequest.Builder(CatalogBackgroundSyncWorker.class)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(appContext).enqueueUniqueWork(
                    INITIAL_WORK_NAME, ExistingWorkPolicy.KEEP, initial);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        File directory = new File(getApplicationContext().getFilesDir(), CACHE_DIR);
        if (!directory.exists() && !directory.mkdirs()) return Result.retry();
        try {
            for (String fileName : FILES) {
                String payload = download(RAW_BASE + fileName);
                validate(fileName, payload);
                writeAtomically(new File(directory, fileName), payload);
            }
            getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putLong(PREF_LAST_SUCCESS, System.currentTimeMillis()).apply();
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }

    private static String download(String urlString) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "IahadutHaTora-Android-CatalogSync");
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IOException("Catalog HTTP " + connection.getResponseCode());
            }
            int length = connection.getContentLength();
            if (length > MAX_BYTES) throw new IOException("Catalog response too large");
            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream(Math.max(length, 4096))) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_BYTES) throw new IOException("Catalog response too large");
                    output.write(buffer, 0, read);
                }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            connection.disconnect();
        }
    }

    private static void validate(String fileName, String payload) throws Exception {
        JSONObject root = new JSONObject(payload);
        if ("catalog.json".equals(fileName)) {
            if (!root.has("products") || root.getJSONArray("products").length() < 900) {
                throw new IOException("Incomplete catalog");
            }
        } else if ("product-details.json".equals(fileName)) {
            if (!root.has("products")) throw new IOException("Incomplete product details");
        } else if (!root.has("info") && !root.has("alerts")) {
            throw new IOException("Incomplete content snapshot");
        }
    }

    private static void writeAtomically(File destination, String payload) throws IOException {
        File temporary = new File(destination.getParentFile(), destination.getName() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(payload.getBytes(StandardCharsets.UTF_8));
            output.flush();
            output.getFD().sync();
        }
        if (!temporary.renameTo(destination)) {
            throw new IOException("Unable to replace " + destination.getName());
        }
    }

    public static String read(Context context, String fileName) {
        File file = new File(new File(context.getApplicationContext().getFilesDir(), CACHE_DIR), fileName);
        if (!file.isFile() || file.length() <= 0 || file.length() > MAX_BYTES) return "";
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream((int) file.length())) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException error) {
            return "";
        }
    }
}
