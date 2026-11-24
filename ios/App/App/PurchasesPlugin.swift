import Capacitor
import StoreKit

// Buying things inside the app, with Apple's StoreKit. So far there's one
// thing to buy, Remove Ads, bought once and kept forever, but nothing here
// is specific to it: the game names the product it wants. The game's side
// of this is Shop in shop.js.
//
// Apple checks every purchase itself, so a product counts as owned only
// when StoreKit hands over a transaction it has verified.
@objc(PurchasesPlugin)
public class PurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PurchasesPlugin"
    public let jsName = "Purchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "owned", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private var updates: Task<Void, Never>?

    // Purchases can finish while the app isn't asking: one approved later by
    // a parent (Ask to Buy), or made on another device. Apple delivers those
    // here, and the game hears about them as "owned" events.
    override public func load() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                if transaction.revocationDate == nil {
                    self?.notifyListeners("owned", data: ["id": transaction.productID])
                }
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    // The product's price, written the way the player's App Store writes it
    // (like "$2.99" or "2,99 €"), or nothing when it can't be found.
    @objc func product(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No product named") }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    return call.resolve([:])
                }
                call.resolve(["id": product.id, "price": product.displayPrice])
            } catch {
                call.resolve([:])
            }
        }
    }

    // Shows Apple's purchase sheet. Resolves with what happened:
    // "purchased", "cancelled", or "pending" (waiting on Ask to Buy).
    @objc func buy(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No product named") }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    return call.reject("That product isn't available")
                }
                switch try await product.purchase() {
                case .success(.verified(let transaction)):
                    await transaction.finish()
                    call.resolve(["result": "purchased"])
                case .success(.unverified):
                    call.reject("The App Store couldn't confirm that purchase")
                case .pending:
                    call.resolve(["result": "pending"])
                case .userCancelled:
                    call.resolve(["result": "cancelled"])
                @unknown default:
                    call.resolve(["result": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // Everything the player owns right now, from what's already on the phone.
    @objc func owned(_ call: CAPPluginCall) {
        Task {
            call.resolve(["ids": await Self.ownedIds()])
        }
    }

    // Asks the App Store for this Apple ID's purchases, which may mean
    // signing in, then answers like owned().
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(["ids": await Self.ownedIds()])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private static func ownedIds() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                ids.append(transaction.productID)
            }
        }
        return ids
    }
}
