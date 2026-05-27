import { db } from "./firebase.native";

export async function getUserData(
  uid: string,
  key: "topics" | "settings",
): Promise<Record<string, unknown> | null> {
  try {
    const snap = await db()
      .collection("users")
      .doc(uid)
      .collection("data")
      .doc(key)
      .get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
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
  console.log(`[TenX] setUserData called: uid=${uid}, key=${key}`);
  try {
    const dbRef = db();
    console.log(`[TenX] setUserData writing to users/${uid}/data/${key}`);
    await dbRef
      .collection("users")
      .doc(uid)
      .collection("data")
      .doc(key)
      .set({ ...data, updatedAt: Date.now() });
    console.log(`[TenX] setUserData SUCCESS: users/${uid}/data/${key}`);
  } catch (err) {
    console.warn("[TenX] Firestore setUserData failed:", err);
  }
}

export async function deleteUserData(uid: string): Promise<void> {
  try {
    // Atomic batch: both deletes succeed or both fail — no partial state.
    const batch = db().batch();
    batch.delete(db().collection("users").doc(uid).collection("data").doc("topics"));
    batch.delete(db().collection("users").doc(uid).collection("data").doc("settings"));
    await batch.commit();
  } catch (err) {
    console.warn("[TenX] Firestore deleteUserData failed:", err);
  }
}
