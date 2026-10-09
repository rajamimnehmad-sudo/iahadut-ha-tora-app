import Capacitor
import Foundation
import CryptoKit
import ImageIO
import Network

@objc(OfflineDownloadPlugin)
public final class OfflineDownloadPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfflineDownloadPlugin"
    public let jsName = "OfflineDownload"
    public let pluginMethods: [CAPPluginMethod] = ["start", "status", "pause", "preference", "clear"].compactMap {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    @objc func start(_ call: CAPPluginCall) {
        OfflineImageTransfers.shared.perform(call) { manager in
            guard let urls = call.getArray("urls", String.self), urls.count <= 15000,
                  urls.allSatisfy({ URL(string: $0)?.scheme == "https" && URL(string: $0)?.user == nil }),
                  let signature = call.getString("signature"), let snapshot = call.getObject("snapshot") else {
                throw NSError(domain: "OfflineDownload", code: 1, userInfo: [NSLocalizedDescriptionKey: "Descarga inválida"])
            }
            // Repeated starts for the same content must keep the queued tasks.
            // A foreground status check can arrive before iOS schedules them.
            let sameContent = manager.job["signature"] as? String == signature
                && manager.job["urls"] as? [String] == urls
                && manager.job["wifiOnly"] as? Bool == (call.getBool("wifiOnly") ?? true)
                && (manager.job["error"] as? String ?? "").isEmpty
            let jobID = sameContent ? (manager.job["id"] as? String ?? UUID().uuidString) : UUID().uuidString
            manager.job = ["id": jobID, "urls": urls, "signature": signature,
                           "wifiOnly": call.getBool("wifiOnly") ?? true, "paused": false, "error": ""]
            try manager.write("catalog.json", snapshot)
            try manager.saveJob()
            manager.manifest["resume"] = ["enabled": true, "autoUpdate": true, "allowMobile": !(call.getBool("wifiOnly") ?? true)]
            try manager.saveManifest()
            manager.pump()
            return [:]
        }
    }
    @objc func status(_ call: CAPPluginCall) { OfflineImageTransfers.shared.status(call) }
    @objc func clear(_ call: CAPPluginCall) {
        OfflineImageTransfers.shared.perform(call) { manager in
            let previousID = manager.job["id"] as? String ?? ""
            manager.job = ["id": UUID().uuidString, "paused": true]
            try manager.saveJob()
            manager.cancelTransfers(previousID)
            if FileManager.default.fileExists(atPath: manager.folder.path) { try FileManager.default.removeItem(at: manager.folder) }
            manager.manifest = ["images": [:], "signature": ""]
            manager.job = [:]
            return [:]
        }
    }
    @objc func pause(_ call: CAPPluginCall) {
        OfflineImageTransfers.shared.perform(call) { manager in
            let previousID = manager.job["id"] as? String ?? ""
            manager.job["id"] = UUID().uuidString
            manager.job["paused"] = true
            try manager.saveJob()
            let preference = manager.manifest["resume"] as? [String: Any] ?? [:]
            manager.manifest["resume"] = ["enabled": false, "autoUpdate": false, "allowMobile": preference["allowMobile"] as? Bool ?? false]
            try manager.saveManifest()
            manager.cancelTransfers(previousID)
            return [:]
        }
    }
    @objc func preference(_ call: CAPPluginCall) {
        OfflineImageTransfers.shared.perform(call) { manager in
            manager.manifest["resume"] = ["enabled": call.getBool("enabled") ?? false,
                                          "allowMobile": call.getBool("allowMobile") ?? false,
                                          "autoUpdate": call.getBool("autoUpdate") ?? false]
            try manager.saveManifest()
            return [:]
        }
    }
}

