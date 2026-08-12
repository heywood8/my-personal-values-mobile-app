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

module.exports = {
  expo: {
    name: 'Values',
    slug: 'values',
    version: '0.1.0', // x-release-please-version
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
