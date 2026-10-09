import Capacitor
import UserNotifications

@objc(PushHistoryPlugin)
public final class PushHistoryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PushHistoryPlugin"
    public let jsName = "PushHistory"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func getHistory(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
            do {
                for notification in notifications {
                    let content = notification.request.content
                    try PushHistoryStore.record(content.userInfo, title: content.title, body: content.body, identifier: notification.request.identifier)
                }
                let history = try PushHistoryStore.history(markRead: call.getBool("markRead") ?? false, revoked: call.getArray("revoked", String.self) ?? [])
                call.resolve(["notifications": history])
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func configure(_ call: CAPPluginCall) { setEnabled(call) }

    @objc func setEnabled(_ call: CAPPluginCall) {
        do { try PushHistoryStore.setEnabled(call.getBool("enabled") ?? false); call.resolve() }
        catch { call.reject(error.localizedDescription) }
    }

    @objc func clearHistory(_ call: CAPPluginCall) {
        do {
            try PushHistoryStore.clear()
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }
}
