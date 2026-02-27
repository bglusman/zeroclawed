# ZeroClaw Android Client 🦀📱

Native Android client for ZeroClaw - run your autonomous AI assistant on Android.

## Features

- 🚀 **Native Performance** - Kotlin/Jetpack Compose, not a webview
- 🔋 **Battery Efficient** - WorkManager, Doze-aware, minimal wake locks  
- 🔐 **Security First** - Android Keystore for secrets, sandboxed execution
- 🦀 **ZeroClaw Core** - Full Rust binary via UniFFI/JNI
- 🎨 **Material You** - Dynamic theming, modern Android UX

## Requirements

- Android 8.0+ (API 26+)
- ~50MB storage
- ARM64 (arm64-v8a) or ARMv7 (armeabi-v7a)

## Building

### Prerequisites

```bash
# Install Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Install cargo-ndk
cargo install cargo-ndk

# Android SDK (via Android Studio or sdkman)
# NDK r25+ required
```

### Build APK

```bash
cd clients/android
./gradlew assembleDebug
```

### Build with Rust

```bash
# Build native library first
cargo ndk -t arm64-v8a -o app/src/main/jniLibs build --release

# Then build APK
./gradlew assembleRelease
```

## Architecture

```
┌─────────────────────────────────────┐
│  UI (Jetpack Compose)               │
├─────────────────────────────────────┤
│  Service Layer (Kotlin)             │
│  ├─ ZeroClawService                 │
│  ├─ NotificationHandler             │
│  └─ WorkManager Jobs                │
├─────────────────────────────────────┤
│  Bridge (UniFFI)                    │
├─────────────────────────────────────┤
│  Native (libzeroclaw.so)            │
└─────────────────────────────────────┘
```

## Status

🚧 **Phase 1: Foundation** (In Progress)
- [ ] Project setup
- [ ] Rust cross-compilation
- [ ] UniFFI bindings
- [ ] Basic JNI bridge
- [ ] Foreground service

## Contributing

See [RFC](/docs/rfcs/android-client.md) for design decisions.

## License

Same as ZeroClaw (MIT/Apache-2.0)
