import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        OfflineImageTransfers.shared.setForeground(true)

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = IahadutBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
    func sceneWillEnterForeground(_ scene: UIScene) {
        OfflineImageTransfers.shared.setForeground(true)
    }
    func sceneDidEnterBackground(_ scene: UIScene) {
        OfflineImageTransfers.shared.setForeground(false)
    }
}
