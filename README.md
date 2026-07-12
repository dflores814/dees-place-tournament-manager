# Dee's Place Tournament Manager

Production-oriented, local-first Expo/React Native foundation for running a 16-player double-elimination pool tournament on Android, iPhone, tablet, and web.

## Included now
- 16-player seeded double-elimination engine with 30 matches
- Automatic winner advancement and loser routing
- Dependency-safe undo (removes downstream invalid results)
- Player entry and skill levels
- Next-match queue, full bracket view, purse and payout calculator
- Offline save/reopen using AsyncStorage
- Tournament settings and reset safeguards
- EAS profiles for development, internal APK, and production builds
- Strict TypeScript and bracket engine tests

## Run it
1. Install Node.js LTS and Git.
2. In this folder run `npm install`.
3. Run `npx expo start`.
4. Scan the QR code with a compatible Expo development client, or press `a` for an Android emulator.

During Expo SDK 57 transition, Expo's documentation recommends a development build rather than relying on an older Expo Go client. Create one with:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

## Build an installable Android APK

```bash
eas build --profile preview --platform android
```

EAS will provide a link to the APK after the cloud build finishes.

## Quality checks

```bash
npm run typecheck
npm test
```

## Production roadmap
This package is a strong first production milestone, not the complete commercial release. Before app-store launch, add: 8/32/64 brackets, true grand-final reset handling, TV-mode synchronization, PDF/image export, encrypted director credentials, crash reporting, accessibility audit, end-to-end tests, privacy policy, store artwork, and signed release verification.

## Dee's Place branding

Version 1.0.1 includes the supplied Dee's Place neon logo as the app icon, Android adaptive icon, iOS icon, web favicon, launch splash screen, home-screen logo, and a dark translucent watermark background throughout the app.
