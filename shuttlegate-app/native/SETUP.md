# Secure Storage Native Module Setup

The mobile app stores the JWT in the iOS Keychain / Android Keystore via a Lynx native module. The JavaScript side is in `src/lib/secureStorage.ts`; it expects `NativeModules.SecureStorageModule` to be registered by the host app.

## iOS

1. Copy `native/ios/SecureStorageModule.h` and `SecureStorageModule.m` into your iOS host app project.
2. Register the module in your `LynxInitProcessor.m` (or equivalent) before starting the Lynx runtime:

```objc
#import "SecureStorageModule.h"

[LynxEnv sharedInstance].registerModuleClass:[SecureStorageModule class]];
```

3. Link `Security.framework` in your Xcode target.

## Android

1. Copy `native/android/SecureStorageModule.java` into your Android host app under the package `com.shuttlegate.nativemodules`.
2. Add the AndroidX security dependency to your host app's `build.gradle`:

```groovy
dependencies {
    implementation "androidx.security:security-crypto:1.1.0-alpha06"
}
```

3. Register the module in your Lynx runtime initialization:

```kotlin
LynxEnv.inst().registerModule(SecureStorageModule::class.java)
```

## Development fallback

If the module is not registered (e.g., in Lynx Explorer), `secureStorage.ts` falls back to an in-memory map and logs a warning. This is insecure and must not be used in production builds.
