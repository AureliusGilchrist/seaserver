package app.seanine.denshi.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Native side of the Denshi Mobile shell: installs downloaded frontend bundles into app storage
 * and reports which one is live, plus persists the server URL for synchronous access at cold
 * start (see ShellConfigInterface).
 *
 * The frontend update flow: the shell script downloads a bundle.zip, this plugin unzips it into
 * files/frontend/<version>/ and validates it, then the shell points Capacitor's WebView plugin at
 * the new directory (setServerBasePath + persistServerBasePath). On the next cold start the
 * bridge itself restores the persisted path before the first load — no flash, no custom loader.
 */
@CapacitorPlugin(name = "MobileShell")
public class MobileShellPlugin extends Plugin {

    // Same store the WebView plugin uses for serverBasePath, so activeFrontendVersion can read it.
    private static final String WEBVIEW_PREFS_NAME = "CapWebViewSettings";
    private static final String CAP_SERVER_PATH = "serverBasePath";

    private static final String SHELL_PREFS_NAME = "DenshiMobileShell";
    private static final String SERVER_URL_KEY = "serverUrl";

    @PluginMethod
    public void getServerUrl(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("url", getContext().getSharedPreferences(SHELL_PREFS_NAME, Context.MODE_PRIVATE).getString(SERVER_URL_KEY, null));
        call.resolve(ret);
    }

    @PluginMethod
    public void saveServerUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(SHELL_PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(SERVER_URL_KEY, url.trim()).apply();
        call.resolve();
    }

    /** The version directory the WebView is serving, or "bundled" if it is serving the APK assets. */
    @PluginMethod
    public void activeFrontendVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", activeFrontendVersion());
        call.resolve(ret);
    }

    private String activeFrontendVersion() {
        SharedPreferences prefs = getContext().getSharedPreferences(WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE);
        String path = prefs.getString(CAP_SERVER_PATH, null);
        if (path == null) return "bundled";

        File expectedRoot = new File(getContext().getFilesDir(), "frontend").getAbsoluteFile();
        File served = new File(path).getAbsoluteFile();
        File parent = served.getParentFile();
        if (parent != null && expectedRoot.equals(parent.getParentFile())) {
            return parent.getName();
        }
        return "bundled";
    }

    /**
     * Unzips a downloaded bundle into files/frontend/<version>/ and makes it the only version on
     * disk. The zip's contents live at its root (index.html at the root) and must include the
     * shell layer — a bundle without it could never update again.
     */
    @PluginMethod
    public void installFrontend(PluginCall call) {
        String version = call.getString("version");
        String zipPath = call.getString("zipPath");

        if (version == null || !version.matches("[A-Za-z0-9_-]{1,128}")) {
            call.reject("invalid version");
            return;
        }
        if (zipPath == null || zipPath.isEmpty()) {
            call.reject("zipPath is required");
            return;
        }

        Context context = getContext();
        File zipFile = resolveZipFile(zipPath);
        if (!zipFile.exists()) {
            call.reject("bundle not found at " + zipPath);
            return;
        }

        try {
            File frontendRoot = new File(context.getFilesDir(), "frontend");
            File dest = new File(frontendRoot, version);

            // Clean any partial install of this same version before extracting.
            deleteRecursively(dest);

            File indexFile = null;
            boolean hasShell = false;
            int fileCount = 0;

            try (ZipFile zip = new ZipFile(zipFile)) {
                Enumeration<? extends ZipEntry> entries = zip.entries();
                while (entries.hasMoreElements()) {
                    ZipEntry entry = entries.nextElement();
                    String name = entry.getName();

                    // Traversal guard: entries must be plain relative paths.
                    if (name == null || name.isEmpty()
                            || name.contains("..")
                            || name.startsWith("/")
                            || name.contains("\\")
                            || name.contains(":")) {
                        throw new IOException("unsafe entry in bundle: " + name);
                    }

                    File outFile = new File(dest, name);
                    if (entry.isDirectory()) {
                        outFile.mkdirs();
                        continue;
                    }
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("could not create directory for " + name);
                    }

                    try (InputStream in = zip.getInputStream(entry);
                         OutputStream out = new FileOutputStream(outFile)) {
                        copyStream(in, out);
                    }
                    fileCount += 1;

                    if (name.equals("index.html")) indexFile = outFile;
                    if (name.equals("shell/update-manager.js")) hasShell = true;
                }
            }

            if (indexFile == null || !indexFile.exists()) {
                deleteRecursively(dest);
                call.reject("bundle has no index.html");
                return;
            }
            if (!hasShell) {
                deleteRecursively(dest);
                call.reject("bundle is missing shell/update-manager.js");
                return;
            }

            // Remove every other version — the newest is the only one worth keeping.
            File[] siblings = frontendRoot.listFiles();
            if (siblings != null) {
                for (File sibling : siblings) {
                    if (!sibling.equals(dest)) deleteRecursively(sibling);
                }
            }

            // The zip's job is done; drop it so a failed download never lingers.
            zipFile.delete();

            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("path", dest.getAbsolutePath());
            ret.put("files", fileCount);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("install failed: " + e.getMessage(), e);
        }
    }

    /** Accepts a path relative to filesDir (Filesystem's DATA directory) or an absolute one. */
    private File resolveZipFile(String zipPath) {
        File f = new File(zipPath);
        if (f.isAbsolute()) return f;
        return new File(getContext().getFilesDir(), zipPath);
    }

    private static void copyStream(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        out.flush();
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
