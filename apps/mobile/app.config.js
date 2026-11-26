const variant = process.env.DOORDIE_MOBILE_VARIANT ?? "development";
if (!["development", "preview", "production"].includes(variant)) {
  throw new Error("Unknown DOORDIE_MOBILE_VARIANT");
}

const development = variant === "development";
const production = variant === "production";
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const localId = development ? "app.doordie.mobile.dev" : "app.doordie.mobile.preview";
const bundleIdentifier = production ? process.env.DOORDIE_IOS_BUNDLE_ID : localId;
const packageName = production ? process.env.DOORDIE_ANDROID_PACKAGE : localId;
if (!bundleIdentifier || !packageName) throw new Error("Set the approved production application identifiers.");

module.exports = {
  name: production ? "DoOrDie" : development ? "DoOrDie Dev" : "DoOrDie Preview",
  slug: "doordie-mobile",
  version: "0.1.0",
  icon: "./assets/icon.png",
  scheme: production ? "doordie" : development ? "doordie-dev" : "doordie-preview",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  platforms: ["android", "ios"],
  ios: { bundleIdentifier, supportsTablet: true },
  android: {
    package: packageName,
    allowBackup: false,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#f6f3fc" },
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  ...(projectId ? { extra: { eas: { projectId } } } : {}),
  plugins: [
    "expo-router",
    ["expo-notifications", { defaultChannel: "doordie-reminders", color: "#542bc1" }],
    ["expo-secure-store", { configureAndroidBackup: true }],
    ["expo-sqlite", { useSQLCipher: true }],
    ["expo-splash-screen", { image: "./assets/icon.png", imageWidth: 112, backgroundColor: "#f6f3fc", dark: { backgroundColor: "#1b1728" } }]
  ]
};
