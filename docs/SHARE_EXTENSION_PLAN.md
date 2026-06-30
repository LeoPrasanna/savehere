# SaveHere — iOS Share Extension Implementation Plan

## Overview

The iOS Share Extension is the **#1 launch blocker**. It allows users to share URLs directly from Instagram, YouTube, TikTok, LinkedIn, and Safari into SaveHere without switching apps. This is the core viral loop.

## Architecture

```
iOS Share Extension (Native Swift / React Native)
  ├── ShareViewController (UI, accepts NSExtensionItem)
  ├── Extract URL from share payload
  ├── Call SaveHere API (POST /api/reels/save)
  ├── Show success / failure toast
  └── Optional: Open main app via deep link (savehere://reel/{id})
```

## Expo Approach (Recommended)

Since the app uses Expo SDK 56, the cleanest path is:

### Option A: `expo-share-intent` (easiest, web-first)

Use the community plugin `expo-share-intent` which handles both iOS Share Extension and Android Share Intent in a single unified API.

```bash
npx expo install expo-share-intent
```

**Pros:**
- Works with Expo Go in development
- Single JS API for both iOS and Android
- Minimal native code changes
- Handles URL extraction from share sheets automatically

**Cons:**
- Requires development client (not Expo Go in production)
- Limited customization of the native share UI

**Implementation:**
1. Install plugin and add to `app.json` plugins
2. In `app/_layout.tsx`, listen for incoming share intents:
   ```tsx
   import { useShareIntent } from 'expo-share-intent';
   
   function App() {
     const { shareIntent, resetShareIntent } = useShareIntent();
     
     useEffect(() => {
       if (shareIntent?.text) {
         // Navigate to save screen with pre-filled URL
         router.push({ pathname: '/save', params: { url: shareIntent.text } });
         resetShareIntent();
       }
     }, [shareIntent]);
   }
   ```
3. Update `app/save.tsx` to accept a pre-filled URL from route params

### Option B: Custom iOS Share Extension (full control)

For maximum control over the native share UI (e.g., showing a custom summary preview):

**Requirements:**
- EAS Build with custom native module
- Xcode for the share extension target
- Eject to bare workflow or use `expo-config-plugins` to inject the extension

**Implementation steps:**
1. **Create the Share Extension target** in Xcode:
   - File → New → Target → Share Extension
   - Name it `SaveHereShareExtension`
   - This creates a `ShareViewController.swift` (or Objective-C)

2. **Implement URL extraction** in `ShareViewController`:
   ```swift
   override func didSelectPost() {
       if let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let attachments = item.attachments {
           for attachment in attachments {
               if attachment.hasItemConformingToTypeIdentifier("public.url") {
                   attachment.loadItem(forTypeIdentifier: "public.url") { (url, error) in
                       if let url = url as? URL {
                           self.saveURL(url.absoluteString)
                       }
                   }
               }
           }
       }
       extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
   }
   ```

3. **Save the URL** by calling the backend API:
   - Use `URLSession` to POST to `https://api.savehere.app/api/reels/save`
   - Include the Supabase JWT Bearer token from the shared Keychain or App Groups

4. **Share data between app and extension** using App Groups:
   - Enable App Groups in both the main app and share extension targets
   - Use a shared UserDefaults suite or Keychain for the auth token
   - Configure `app.json` with the App Group ID

5. **Return to the host app** after saving:
   - Use `openURL` to deep-link back to `savehere://reel/{id}`
   - This requires the main app to handle the deep link and show the saved reel

6. **Configure `Info.plist`** for the share extension:
   ```xml
   <key>NSExtension</key>
   <dict>
     <key>NSExtensionAttributes</key>
     <dict>
       <key>NSExtensionActivationRule</key>
       <dict>
         <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
         <integer>1</integer>
       </dict>
     </dict>
     <key>NSExtensionMainStoryboard</key>
     <string>MainInterface</string>
     <key>NSExtensionPointIdentifier</key>
     <string>com.apple.share-services</string>
   </dict>
   ```

## Deep Linking

When the share extension saves a reel, it should open the main app to the detail screen:

1. **Register scheme** in `app.json` (already done: `scheme: "savehere"`)
2. **Handle deep link** in `app/_layout.tsx` or a dedicated listener:
   ```tsx
   import * as Linking from 'expo-linking';
   
   useEffect(() => {
     const sub = Linking.addEventListener('url', ({ url }) => {
       if (url.startsWith('savehere://reel/')) {
         const id = url.replace('savehere://reel/', '');
         router.push(`/reel/${id}`);
       }
     });
     return () => sub.remove();
   }, []);
   ```

## Recommended Path

**Phase 1 (MVP — Launch):** Use `expo-share-intent` (Option A). It gets the core feature working quickly with minimal native complexity. The share extension will be a simple "Save to SaveHere" action that opens the app.

**Phase 2 (Post-launch):** If you need a richer native share UI (showing a preview, letting the user add notes before saving), invest in Option B with a custom Xcode share extension.

## EAS Build Configuration

Update `eas.json` for the share extension:

```json
{
  "build": {
    "production": {
      "autoIncrement": true,
      "ios": {
        "buildConfiguration": "Release",
        "resourceClass": "m-medium"
      }
    }
  }
}
```

The share extension will be bundled automatically when using `expo-share-intent` or manually added via Xcode + EAS Build.

## Testing

1. **Development:** Use `expo-share-intent` + Expo Dev Client (not Expo Go)
2. **iOS Simulator:** Share extensions don't work in Simulator; test on a real device
3. **TestFlight:** The share extension must be tested in a TestFlight build to verify the full flow
4. **Acceptance criteria:**
   - User can share a URL from Instagram → SaveHere appears in the share sheet
   - Tap SaveHere → URL is saved, summary is generated
   - User is returned to the source app (or optionally deep-linked to SaveHere)

## Apple Review Considerations

- Share extensions are reviewed as part of the main app
- The extension must be functional and not crash
- The extension UI should be minimal and fast (< 2 seconds to save)
- If using deep links, test them thoroughly — broken deep links are a common rejection reason
