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

// The published site sits at the root of a custom domain (values.heywood8.com),
// so this is unset by the deploy workflow and every asset URL is root-relative.
// A fork without a custom domain — served from /<repo>/ on github.io instead —
// sets this to that sub-path.
const WEB_BASE_URL = process.env.EXPO_WEB_BASE_URL || undefined;

// Where a "share with a friend" link points when the app that makes it is not
// itself running on the web — a phone has no URL of its own to hand out, and a
// link only that phone's owner can open is not a shared link. Defaults to the
// published site (see app/services/ResultsShare.js); a fork points its own
// builds at its own deployment by setting this.
const SHARE_URL = process.env.EXPO_SHARE_URL || '';

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
    version: '1.1.1', // x-release-please-version
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
      // Both of these become `<meta>` tags in the exported index.html —
      // `createTemplateHtmlFromExpoConfigAsync` reads them off `expo.web`, which
      // is why neither needs a forked HTML template. The description is the one
      // Lighthouse asks for and the one a link preview shows: the site renders
      // client-side into an empty `#root`, so without it a crawler has nothing
      // at all to quote, and the "share with a friend" links this app exists to
      // hand out are exactly the ones being previewed.
      //
      // English only, unavoidably — there is one static document and the
      // language is not known until the app has started. The runtime keeps
      // `<html lang>` honest instead (see applyDocumentLanguage).
      description:
        'Rate a deck of 47 personal values, see how they rank against each other, '
        + 'and track how far your behaviour matches them. Everything stays on '
        + 'your device.',
      themeColor: '#ffffff',
    },
    ...(WEB_BASE_URL && { experiments: { baseUrl: WEB_BASE_URL } }),
    extra: {
      ...(SHARE_URL && { shareUrl: SHARE_URL }),
      ...(EAS_PROJECT_ID && { eas: { projectId: EAS_PROJECT_ID } }),
    },
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
