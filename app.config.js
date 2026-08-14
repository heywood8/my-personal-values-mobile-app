// Architecture filtering to speed up Android build time:
//  - preview:  arm64-v8a only (real devices; ~75% faster than all-ABI)
//  - emulator: arm64-v8a + x86_64 (installable on x86_64 AVDs for UI testing)
//  - x86:      x86_64 only (parallel CI build for x86_64 AVDs / Chromebooks)
//  - other:    all architectures
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const IS_EMULATOR = process.env.APP_VARIANT === 'emulator';
const IS_X86 = process.env.APP_VARIANT === 'x86';
const ANDROID_ARCHITECTURES = IS_PREVIEW
  ? ['arm64-v8a']
  : IS_EMULATOR
    ? ['arm64-v8a', 'x86_64']
    : IS_X86
      ? ['x86_64']
      : undefined; // undefined = all architectures

// GitHub Pages serves the site from a repository sub-path, so every asset URL in
// the web export has to be prefixed with it. Set by the deploy workflow; empty
// locally and in `expo start --web`, where the app is served from the root.
const WEB_BASE_URL = process.env.EXPO_WEB_BASE_URL || undefined;

// The EAS project this app builds under. `eas build` reads it from
// `extra.eas.projectId` and refuses to start without it — `eas.json` asks for a
// remote `versionCode`, and there is no project to read one from.
//
// `eas init` writes that field itself, but only into a *static* `app.json`. It
// cannot rewrite a config that is a script, so against this file it creates the
// project on EAS, prints the ID and exits with "Cannot automatically write to
// dynamic config" — the link is real, only the write half failed. Carry the ID
// over by hand: paste it as the fallback below, or leave it out of the
// repository and set the `EAS_PROJECT_ID` variable, which is what CI does.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '';

module.exports = {
  expo: {
    name: 'Values',
    slug: 'values',
    version: '0.5.1', // x-release-please-version
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true, // Required for react-native-worklets (used by reanimated 4.x)
    scheme: 'com.heywood8.values',
    // Android, iOS and web are all first-class targets — the value catalogue and
    // every chart are pure JS/SVG, so nothing in the feature set is platform-bound.
    platforms: ['android', 'ios', 'web'],
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.heywood8.values',
    },
    ios: {
      bundleIdentifier: 'com.heywood8.values',
      supportsTablet: true,
    },
    web: {
      // A single-page export: one index.html plus the bundle.
      //
      // Not 'static' — that mode pre-renders each route with expo-router, which
      // this app does not use (there is no routing at all; the tab bar is a
      // useState in app/navigation/SimpleTabs.js). Asking for static rendering
      // without expo-router installed fails the export outright.
      //
      // 'single' also suits GitHub Pages: there are no client-side routes, so
      // there is nothing that would need a rewrite rule for deep links.
      output: 'single',
      bundler: 'metro',
      favicon: './assets/favicon.png',
    },
    ...(WEB_BASE_URL && { experiments: { baseUrl: WEB_BASE_URL } }),
    ...(EAS_PROJECT_ID && { extra: { eas: { projectId: EAS_PROJECT_ID } } }),
    plugins: [
      'expo-sqlite',
      [
        'expo-build-properties',
        {
          android: {
            // Only build arm64-v8a for preview builds to speed up build time (~75% faster).
            // For production, build all architectures (default).
            ...(ANDROID_ARCHITECTURES && { buildArchs: ANDROID_ARCHITECTURES }),
          },
        },
      ],
    ],
    owner: 'lopatinikita',
  },
};
