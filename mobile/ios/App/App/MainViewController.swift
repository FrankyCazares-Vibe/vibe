import UIKit
import WebKit
import Capacitor

// The iPhone app's one screen: Capacitor's web view on the live site, plus two
// things Capacitor doesn't do by itself. SceneDelegate creates it. Capacitor
// 8.5 builds the window in code, so naming this class in Main.storyboard alone
// would change nothing.
class MainViewController: CAPBridgeViewController {

    // Runs once, after the web view and the bridge exist and before the first
    // page loads (loadWebView comes later, in viewDidLoad).
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Swipe in from the left edge to go back a page, the way Safari does.
        // Capacitor leaves it off. Next.js page changes are ordinary history
        // entries, so they count as pages here.
        webView?.allowsBackForwardNavigationGestures = true

        // Registered before the first load, so it sees every navigation.
        bridge?.registerPluginInstance(SameSiteNavigationPlugin())
    }
}

// Keeps the app on Vibe's own site.
//
// Capacitor lets a page load inside the app when its address STARTS WITH the
// server URL (WebViewDelegationHandler, "isApplicationNavigation"). So
// https://www.connectvibe.app.example.com, or
// https://www.connectvibe.app@example.com, would open inside the app with every
// native plugin attached. Capacitor asks its plugins before running that check,
// so this answers first and compares the whole origin instead: scheme, host and
// port, the way a browser does.
//
// It only ever says no. Vibe's own pages, the error page (capacitor://localhost),
// and frames inside a page fall through to Capacitor's rules unchanged. Any
// other site opens in Safari, which is what Capacitor already does for sites
// that don't look like ours.
//
// The web code never calls it; a plugin is simply the hook Capacitor offers for
// this. Android needs no copy: it compares the host exactly (Bridge.java).
@objc(VibeSameSiteNavigationPlugin)
final class SameSiteNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "VibeSameSiteNavigationPlugin"
    let jsName = "VibeSameSiteNavigation"
    let pluginMethods: [CAPPluginMethod] = []

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        // Frames inside a page (the desktop tree's /html pages, embeds) keep
        // Capacitor's rules: they can't take the app somewhere else.
        let topLevel = navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true
        guard topLevel,
              let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let config = bridge?.config else {
            return nil
        }

        if sameOrigin(url, config.serverURL) {
            return nil
        }
        // There's no allowNavigation list today (mobile/capacitor.config.ts).
        // If one is ever added, it still decides for the hosts it names.
        if let host = url.host, config.shouldAllowNavigation(to: host) {
            return nil
        }

        // Same as Capacitor's own hand-off: only while the app is on screen,
        // so a page can't open Safari from the background.
        if webView?.window?.windowScene?.activationState == .foregroundActive {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return NSNumber(value: true)
    }
}

// Scheme, host and port must all match. A URL with no port uses its scheme's
// default, so https://www.connectvibe.app:443 counts as the site itself.
private func sameOrigin(_ first: URL, _ second: URL) -> Bool {
    guard let firstScheme = first.scheme?.lowercased(),
          let secondScheme = second.scheme?.lowercased(),
          let firstHost = first.host?.lowercased(),
          let secondHost = second.host?.lowercased() else {
        return false
    }
    return firstScheme == secondScheme
        && firstHost == secondHost
        && effectivePort(first, firstScheme) == effectivePort(second, secondScheme)
}

private func effectivePort(_ url: URL, _ scheme: String) -> Int? {
    if let port = url.port {
        return port
    }
    switch scheme {
    case "https": return 443
    case "http": return 80
    default: return nil
    }
}
