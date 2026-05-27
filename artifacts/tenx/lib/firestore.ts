import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

export async function getUserData(
  uid: string,
  key: "topics" | "settings",
): Promise<Record<string, unknown> | null> {
  if (!db) return null;
  try {
    const ref = doc(db, "users", uid, "data", key);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch (err) {
    console.warn("[TenX] Firestore getUserData failed:", err);
    return null;
  }
}

export async function setUserData(
  uid: string,
  key: "topics" | "settings",
  data: Record<string, unknown>,
): Promise<void> {
  if (!db) {
    console.warn("[TenX] setUserData aborted: db is null");
    return;
  }
  try {
    const ref = doc(db, "users", uid, "data", key);
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn("[TenX] Firestore setUserData failed:", err);
  }
}

export async function deleteUserData(uid: string): Promise<void> {
  if (!db) return;
  try {
    // Atomic batch: both deletes succeed or both fail — no partial state.
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", uid, "data", "topics"));
    batch.delete(doc(db, "users", uid, "data", "settings"));
    await batch.commit();
  } catch (err) {
    console.warn("[TenX] Firestore deleteUserData failed:", err);
  }
}
