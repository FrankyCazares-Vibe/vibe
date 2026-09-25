import UIKit
import Capacitor

// The app is scene-based (Capacitor 8.5), so SceneDelegate builds the screen
// and receives links that open the app. Don't add application(_:open:) or
// application(_:continue:) handlers here: a scene app never gets those calls,
// and SceneDelegate already forwards both to Capacitor.
//
// Push: this file only forwards the APNs device-token callbacks (below).
// Nothing here imports or configures Firebase. The push plugin
// (@capacitor-firebase/messaging) configures it itself, and only when
// GoogleService-Info.plist is in the app (its FirebaseMessaging.swift init),
// so a build without that file runs normally, just without push. An unguarded
// FirebaseApp.configure() here would crash that build at launch.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // The APNs device token, handed to the push plugin through Capacitor's own
    // notification names (the plugin's README; CAPNotifications.swift). The
    // plugin gives it to Firebase, which needs it before it can issue this
    // phone's FCM token. The plugin doesn't observe the failure yet; it's
    // posted anyway, as its README asks, and a failed registration shows up as
    // a failed getToken. No didReceiveRemoteNotification hook: Vibe sends no
    // silent pushes (w3-maps/3D-native.md, gotcha 8).
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
