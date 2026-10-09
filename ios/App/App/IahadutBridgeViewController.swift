import Capacitor
import Network

final class IahadutBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(OfflineNetworkPlugin())
        bridge?.registerPluginInstance(OfflineDownloadPlugin())
        bridge?.registerPluginInstance(PushHistoryPlugin())
    }
}

@objc(OfflineNetworkPlugin)
public final class OfflineNetworkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfflineNetworkPlugin"
    public let jsName = "OfflineNetwork"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getConnection", returnType: CAPPluginReturnPromise)
    ]

    @objc func getConnection(_ call: CAPPluginCall) {
        // Wait for the first evaluated path; currentPath before it arrives can
        // incorrectly report a disconnected phone. Timeout stays conservative.
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "ar.vaad.catalogo.app.network.\(UUID().uuidString)")
        var finished = false
        let finish: ([String: Any]) -> Void = { result in
            guard !finished else { return }
            finished = true
            monitor.cancel()
            monitor.pathUpdateHandler = nil
            DispatchQueue.main.async { call.resolve(result) }
        }
        monitor.pathUpdateHandler = { path in
            let type: String
            if path.status != .satisfied { type = "none" }
            else if path.usesInterfaceType(.wifi) { type = "wifi" }
            else if path.usesInterfaceType(.cellular) { type = "cellular" }
            else if path.usesInterfaceType(.wiredEthernet) { type = "ethernet" }
            else { type = "unknown" }
            finish(["type": type, "metered": path.isExpensive || path.isConstrained])
        }
        monitor.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 3) {
            finish(["type": "unknown", "metered": true])
        }
    }
}
