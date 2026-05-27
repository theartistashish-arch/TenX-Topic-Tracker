const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Support pnpm symlinks in workspace monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../../node_modules"),
];

// react-native-google-mobile-ads creates a _tmp_* directory in the pnpm virtual
// store during installation. Metro tries to watch a native-ad subdirectory inside
// it that doesn't exist, crashing the bundler. Block these temp dirs entirely.
const existingBlockList = config.resolver.blockList;
const existingEntries = existingBlockList
  ? Array.isArray(existingBlockList)
    ? existingBlockList
    : [existingBlockList]
  : [];
config.resolver.blockList = [
  ...existingEntries,
  /node_modules\/react-native-google-mobile-ads_tmp_/,
];

module.exports = config;
