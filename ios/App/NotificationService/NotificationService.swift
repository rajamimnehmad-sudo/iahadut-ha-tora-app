import UserNotifications
import Foundation

final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var handler: ((UNNotificationContent) -> Void)?
    private var content: UNNotificationContent?
    private var session: URLSession?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        lock.lock()
        handler = contentHandler
        content = request.content
        lock.unlock()
        DispatchQueue.global(qos: .utility).async {
            // Save the original data (including imageUrl) before downloading.
            // A missing/slow picture must not lose the notice or its history.
            do {
                try PushHistoryStore.record(request.content.userInfo, title: request.content.title, body: request.content.body, identifier: request.identifier)
            } catch { NSLog("Iahadut: no se pudo guardar el aviso: %@", error.localizedDescription) }
            guard let mutable = request.content.mutableCopy() as? UNMutableNotificationContent,
                  let url = Self.imageURL(request.content.userInfo) else {
                self.finish()
                return
            }
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 10
            configuration.timeoutIntervalForResource = 15
            let session = URLSession(configuration: configuration)
            self.lock.lock()
            guard self.handler != nil else {
                self.lock.unlock()
                session.invalidateAndCancel()
                return
            }
            self.session = session
            self.lock.unlock()
            session.downloadTask(with: url) { file, response, error in
                defer { self.finish() }
                guard error == nil, let file = file, let response = response as? HTTPURLResponse,
                      (200..<300).contains(response.statusCode),
                      response.url?.scheme?.lowercased() == "https",
                      let ext = Self.imageExtension(response.mimeType),
                      let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                      size > 0, size <= 5 * 1024 * 1024 else { return }
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    defer { try? FileManager.default.removeItem(at: folder) }
                    let destination = folder.appendingPathComponent("notification.\(ext)")
                    try FileManager.default.moveItem(at: file, to: destination)
                    // iOS takes ownership of the attachment file on creation.
                    let attachment = try UNNotificationAttachment(identifier: "photo", url: destination)
                    mutable.attachments = [attachment]
                    self.lock.lock()
                    if self.handler != nil { self.content = mutable }
                    self.lock.unlock()
                } catch {
                    // The text notice remains deliverable if attachment parsing fails.
                }
            }.resume()
        }
    }

    static func imageURL(_ payload: [AnyHashable: Any]) -> URL? {
        let options = payload["fcm_options"] as? [String: Any]
        guard let raw = (payload["imageUrl"] as? String) ?? (options?["image"] as? String),
              let url = URL(string: raw), url.scheme?.lowercased() == "https",
              url.host != nil, url.user == nil, url.password == nil else { return nil }
        return url
    }

    static func imageExtension(_ mime: String?) -> String? {
        switch mime?.lowercased() {
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/gif": return "gif"
        default: return nil
        }
    }

    override func serviceExtensionTimeWillExpire() { finish() }

    private func finish() {
        lock.lock()
        let callback = handler
        let result = content
        let activeSession = session
        handler = nil
        session = nil
        lock.unlock()
        activeSession?.invalidateAndCancel()
        if let callback = callback, let result = result { callback(result) }
    }
}
