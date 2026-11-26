const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, "../..");
config.watchFolders = [...config.watchFolders, path.join(root, "src", "lib")];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules")];

module.exports = config;
