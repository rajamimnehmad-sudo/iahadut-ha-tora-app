import Foundation
import Darwin

// Shared by the app and its notification service extension. The file lock
// prevents concurrent deliveries or an inbox clear from losing another write.
enum PushHistoryStore {
    static let group = "group.ar.vaad.catalogo.app"

    static func update<T>(directory: URL? = nil, _ operation: (inout [String: Any]) throws -> T) throws -> T {
        guard let folder = directory ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "PushHistory", code: 1, userInfo: [NSLocalizedDescriptionKey: "Falta configurar el App Group de notificaciones."])
        }
        let lockPath = folder.appendingPathComponent("push-history.lock").path
        let descriptor = open(lockPath, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { flock(descriptor, LOCK_UN) }
        let file = folder.appendingPathComponent("push-history.json")
        var state: [String: Any] = ["enabled": false, "notifications": [], "revoked": [], "cleared": []]
        if FileManager.default.fileExists(atPath: file.path) {
            guard let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any] else {
                throw NSError(domain: "PushHistory", code: 2, userInfo: [NSLocalizedDescriptionKey: "El historial de notificaciones no es válido."])
            }
            state = saved
        }
        let result = try operation(&state)
        try JSONSerialization.data(withJSONObject: state).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return result
    }

    static func record(_ payload: [AnyHashable: Any], title: String = "", body: String = "", identifier: String = "", directory: URL? = nil) throws {
        let data = Dictionary(uniqueKeysWithValues: payload.compactMap { key, value -> (String, String)? in
            guard let key = key as? String, let value = value as? String else { return nil }
            return (key, value)
        })
        guard data["type"] == "manual" || data["eventKey"] != nil else { return }
        let key = data["eventKey"] ?? data["gcm.message_id"] ?? identifier
        guard !key.isEmpty else { return }
        try update(directory: directory) { state in
            guard state["enabled"] as? Bool == true else { return }
            let excluded = Set((state["revoked"] as? [String] ?? []) + (state["cleared"] as? [String] ?? []))
            guard !excluded.contains(key) else { return }
            var messages = state["notifications"] as? [[String: Any]] ?? []
            guard !messages.contains(where: { ($0["eventKey"] as? String ?? $0["id"] as? String) == key }) else { return }
            let timestamp = data["sentAt"] ?? ISO8601DateFormatter().string(from: Date())
            messages.insert(["id": data["gcm.message_id"] ?? identifier,
                             "eventKey": key, "title": title.isEmpty ? data["title"] ?? "Aviso de Iahadut HaTora" : title,
                             "body": body.isEmpty ? data["body"] ?? "" : body,
                             "data": data, "receivedAt": timestamp, "unread": true], at: 0)
            state["notifications"] = messages
        }
    }

    static func history(markRead: Bool, revoked: [String], directory: URL? = nil) throws -> [[String: Any]] {
        try update(directory: directory) { state in
            let revoked = Set((state["revoked"] as? [String] ?? []) + revoked)
            state["revoked"] = Array(revoked)
            var messages = (state["notifications"] as? [[String: Any]] ?? []).filter {
                !revoked.contains($0["eventKey"] as? String ?? $0["id"] as? String ?? "")
            }
            if markRead { messages = messages.map { message in var result = message; result["unread"] = false; return result } }
            state["notifications"] = messages
            return messages
        }
    }

    static func setEnabled(_ enabled: Bool, directory: URL? = nil) throws {
        try update(directory: directory) { $0["enabled"] = enabled }
    }

    static func clear(directory: URL? = nil) throws {
        try update(directory: directory) { state in
            let messages = state["notifications"] as? [[String: Any]] ?? []
            state["cleared"] = Array(Set((state["cleared"] as? [String] ?? []) + messages.compactMap { $0["eventKey"] as? String ?? $0["id"] as? String }))
            state["notifications"] = []
        }
    }
}
