# ⚠️ DO NOT ADD SCRIPTS TO `package.json` FOR A JS-ONLY CHANGE

`runtimeVersion` is the **`fingerprint`** policy, and `@expo/fingerprint` hashes
**package.json's `scripts` block**. Adding one dev-only line (`"test:cover": …`)
on 2026-08-15 changed the runtime version from `dcafdcb7…` to `b0a8b156…`, and
the OTA update published from it reached **no device** — the installed build
only accepts its own fingerprint.

**A mismatched runtime version does not warn. It just silently never applies.**

So: new self-checks are invoked **directly** in `.github/workflows/mobile-ci.yml`
(`node --experimental-strip-types … path/to.test.ts`), not via a new npm script.
The six existing `test:*` scripts predate build 9 and are baked into its
fingerprint — leave them exactly as they are.

Verify before publishing an update:

```bash
cd mobile && npx eas-cli@latest fingerprint:generate -p android
```

It must equal the installed build's Runtime Version (`eas build:view <id>`).
If it differs, `eas fingerprint:compare <a> <b>` names the exact cause.

---

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

⚠️ This link is **version-pinned on purpose** and it is load-bearing: it is
auto-loaded into every session that touches `mobile/`, so a stale version here
sends every future session to the wrong API surface. It said `v56.0.0` until the
SDK 57 upgrade on 2026-08-15. **Bump it in the same commit as any SDK upgrade.**
