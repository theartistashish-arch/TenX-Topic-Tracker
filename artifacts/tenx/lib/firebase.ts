/**
 * Firebase Web singleton initialization.
 *
 * The module-level code below runs exactly once on first import.  It checks
 * getApps() so the app is never initialized twice — even if this file is
 * imported from multiple bundles or reloaded via Fast Refresh.
 *
 * Exports:
 *   - auth   → Firebase Auth singleton (or null if not configured)
 *   - db     → Firestore singleton (or null if not configured)
 *   - firebaseConfigured → boolean guard for conditional Firebase usage
 */
import { getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "";
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "";

export const firebaseConfigured = !!(apiKey && authDomain && projectId);

let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (apiKey && authDomain && projectId) {
  const options: Record<string, string> = { apiKey, authDomain, projectId };
  if (appId) options.appId = appId;

  const app =
    getApps().length === 0
      ? initializeApp(options)
      : getApps()[0]!;

  _auth = getAuth(app);
  _db = getFirestore(app);

  // Enable offline persistence so Firestore reads/writes work offline and
  // cache recent data to avoid redundant network round-trips.
  if (typeof window !== "undefined") {
    enableIndexedDbPersistence(_db).catch((err) => {
      if (__DEV__) console.warn("[TenX] Firestore persistence failed:", err);
    });
  }

  if (__DEV__) {
    console.log(
      "[TenX] Firebase init OK — project:", projectId,
      "appId:", appId || "(none)",
    );
  }
} else if (__DEV__) {
  console.warn(
    "[TenX] Firebase NOT configured — missing:",
    !apiKey ? "EXPO_PUBLIC_FIREBASE_API_KEY " : "",
    !authDomain ? "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN " : "",
    !projectId ? "EXPO_PUBLIC_FIREBASE_PROJECT_ID" : "",
  );
}

export const auth = _auth as Auth;
export const db = _db as Firestore;
export default firebaseConfigured ? getApps()[0]! : null;
