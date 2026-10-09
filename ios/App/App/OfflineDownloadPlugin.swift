import Capacitor
import Foundation
import CryptoKit
import ImageIO

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
            manager.job = ["id": UUID().uuidString, "urls": urls, "signature": signature,
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
            manager.session.getAllTasks { tasks in
                tasks.filter { !previousID.isEmpty && $0.taskDescription?.hasPrefix(previousID + "|") == true }.forEach { $0.cancel() }
            }
            if FileManager.default.fileExists(atPath: manager.folder.path) { try FileManager.default.removeItem(at: manager.folder) }
            manager.manifest = ["images": [:], "signature": ""]
            manager.job = [:]
            return [:]
        }
    }
    @objc func pause(_ call: CAPPluginCall) {
        OfflineImageTransfers.shared.perform(call) { manager in
            manager.job["paused"] = true
            try manager.saveJob()
            let preference = manager.manifest["resume"] as? [String: Any] ?? [:]
            manager.manifest["resume"] = ["enabled": false, "autoUpdate": false, "allowMobile": preference["allowMobile"] as? Bool ?? false]
            try manager.saveManifest()
            manager.session.getAllTasks { tasks in tasks.forEach { $0.cancel() } }
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
    override init() {
        super.init()
        manifest = read("manifest.json") ?? manifest
        job = read("job.json") ?? [:]
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
        session.getAllTasks { tasks in self.queue.async {
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
            let busy = !paused && error.isEmpty && !ready && !urls.isEmpty && tasks.contains { $0.taskDescription?.hasPrefix((self.job["id"] as? String ?? "") + "|") == true && $0.state != .completed && $0.state != .canceling }
            call.resolve(["manifest": self.manifest, "busy": busy, "paused": paused, "ready": ready,
                          "percent": urls.isEmpty ? 0 : min(ready ? 100 : 99, done * 100 / urls.count), "error": error])
        } }
    }
    func pump() {
        guard !pumping, !(job["paused"] as? Bool ?? false), (job["error"] as? String ?? "").isEmpty,
              let id = job["id"] as? String, let urls = job["urls"] as? [String] else { return }
        pumping = true
        session.getAllTasks { tasks in self.queue.async {
            self.pumping = false
            guard self.job["id"] as? String == id else { self.pump(); return }
            guard !(self.job["paused"] as? Bool ?? false), (self.job["error"] as? String ?? "").isEmpty else { return }
            let images = self.manifest["images"] as? [String: [String: Any]] ?? [:]
            let active = tasks.filter { $0.taskDescription?.hasPrefix(id + "|") == true && $0.state != .completed && $0.state != .canceling }
            tasks.filter { $0.taskDescription?.hasPrefix(id + "|") != true }.forEach { $0.cancel() }
            let running = Set(active.compactMap { $0.taskDescription?.components(separatedBy: "|").dropFirst().joined(separator: "|") })
            let pending = urls.filter { !self.present(images[$0]) && !running.contains($0) }
            if urls.allSatisfy({ self.present(images[$0]) }) {
                self.manifest["signature"] = self.job["signature"]
                self.manifest["resume"] = ["enabled": false, "autoUpdate": true, "allowMobile": !(self.job["wifiOnly"] as? Bool ?? true)]
                do { try self.saveManifest() } catch { self.fail() }
                return
            }
            for value in pending.prefix(max(0, 3 - active.count)) {
                guard let url = URL(string: value) else { continue }
                var request = URLRequest(url: url)
                let wifiOnly = self.job["wifiOnly"] as? Bool ?? true
                request.allowsCellularAccess = !wifiOnly
                request.allowsExpensiveNetworkAccess = !wifiOnly
                request.allowsConstrainedNetworkAccess = !wifiOnly
                let task = self.session.downloadTask(with: request)
                task.taskDescription = id + "|" + value
                task.resume()
            }
        } }
    }
    func fail() {
        job["error"] = "Descarga incompleta · Reintentar"
        try? saveJob()
        session.getAllTasks { $0.forEach { $0.cancel() } }
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
