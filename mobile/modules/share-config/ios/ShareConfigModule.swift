import ExpoModulesCore

/**
 The ONE thing the iOS Share Extension cannot get for itself.

 An extension is a separate process with its own container, so it cannot read
 the app's AsyncStorage — which is where Android's invisible share reads the
 same credential from (see mobile/services/shareKey.ts). The App Group is the
 only shared surface the two processes have, and nothing in the project could
 write to it: expo-share-intent's module reads and clears that suite but exposes
 no writer.

 That is all this module is. One function, one key, no state.

 ⚠️ The value is a save-scoped share key, NOT a Supabase session. It can create
 a saved link and nothing else — no read, no delete, no AI action, no account
 access (backend/app/sharekey.py proves that by routing table). Do not be
 tempted to put the access token here instead: the reasoning against it is in
 shareKey.ts and it has not changed.
 */
public class ShareConfigModule: Module {
  /// Must match `hostAppGroupIdentifier` in the generated ShareExtensionViewController
  /// and the app-group entitlement in app.json. expo-share-intent derives it as
  /// "group.<bundleIdentifier>".
  private static let appGroup = "group.com.savehere.app"

  /// Read back by the extension. Deliberately not the key expo-share-intent
  /// uses for the shared payload ("savehereShareKey") — different data, and a
  /// collision would silently break the share itself.
  private static let configKey = "findableShareConfig"

  public func definition() -> ModuleDefinition {
    Name("ShareConfig")

    // Synchronous on purpose: it is a single small UserDefaults write, and
    // making it async would only add a promise for the caller to forget.
    Function("set") { (json: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: ShareConfigModule.appGroup) else {
        return false
      }
      defaults.set(json, forKey: ShareConfigModule.configKey)
      return true
    }

    Function("clear") { () -> Bool in
      guard let defaults = UserDefaults(suiteName: ShareConfigModule.appGroup) else {
        return false
      }
      defaults.removeObject(forKey: ShareConfigModule.configKey)
      return true
    }
  }
}
