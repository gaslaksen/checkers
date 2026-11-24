import Capacitor

// The app's web view, plus the plugins that live in this project rather
// than coming from npm.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
        bridge?.registerPluginInstance(PurchasesPlugin())
    }
}
