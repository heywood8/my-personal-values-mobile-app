module.exports = function (api) {
  // Jest runs the app through Babel with the module transform on, and leaves a
  // dynamic `import()` as one — which Node's test VM refuses without
  // --experimental-vm-modules. The app has two of them on purpose (the Android
  // installer, and the platform halves of the Google sign-in), so without this
  // the lazily loaded half of a module is the half no test can reach.
  //
  // Test-only: Metro handles `import()` itself, and splitting those modules into
  // their own chunks is the whole point of writing them that way.
  const isTest = api.env('test');
  api.cache.using(() => process.env.NODE_ENV);

  return {
    presets: ['babel-preset-expo'],
    ...(isTest && { plugins: ['@babel/plugin-transform-dynamic-import'] }),
  };
};
