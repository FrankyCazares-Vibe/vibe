import type { CapacitorConfig } from "@capacitor/cli";

// The store apps are one full-screen web view pointed at the live site. Every
// screen, sign-in and API call is the website; the app adds a name tag to the
// browser signature (appendUserAgent) so the site knows it's inside the app,
// plus a few native plugins the site talks to through window.Capacitor.
//
// This file is read at `npx cap sync` time and copied, as JSON, into the
// generated (gitignored) ios/App/App/capacitor.config.json and
// android/app/src/main/assets/capacitor.config.json. Whatever it evaluates to
// on the day of the sync is what the next Archive or bundle ships, which is why
// `npm run release:check` reads those copies before every release.
//
// THE REPO IS PUBLIC. No signing values here, ever: no keystore path or
// password under android.buildOptions, no team under ios. Signing lives in
// Xcode and in the gitignored keystore.properties.

const LIVE_URL = "https://www.connectvibe.app";

// Local development only: `CAP_DEV_URL=http://localhost:3000 npx cap sync ios`
// points the app at `next dev` on this Mac, which must be running against the
// LOCAL Supabase (next start and a live-env next dev both talk to the
// production database). Cleartext is allowed only in that build. Re-sync
// without the variable before any Archive; release:check fails otherwise.
const devUrl = process.env.CAP_DEV_URL?.trim();

const config: CapacitorConfig = {
  appId: "app.connectvibe.vibe",
  appName: "Vibe",
  // Required by the CLI, never shown: server.url replaces it. www/ also holds
  // the error page below.
  webDir: "www",
  // Cream behind the web view, so the first frame and the rubber-band edges
  // match the site instead of flashing white.
  backgroundColor: "#FAF7F2",
  server: devUrl
    ? { url: devUrl, cleartext: true, appStartPath: "/campus", errorPath: "offline.html" }
    : {
        // No trailing slash: Android joins url + appStartPath as plain text,
        // so a slash here would open //campus, and Android also uses this
        // exact string as the origin its bridge will talk to.
        url: LIVE_URL,
        appStartPath: "/campus",
        // Shown on iOS for any failed load (a cancelled tap included) and on
        // Android for any HTTP status of 400 or more, not only when offline.
        // The copy in www/offline.html is written for all of those.
        errorPath: "offline.html",
      },
  // No allowNavigation. Never add a payment host here.
  //
  // Android opens any host other than exactly www.connectvibe.app outside the
  // app, in Chrome. iOS doesn't: Capacitor only checks that the address
  // STARTS WITH the server URL, so a look-alike such as
  // https://www.connectvibe.app.example.com would load inside the app, with
  // the native plugins attached. The iOS project has to refuse those itself
  // (a navigation guard in ios/App/App/MainViewController.swift that sends
  // every other host to Safari). Don't fix it here with a trailing slash:
  // see server.url above.
  ios: {
    // Capacitor inserts the separating space itself on both platforms. The
    // web code's detector (src/lib/native/detect.ts) looks for exactly this.
    appendUserAgent: "VibeApp/1 (ios)",
    // The page handles the notch itself (viewport-fit=cover + safe-area
    // padding), so the web view must not add insets of its own.
    contentInset: "never",
  },
  android: {
    appendUserAgent: "VibeApp/1 (android)",
  },
  plugins: {
    // Both stay off, which is their default. On, they would replace fetch,
    // XMLHttpRequest and document.cookie for the whole site, and Supabase's
    // sign-in cookies would stop behaving like the browser's.
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
    // Hide on its own. The Android error page gets no plugins, so a splash
    // waiting for a JS hide() would never go away while offline.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#FAF7F2",
      showSpinner: false,
    },
    // "LIGHT" means dark text and icons, for a light background. Without it,
    // Dark Mode would put white status-bar text on the cream page. No status
    // bar colour: the page draws under the bar (the default overlay), and
    // setBackgroundColor does nothing on Android 15+ anyway.
    StatusBar: { style: "LIGHT" },
    SystemBars: { style: "LIGHT" },
    // Push (@capacitor-firebase/messaging). iPhone only: while the app is
    // open, a push still shows as a banner, with its sound, instead of
    // arriving silently. It's also the plugin's default, written out so it
    // doesn't hang on one. Android ignores this, and FCM shows nothing while
    // the app is open there (mobile/README.md, "Push"). `release:check`
    // fails when the synced copies lack this block.
    FirebaseMessaging: { presentationOptions: ["alert", "badge", "sound"] },
  },
};

export default config;
