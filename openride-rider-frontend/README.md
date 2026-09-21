# OpenRide — Rider frontend

Independent Flutter rider application with its own entry point, platform projects, dependencies and web output. The app imports `openride_protocol` from `../openride-protocol/dart` and styled components from `../openride-design-system`. It does not import another frontend.

```sh
flutter pub get
flutter analyze
flutter test
flutter run -d macos
```

For the shared local demo, run `pnpm build:frontends` and `pnpm dev` from the repository root. Open http://127.0.0.1:4100/rider/.

Pass `--dart-define=OPENRIDE_URL=https://YOUR_API` for a remote API, or use Connection settings. The default rider token is `openride-demo-rider`. Native compilation requires Xcode or the Android SDK. See the [root setup](../README.md) and [four-app walkthrough](../docs/interoperability.md).
