import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Finfolio",
  slug: "finfolio",
  version: "0.1.0",
  scheme: "finfolio",
  icon: "./assets/icon.png",
  orientation: "portrait",
  userInterfaceStyle: "light",
  android: {
    package: "com.finfolio.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#efe6d2",
    },
  },
  plugins: ["expo-secure-store", "expo-web-browser"],
};
export default config;
