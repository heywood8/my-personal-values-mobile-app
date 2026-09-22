/**
 * The Android manifest facts this app's features depend on.
 *
 * app.config.js is the only place these are written down and nothing else in the
 * suite reads it, so a line removed from it is a feature that stops working in a
 * release build with every test still green.
 */

const config = require('../app.config.js');

const { expo } = config;

describe('the Android manifest', () => {
  it('declares REQUEST_INSTALL_PACKAGES, or the app cannot install its own updates', () => {
    // The updater downloads an APK and hands it to the Android package
    // installer (app/services/ApkInstaller.js). Since Android 8 that installer
    // refuses a file from an app which has not declared this — and it refuses it
    // in silence, aborting inside onCreate and finishing with RESULT_CANCELED
    // before it draws anything. Without this line the install button does
    // nothing at all and reports no error, which is exactly what shipped.
    expect(expo.android.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  });

  it('keeps the package name the Google Android OAuth client is bound to', () => {
    expect(expo.android.package).toBe('com.heywood8.values');
  });
});

describe('the app version', () => {
  it('is the three numbers the updater compares releases against', () => {
    // release-please rewrites this line (`x-release-please-version`), and
    // AppUpdateService reads it back off Constants.expoConfig to decide whether
    // a release is newer. Anything it cannot parse reads as 0.0.0.
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