final class OfflineImageTransfers: NSObject, URLSessionDownloadDelegate {
    static let shared = OfflineImageTransfers()
    static let identifier = "ar.vaad.catalogo.app.offline-images"
    let queue = DispatchQueue(label: "ar.vaad.catalogo.app.offline-images.state")
    let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("offline-catalog", isDirectory: true)
    var manifest: [String: Any] = ["images": [:], "signature": ""]
    var job: [String: Any] = [:]
    var completion: (() -> Void)?
    var pumping = false
    var foreground = false
    let networkMonitor = NWPathMonitor()
    var path: NWPath?
    var diagnosticsPending = false
    lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.httpMaximumConnectionsPerHost = 3
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 3600
        let operations = OperationQueue()
        operations.maxConcurrentOperationCount = 1
        operations.underlyingQueue = queue
        return URLSession(configuration: config, delegate: self, delegateQueue: operations)
    }()
    func cancelTransfers(_ id: String) {
        guard !id.isEmpty else { return }
        session.getAllTasks { tasks in
            tasks.filter { $0.taskDescription?.hasPrefix(id + "|") == true }.forEach { $0.cancel() }
        }
    }
    func setForeground(_ active: Bool) {
        queue.async {
            self.foreground = active
            // Keep the same background session and job across scene changes.
            // Tasks created while visible remain eligible to continue when iOS
            // suspends the app; recreating them in background makes them discretionary.
            self.pump()
            self.recordDiagnostics()
        }
    }
    override init() {
        super.init()
        manifest = read("manifest.json") ?? manifest
        job = read("job.json") ?? [:]
        networkMonitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            self.path = path
            if path.status == .satisfied { self.pump() }
        }
        networkMonitor.start(queue: queue)
    }
    func read(_ name: String) -> [String: Any]? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent(name)) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    func write(_ name: String, _ object: [String: Any]) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var storage = folder
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try storage.setResourceValues(values)
        try JSONSerialization.data(withJSONObject: object).write(to: folder.appendingPathComponent(name), options: .atomic)
    }
    func saveJob() throws { try write("job.json", job) }
    func saveManifest() throws { try write("manifest.json", manifest) }
    func perform(_ call: CAPPluginCall, operation: @escaping (OfflineImageTransfers) throws -> [String: Any]) {
        queue.async { do { call.resolve(try operation(self)) } catch { call.reject("No se pudo gestionar la descarga", nil, error) } }
    }
    func present(_ item: [String: Any]?) -> Bool {
        guard let path = item?["path"] as? String, path.range(of: "^offline-catalog/[a-f0-9]{64}\\.(jpg|jpeg|png|webp|gif|svg)$", options: .regularExpression) != nil,
              let size = try? folder.appendingPathComponent((path as NSString).lastPathComponent).resourceValues(forKeys: [.fileSizeKey]).fileSize else { return false }
        return size > 0
    }
    func status(_ call: CAPPluginCall) {
        queue.async {
            let urls = self.job["urls"] as? [String] ?? []
            var images = self.manifest["images"] as? [String: [String: Any]] ?? [:]
            for (url, item) in images {
                if !self.present(item) { images.removeValue(forKey: url) }
                else { images[url]?["uri"] = self.folder.appendingPathComponent((item["path"] as! NSString).lastPathComponent).absoluteString }
            }
            self.manifest["images"] = images
            let done = urls.filter { images[$0] != nil }.count
            let ready = !urls.isEmpty && done == urls.count && self.manifest["signature"] as? String == self.job["signature"] as? String
            let paused = self.job["paused"] as? Bool ?? false
            let error = self.job["error"] as? String ?? ""
            // Pending work is busy even while URLSession schedules its first
            // tasks. Otherwise the JS auto-resume loop starts a new job.
            let busy = !paused && error.isEmpty && !ready && !urls.isEmpty
            let wifiOnly = self.job["wifiOnly"] as? Bool ?? true
            let waiting = busy && self.path.map { $0.status != .satisfied || (wifiOnly && ($0.isExpensive || $0.isConstrained)) } == true
            if busy { self.pump() }
            self.recordDiagnostics()
            call.resolve(["manifest": self.manifest, "busy": busy, "paused": paused, "ready": ready,
                          "waiting": waiting,
                          "percent": urls.isEmpty ? 0 : min(ready ? 100 : 99, done * 100 / urls.count), "error": error])
        }
    }
    func recordDiagnostics() {
        guard !diagnosticsPending else { return }
        diagnosticsPending = true
        session.getAllTasks { tasks in self.queue.async {
            self.diagnosticsPending = false
            let id = self.job["id"] as? String ?? ""
            let current = tasks.filter { $0.taskDescription?.hasPrefix(id + "|") == true }
            try? self.write("diagnostics.json", [
                "at": Date().timeIntervalSince1970,
                "tasks": current.count,
                "running": current.filter { $0.state == .running }.count,
                "suspended": current.filter { $0.state == .suspended }.count,
                "receivedBytes": current.reduce(Int64(0)) { $0 + $1.countOfBytesReceived },
                "savedImages": (self.manifest["images"] as? [String: Any])?.count ?? 0,
                "networkAvailable": self.path?.status == .satisfied,
                "metered": self.path?.isExpensive ?? false,
                "constrained": self.path?.isConstrained ?? false,
                "scheduling": self.pumping,
                "foreground": self.foreground,
                "paused": self.job["paused"] as? Bool ?? false
            ])
        } }
    }
    func pump() {
        guard !pumping, !(job["paused"] as? Bool ?? false), (job["error"] as? String ?? "").isEmpty,
              let id = job["id"] as? String, let urls = job["urls"] as? [String] else { return }
        pumping = true
        session.getAllTasks { tasks in self.queue.async {
            guard self.job["id"] as? String == id else { self.pumping = false; self.pump(); return }
            guard !(self.job["paused"] as? Bool ?? false), (self.job["error"] as? String ?? "").isEmpty else { self.pumping = false; return }
            let images = self.manifest["images"] as? [String: [String: Any]] ?? [:]
            let active = tasks.filter { $0.taskDescription?.hasPrefix(id + "|") == true && $0.state != .completed && $0.state != .canceling }
            tasks.filter { $0.taskDescription?.hasPrefix(id + "|") != true }.forEach { $0.cancel() }
            let running = Set(active.compactMap { $0.taskDescription?.components(separatedBy: "|").dropFirst().joined(separator: "|") })
            let pending = urls.filter { !self.present(images[$0]) && !running.contains($0) }
            if urls.allSatisfy({ self.present(images[$0]) }) {
                self.manifest["signature"] = self.job["signature"]
                self.manifest["resume"] = ["enabled": false, "autoUpdate": true, "allowMobile": !(self.job["wifiOnly"] as? Bool ?? true)]
                do { try self.saveManifest() } catch { self.fail() }
                self.pumping = false
                return
            }
            // Hand the remaining queue to the background session now. Adding
            // three more files on each wake makes progress depend on iOS's
            // background resume rate limiter. URLSession controls concurrency.
            let scheduled = pending
            self.enqueue(scheduled, offset: 0, id: id)
        } }
    }
    func enqueue(_ pending: [String], offset: Int, id: String) {
        guard job["id"] as? String == id, !(job["paused"] as? Bool ?? false),
              (job["error"] as? String ?? "").isEmpty else { pumping = false; pump(); return }
        let end = min(offset + 8, pending.count)
        // Yield the state queue between small scheduling batches so pause and
        // status are handled promptly even for thousands of image tasks.
        if offset < end {
            for value in pending[offset..<end] {
                guard let url = URL(string: value) else { continue }
                var request = URLRequest(url: url)
                let wifiOnly = job["wifiOnly"] as? Bool ?? true
                request.allowsCellularAccess = !wifiOnly
                request.allowsExpensiveNetworkAccess = !wifiOnly
                request.allowsConstrainedNetworkAccess = !wifiOnly
                let task = session.downloadTask(with: request)
                task.taskDescription = id + "|" + value
                task.resume()
            }
        }
        if end < pending.count {
            queue.async { self.enqueue(pending, offset: end, id: id) }
        } else { pumping = false; recordDiagnostics() }
    }
    func fail() {
        let previousID = job["id"] as? String ?? ""
        job["id"] = UUID().uuidString
        job["error"] = "Descarga incompleta · Reintentar"
        try? saveJob()
        cancelTransfers(previousID)
        recordDiagnostics()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let description = downloadTask.taskDescription,
              description.hasPrefix((job["id"] as? String ?? "") + "|"), !(job["paused"] as? Bool ?? false),
              let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200 else { return }
        let value = description.components(separatedBy: "|").dropFirst().joined(separator: "|")
        do {
            let data = try Data(contentsOf: location, options: .mappedIfSafe)
            guard !data.isEmpty, data.count <= 25 * 1024 * 1024,
                  response.mimeType != "text/html", response.mimeType != "application/json" else { throw CocoaError(.fileReadCorruptFile) }
            let ext = URL(string: value)?.pathExtension.lowercased() ?? "jpg"
            if ext != "svg" {
                guard let image = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(image) > 0 else { throw CocoaError(.fileReadCorruptFile) }
            } else if !String(decoding: data, as: UTF8.self).contains("<svg") { throw CocoaError(.fileReadCorruptFile) }
            let hash = SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
            let name = hash + "." + (["jpg", "jpeg", "png", "webp", "gif", "svg"].contains(ext) ? ext : "jpg")
            try data.write(to: folder.appendingPathComponent(name), options: .atomic)
            var images = manifest["images"] as? [String: [String: Any]] ?? [:]
            images[value] = ["path": "offline-catalog/" + name]
            manifest["images"] = images
            try saveManifest()
            if images.count % 25 == 0 { recordDiagnostics() }
        } catch { fail() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard task.taskDescription?.hasPrefix((job["id"] as? String ?? "") + "|") == true, !(job["paused"] as? Bool ?? false) else { return }
        if error != nil || (task.response as? HTTPURLResponse)?.statusCode != 200 { fail() }
        else { pump() }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        if let completion { self.completion = nil; DispatchQueue.main.async { completion() } }
    }
    func reconnect(completion: @escaping () -> Void) {
        queue.async { self.completion = completion; _ = self.session; self.pump() }
    }
}
