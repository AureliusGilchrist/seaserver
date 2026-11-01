package app.seanine.denshi.mobile;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fetches what the page loads from the server over plain http.
 *
 * The page is served from https://localhost, and API calls leave through the native HTTP plugin. An
 * img or video element cannot: it goes through the WebView's own network stack, which can refuse to
 * reach a local address from a page, so episodes and manga pages failed while everything else worked.
 * Answering those requests here sends them out the same way the API calls go. Anything that goes
 * wrong falls back to the WebView's own attempt.
 */
public class NativeMediaWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "DenshiMedia";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    public NativeMediaWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (shouldFetchNatively(request)) {
            WebResourceResponse response = fetch(request);
            if (response != null) return response;
        }
        return super.shouldInterceptRequest(view, request);
    }

    static boolean shouldFetchNatively(WebResourceRequest request) {
        Uri url = request.getUrl();
        return !request.isForMainFrame()
            && "GET".equals(request.getMethod())
            && "http".equals(url.getScheme())
            && !"localhost".equals(url.getHost());
    }

    private WebResourceResponse fetch(WebResourceRequest request) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(request.getUrl().toString()).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            // Sizes and byte ranges have to describe the bytes the video element receives.
            connection.setRequestProperty("Accept-Encoding", "identity");
            for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                // A 304 cannot be answered from here: the WebView has no body to reuse.
                String name = header.getKey().toLowerCase(Locale.ROOT);
                if (name.equals("accept-encoding") || name.startsWith("if-")) continue;
                connection.setRequestProperty(header.getKey(), header.getValue());
            }

            int status = connection.getResponseCode();
            // WebResourceResponse refuses these, and redirects were followed above.
            if (status < 200 || status >= 600 || (status >= 300 && status < 400)) {
                connection.disconnect();
                return null;
            }

            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() == null || header.getValue().isEmpty()) continue;
                if (header.getKey().equalsIgnoreCase("Transfer-Encoding")) continue;
                headers.put(header.getKey(), String.join(", ", header.getValue()));
            }

            String contentType = connection.getContentType();
            String mimeType = contentType == null ? "application/octet-stream" : contentType.split(";")[0].trim();
            String charset = connection.getContentEncoding();
            String reason = connection.getResponseMessage();
            InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();

            return new WebResourceResponse(
                mimeType,
                charset,
                status,
                reason == null || reason.isEmpty() ? "OK" : reason,
                headers,
                body == null ? new java.io.ByteArrayInputStream(new byte[0]) : body
            );
        } catch (IOException | IllegalArgumentException e) {
            Log.w(TAG, "Native fetch failed for " + request.getUrl().getPath(), e);
            if (connection != null) connection.disconnect();
            return null;
        }
    }
}
