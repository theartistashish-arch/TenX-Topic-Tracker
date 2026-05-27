/**
 * Firebase Native singleton initialization.
 *
 * @react-native-firebase modules are auto-initialized by the native SDK
 * before JS loads — there is no initializeApp() call here.  Simply
 * importing this file gives you the single app instance the native layer
 * created from google-services.json / GoogleService-Info.plist.
 *
 * Exports:
 *   - auth   → Firebase Auth singleton
 *   - db     → Firestore singleton
 *   - firebaseConfigured → always true for native builds
 */
import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

export { auth, firestore as db };
export const firebaseConfigured = true;
export default auth;
