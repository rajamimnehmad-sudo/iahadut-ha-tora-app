import Foundation
import UserNotifications

@main
struct NotificationServiceChecks {
    static func main() {
        precondition(NotificationService.imageURL(["imageUrl":"https://example.com/photo.jpg"]) != nil)
        precondition(NotificationService.imageURL(["fcm_options":["image":"https://example.com/photo.png"]]) != nil)
        for raw in ["http://example.com/image.jpg", "file:///tmp/image.jpg", "https://user:pass@example.com/image.jpg", "javascript:alert(1)"] {
            precondition(NotificationService.imageURL(["imageUrl":raw]) == nil)
        }
        precondition(NotificationService.imageExtension("image/jpeg") == "jpg")
        precondition(NotificationService.imageExtension("image/png") == "png")
        precondition(NotificationService.imageExtension("text/html") == nil)
        precondition(NotificationService.imageExtension("image/svg+xml") == nil)
        let content = UNMutableNotificationContent()
        content.title = "Aviso sin foto"
        content.body = "El texto debe conservarse"
        let request = UNNotificationRequest(identifier: "test", content: content, trigger: nil)
        let service = NotificationService()
        let semaphore = DispatchSemaphore(value: 0)
        let lock = NSLock()
        var calls = 0
        service.didReceive(request) { received in
            precondition(received.title == content.title && received.body == content.body)
            precondition(received.attachments.isEmpty)
            lock.lock(); calls += 1; lock.unlock()
            semaphore.signal()
        }
        precondition(semaphore.wait(timeout: .now() + 3) == .success)
        service.serviceExtensionTimeWillExpire()
        lock.lock(); precondition(calls == 1); lock.unlock()
        print("Notification service: URL/MIME validation, text fallback and single completion passed")
    }
}
