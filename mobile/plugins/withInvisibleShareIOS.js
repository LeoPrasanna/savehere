const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * iOS PHASE B — the invisible share, matching Android.
 *
 * Android already saves without opening the app (plugins/withInvisibleShare.js
 * + ShareSave.kt). iOS did not: expo-share-intent's extension foregrounds the
 * whole app through `application.open(url)` and leaves Instagram's share sheet
 * presented behind it — the owner's "Findable opens but never closes and the
 * social media app is stuck", 2026-09-09. iOS has NO public API to exit an app,
 * so nothing in JS could fix it; the app must simply never be opened.
 *
 * ⚠️ THIS PATCHES EXACTLY ONE FUNCTION and asserts on it. expo-share-intent
 * writes ShareExtensionViewController.swift during prebuild; we replace the body
 * of `redirectToHostApp` and leave its ~600 lines of content-type handling
 * alone. If a version bump changes that function, prebuild THROWS — a two-minute
 * failure with a named cause, instead of a thirty-minute Swift compile error or,
 * far worse, a silent revert to the visible behaviour.
 *
 * ⚠️ IT FALLS BACK, IT DOES NOT FAIL. No share key stored (signed out, offline
 * at mint time, an older app version) means `findableSaveDirectly` returns false
 * and the original open-the-app path runs. The share always happens; only its
 * polish is conditional.
 *
 * ⚠️ THE UPLOAD IS A BACKGROUND SESSION, AND THAT IS NOT OPTIONAL.
 * `completeRequest` tears the extension process down. A plain URLSession.shared
 * task started just before it is killed mid-flight and the save silently never
 * happens — the single most likely way to get this subtly wrong. A background
 * session with `sharedContainerIdentifier` set is handed to the system and
 * survives the process; it is precisely what Apple built it for.
 */

const ANCHOR = `  private func redirectToHostApp(type: RedirectType) {
    let nonce = UUID().uuidString
    let url = URL(string: "\\(shareProtocol)://dataUrl=\\(sharedKey)?nonce=\\(nonce)#\\(type)")!
    var responder = self as UIResponder?

    while responder != nil {
      if let application = responder as? UIApplication {
        if application.canOpenURL(url) {
          application.open(url)
        } else {
          NSLog("redirectToHostApp canOpenURL KO: \\(shareProtocol)")
          self.dismissWithError(
            message: "Application not found, invalid url scheme \\(shareProtocol)")
          return
        }
      }
      responder = responder!.next
    }
    extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
  }`;

const REPLACEMENT = `  // ── FINDABLE: invisible share (mobile/plugins/withInvisibleShareIOS.js) ──
  // Save from inside the extension and return the user to the app they came
  // from. Opening Findable is now the FALLBACK, not the behaviour.
  private func redirectToHostApp(type: RedirectType) {
    if findableSaveDirectly(type: type) { return }
    findableOpenHostApp(type: type)
  }

  /// The link the user actually shared. Some apps hand over a bare URL, others
  /// a sentence with a URL inside it ("Look at this <url>"), which is why the
  /// text case is scanned rather than trusted.
  private func findableSharedLink(type: RedirectType) -> String? {
    var raw: String? = nil
    if type == .weburl {
      raw = sharedWebUrl.first?.url
    } else if type == .text {
      raw = sharedText.first
    }
    guard let candidate = raw, !candidate.isEmpty else { return nil }
    if candidate.hasPrefix("http://") || candidate.hasPrefix("https://") {
      return candidate
    }
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    let range = NSRange(candidate.startIndex..<candidate.endIndex, in: candidate)
    if let match = detector?.firstMatch(in: candidate, options: [], range: range),
      let matched = match.url
    {
      return matched.absoluteString
    }
    return nil
  }

  /// Returns true when the save was handed to the system. False means "could
  /// not", and the caller falls back to opening the app.
  private func findableSaveDirectly(type: RedirectType) -> Bool {
    guard let link = findableSharedLink(type: type),
      let defaults = UserDefaults(suiteName: hostAppGroupIdentifier),
      let raw = defaults.string(forKey: "findableShareConfig"),
      let data = raw.data(using: .utf8),
      let config = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let apiUrl = config["apiUrl"] as? String,
      let shareKey = config["key"] as? String,
      !apiUrl.isEmpty, !shareKey.isEmpty
    else { return false }

    var base = apiUrl
    while base.hasSuffix("/") { base.removeLast() }
    guard let endpoint = URL(string: base + "/api/reels/share-save") else { return false }
    guard let body = try? JSONSerialization.data(withJSONObject: ["url": link]) else {
      return false
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(shareKey, forHTTPHeaderField: "X-Share-Key")

    // A background session outlives this process. completeRequest below kills
    // the extension, and a foreground task would die with it.
    let sessionId = "app.findable.share." + UUID().uuidString
    let sessionConfig = URLSessionConfiguration.background(withIdentifier: sessionId)
    sessionConfig.sharedContainerIdentifier = hostAppGroupIdentifier
    sessionConfig.isDiscretionary = false
    let session = URLSession(configuration: sessionConfig, delegate: nil, delegateQueue: nil)

    // Background uploads must come from a FILE — httpBody is ignored outright.
    // The temp file lives long enough for the system to take its own copy.
    let tmp = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".json")
    do {
      try body.write(to: tmp)
    } catch {
      NSLog("[FINDABLE] could not stage share body: \\(error)")
      return false
    }

    session.uploadTask(with: request, fromFile: tmp).resume()

    // Clear the stashed payload the app would otherwise pick up and save a
    // SECOND time on its next launch.
    defaults.removeObject(forKey: sharedKey)
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    return true
  }

  /// expo-share-intent's original behaviour, kept verbatim as the fallback.
  private func findableOpenHostApp(type: RedirectType) {
    let nonce = UUID().uuidString
    let url = URL(string: "\\(shareProtocol)://dataUrl=\\(sharedKey)?nonce=\\(nonce)#\\(type)")!
    var responder = self as UIResponder?

    while responder != nil {
      if let application = responder as? UIApplication {
        if application.canOpenURL(url) {
          application.open(url)
        } else {
          NSLog("redirectToHostApp canOpenURL KO: \\(shareProtocol)")
          self.dismissWithError(
            message: "Application not found, invalid url scheme \\(shareProtocol)")
          return
        }
      }
      responder = responder!.next
    }
    extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
  }`;

module.exports = function withInvisibleShareIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async cfg => {
      const root = cfg.modRequest.platformProjectRoot;
      const candidates = fs
        .readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(root, d.name, 'ShareExtensionViewController.swift'))
        .filter(p => fs.existsSync(p));

      if (candidates.length !== 1) {
        throw new Error(
          '[withInvisibleShareIOS] expected exactly one ShareExtensionViewController.swift under ' +
            root +
            ', found ' +
            candidates.length +
            ". expo-share-intent's layout changed — re-check plugins/withInvisibleShareIOS.js.",
        );
      }

      const file = candidates[0];
      const source = fs.readFileSync(file, 'utf8');

      // Idempotent: prebuild can run more than once against the same tree.
      if (source.includes('findableSaveDirectly')) return cfg;

      if (!source.includes(ANCHOR)) {
        throw new Error(
          '[withInvisibleShareIOS] could not find redirectToHostApp verbatim in ' +
            file +
            '. expo-share-intent changed it, so the invisible share would silently revert to ' +
            'opening the app. Update ANCHOR in plugins/withInvisibleShareIOS.js.',
        );
      }

      fs.writeFileSync(file, source.replace(ANCHOR, REPLACEMENT), 'utf8');
      return cfg;
    },
  ]);
};
