import Foundation
import Dispatch

@main
enum PushHistoryTests {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        func record(_ key: String) throws {
            try PushHistoryStore.record(["type": "manual", "eventKey": key, "title": "Aviso", "body": "Texto"], directory: folder)
        }
        func history(_ read: Bool = false, revoked: [String] = []) throws -> [[String: Any]] {
            try PushHistoryStore.history(markRead: read, revoked: revoked, directory: folder)
        }
        try record("disabled")
        let disabled = try history()
        precondition(disabled.isEmpty, "An installation without consent must not store notices")
        try PushHistoryStore.setEnabled(true, directory: folder)
        try record("first")
        try record("first")
        let single = try history(true)
        precondition(single.count == 1 && single[0]["unread"] as? Bool == false)
        try record("first")
        let reread = try history()
        precondition(reread[0]["unread"] as? Bool == false, "A delayed duplicate cannot reset read state")
        try record("second")
        let distinct = try history()
        precondition(distinct.count == 2, "Identical text with distinct event keys must be preserved")
        _ = try history(revoked: ["first"])
        try record("first")
        let revoked = try history()
        precondition(revoked.count == 1 && revoked[0]["eventKey"] as? String == "second")
        try PushHistoryStore.clear(directory: folder)
        try record("second")
        let cleared = try history()
        precondition(cleared.isEmpty, "Cleared notices cannot return from a delayed delivery")
        let group = DispatchGroup()
        let failures = FailureCounter()
        for index in 0..<50 {
            group.enter()
            DispatchQueue.global().async {
                defer { group.leave() }
                do { try PushHistoryStore.record(["type": "manual", "eventKey": "parallel-\(index)", "title": "Aviso", "body": "Texto"], directory: folder) }
                catch { failures.increment() }
            }
        }
        group.wait()
        let concurrent = try history()
        precondition(failures.value == 0 && concurrent.count == 50, "Concurrent extension/app writes must not lose notices")
        try PushHistoryStore.setEnabled(false, directory: folder)
        try record("after-disable")
        let retained = try history()
        precondition(retained.count == 50, "Disabling preserves old history without importing new notices")
        let file = folder.appendingPathComponent("push-history.json")
        try Data("corrupt".utf8).write(to: file)
        do {
            _ = try history()
            preconditionFailure("Corrupted history must fail instead of silently replacing the file")
        } catch {
            let unchanged = try Data(contentsOf: file)
            precondition(unchanged == Data("corrupt".utf8))
        }
        print("8 native history scenarios passed, including 50 concurrent writes.")
    }
}

private final class FailureCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    func increment() { lock.lock(); defer { lock.unlock() }; count += 1 }
}
