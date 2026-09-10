import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class ShareConfigNative extends NativeModule {
  set(json: string): boolean;
  clear(): boolean;
}

/**
 * iOS only, and OPTIONAL on purpose.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: this ships
 * in a native build, and the app also runs on Android, on web, and — during
 * development — in bundles that predate this module. A missing native module
 * must degrade to "no invisible share", never to a crash on launch.
 */
const native = requireOptionalNativeModule<ShareConfigNative>('ShareConfig');

/** Hand the share key to the Share Extension. Returns false if it could not. */
export function setShareConfig(json: string): boolean {
  try {
    return native?.set(json) ?? false;
  } catch {
    return false;
  }
}

/** Revoke it locally on sign-out. */
export function clearShareConfig(): boolean {
  try {
    return native?.clear() ?? false;
  } catch {
    return false;
  }
}
