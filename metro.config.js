const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WASM build for the web target (wa-sqlite over OPFS). Metro
// has to treat .wasm as a binary asset rather than as a source file, or the web
// bundle fails to resolve the database at startup.
config.resolver.assetExts = config.resolver.assetExts || [];
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
config.resolver.sourceExts = (config.resolver.sourceExts || []).filter(
  ext => ext !== 'wasm',
);

// Node built-ins that leak in through transitive dependencies (drizzle-kit's
// runtime helpers, mostly). React Native has none of them; resolving to an empty
// module keeps the bundle from failing rather than shipping a broken shim.
const path = require('path');
const emptyModulePath = path.resolve(__dirname, 'polyfills/empty.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nodeBuiltins = [
    'node:crypto',
    'node:fs',
    'node:path',
    'node:stream',
    'node:util',
    'crypto',
    'fs',
    'path',
    'stream',
    'util',
  ];

  if (nodeBuiltins.includes(moduleName)) {
    return {
      type: 'sourceFile',
      filePath: emptyModulePath,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

// inlineRequires defers each module's evaluation to its first use, which is what
// keeps only the active locale's JSON out of the startup path (see
// LocalizationContext) even though Metro bundles both.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
