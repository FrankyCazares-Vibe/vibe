package app.connectvibe.vibe;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Map;

/**
 * The whole app is one Capacitor web view on https://www.connectvibe.app. This adds the two things
 * the template doesn't do: the notification channels, and letting the site's own error pages show
 * instead of the offline page.
 */
public class MainActivity extends BridgeActivity {

    // Permanent ids. Android keeps a channel, and whatever the student chose for it, until the app is
    // uninstalled. The push sender (still to come) is to name these exact strings, and the
    // manifest's Firebase fallback channel is already "activity". Renaming one would strand the old
    // channel in the phone's settings.
    static final String CHANNEL_MESSAGES = "messages";
    static final String CHANNEL_ACTIVITY = "activity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        // super.onCreate built the bridge and started loading the site. That load's page and error
        // callbacks run on this thread, so none can arrive before onCreate returns, and the
        // replacement client sees all of them. bridge is null only when the phone has no usable
        // WebView, and BridgeActivity has shown its own screen then.
        if (bridge != null) {
            bridge.setWebViewClient(new SiteErrorPagesClient(bridge));
        }
    }

    /**
     * Channels exist from Android 8 (API 26). Creating one that already exists only refreshes its name
     * and description, never its importance or anything the student changed, so this runs on every
     * launch. It doesn't ask for notification permission: an app targeting 33+ decides when Android
     * shows that prompt, and the page asks in context.
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        // Messages pop up over whatever is on screen, with a sound, the way a text does.
        NotificationChannel messagesChannel = new NotificationChannel(
            CHANNEL_MESSAGES,
            getString(R.string.channel_messages_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        messagesChannel.setDescription(getString(R.string.channel_messages_description));

        // Likes, follows and the rest make a sound but wait in the notification shade.
        NotificationChannel activityChannel = new NotificationChannel(
            CHANNEL_ACTIVITY,
            getString(R.string.channel_activity_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        activityChannel.setDescription(getString(R.string.channel_activity_description));

        manager.createNotificationChannel(messagesChannel);
        manager.createNotificationChannel(activityChannel);
    }

    /**
     * Capacitor replaces any page that answers 400 or more with the offline page (errorPath). For Vibe
     * that's wrong: a deleted post's 404 would say "Vibe couldn't load this page" and blame the
     * connection, when the site's own 404 page says the page doesn't exist. So Capacitor gets the
     * same request marked "not the main frame": it still tells its web view listeners about the error
     * (that list is package-private in Bridge, so this can't loop over it itself), and it skips the
     * swap.
     *
     * Real load failures (no network, DNS, TLS) arrive in onReceivedError, which is untouched and
     * still shows the offline page.
     */
    private static final class SiteErrorPagesClient extends BridgeWebViewClient {

        SiteErrorPagesClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse
        ) {
            WebResourceRequest forCapacitor = request.isForMainFrame()
                ? new NotMainFrame(request)
                : request;
            super.onReceivedHttpError(view, forCapacitor, errorResponse);
        }
    }

    /** The request as it came, except that it says it isn't for the main frame. */
    private static final class NotMainFrame implements WebResourceRequest {

        private final WebResourceRequest request;

        NotMainFrame(WebResourceRequest request) {
            this.request = request;
        }

        @Override
        public Uri getUrl() {
            return request.getUrl();
        }

        @Override
        public boolean isForMainFrame() {
            return false;
        }

        @Override
        public boolean isRedirect() {
            return request.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return request.hasGesture();
        }

        @Override
        public String getMethod() {
            return request.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return request.getRequestHeaders();
        }
    }
}
