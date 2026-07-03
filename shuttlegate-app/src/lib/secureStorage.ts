// Secure token storage abstraction.
//
// In a real Lynx host app this delegates to a native module that stores values
// in the iOS Keychain / Android Keystore. The fallback below keeps the app
// runnable in Lynx Explorer or during development if the native module is not
// registered.

interface SecureStorageModule {
  setSecureItem(key: string, value: string): void
  getSecureItem(key: string, callback: (value: string | null) => void): void
  deleteSecureItem(key: string): void
}

interface NativeModulesShape {
  SecureStorageModule?: SecureStorageModule
}

function getModule(): SecureStorageModule | undefined {
  const native = (globalThis as unknown as { NativeModules?: NativeModulesShape }).NativeModules
  return native?.SecureStorageModule
}

const memoryFallback = new Map<string, string>()
let warned = false

function warnOnce(): void {
  if (warned) return
  warned = true
  console.warn(
    '[SecureStorage] Native SecureStorageModule is not registered. Using insecure in-memory fallback. ' +
      'Register the native iOS/Android module before shipping to production.',
  )
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  const mod = getModule()
  if (mod) {
    mod.setSecureItem(key, value)
    return
  }
  warnOnce()
  memoryFallback.set(key, value)
}

export async function getSecureItem(key: string): Promise<string | null> {
  const mod = getModule()
  if (mod) {
    return new Promise((resolve) => {
      mod.getSecureItem(key, (value) => resolve(value))
    })
  }
  warnOnce()
  return memoryFallback.get(key) ?? null
}

export async function deleteSecureItem(key: string): Promise<void> {
  const mod = getModule()
  if (mod) {
    mod.deleteSecureItem(key)
    return
  }
  warnOnce()
  memoryFallback.delete(key)
}
