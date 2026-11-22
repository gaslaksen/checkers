import Capacitor
import GameKit
import UIKit

// Signs the player in to Game Center and tells the game their name and
// picture, for the versus screen. Game Center shows its own sign-in sheet
// when it needs one; someone who isn't signed in just plays without a name.
// The game's side of this is GameCenter in platform.js.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    // Only touched on the main thread.
    private var waiting: [CAPPluginCall] = [] // calls waiting to hear how sign-in went
    private var started = false
    private var answered = false // Game Center has said, one way or the other

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated {
                self.describe(player) { call.resolve($0) }
                return
            }
            if self.answered {
                call.resolve(["signedIn": false])
                return
            }
            self.waiting.append(call)
            guard !self.started else { return }
            self.started = true
            // Game Center calls this whenever it has news: a sheet to show,
            // or whether the player is signed in now.
            player.authenticateHandler = { [weak self] sheet, _ in
                guard let self = self else { return }
                if let sheet = sheet {
                    self.bridge?.viewController?.present(sheet, animated: true)
                } else {
                    self.finish(player)
                }
            }
        }
    }

    private func finish(_ player: GKLocalPlayer) {
        answered = true
        let calls = waiting
        waiting.removeAll()
        guard !calls.isEmpty else { return }
        if player.isAuthenticated {
            describe(player) { info in calls.forEach { $0.resolve(info) } }
        } else {
            calls.forEach { $0.resolve(["signedIn": false]) }
        }
    }

    // Their name, and their picture made small enough to send to a friend.
    private func describe(_ player: GKLocalPlayer, then done: @escaping ([String: Any]) -> Void) {
        player.loadPhoto(for: .small) { image, _ in
            var info: [String: Any] = ["signedIn": true, "name": player.displayName]
            if let image = image, let photo = Self.thumbnail(image) {
                info["photo"] = "data:image/jpeg;base64," + photo.base64EncodedString()
            }
            done(info)
        }
    }

    private static func thumbnail(_ image: UIImage) -> Data? {
        let size = CGSize(width: 96, height: 96)
        let small = UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return small.jpegData(compressionQuality: 0.8)
    }
}
