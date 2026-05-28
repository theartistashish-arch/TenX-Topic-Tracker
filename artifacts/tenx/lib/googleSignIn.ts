import { Platform } from "react-native";

const WEB_CLIENT_ID =
  "372157016133-41uc72ralfb4ti5h8m2ivs67qoklptde.apps.googleusercontent.com";

let _GoogleSignin: any = null;
let _statusCodes: Record<string, string> = {};

if (Platform.OS !== "web") {
  const pkg = require("@react-native-google-signin/google-signin");
  _GoogleSignin = pkg.GoogleSignin;
  _statusCodes = pkg.statusCodes;
  _GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
}

export const GoogleSignin = _GoogleSignin;
export const statusCodes = _statusCodes;
