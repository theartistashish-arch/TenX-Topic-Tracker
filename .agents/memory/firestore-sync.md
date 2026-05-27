---
name: Firestore Cloud Sync
description: How TenX persists topics and settings to Firestore so data survives app updates.
---

Data model
- Each user has a subcollection `users/{uid}/data/` with two documents: `topics` and `settings`.
- On every mutation, `persist()` writes to AsyncStorage first (local), then tries Firestore (cloud).
- On app load / login, the app tries Firestore first; if empty or offline, falls back to AsyncStorage.

Files
- `lib/firestore.ts` — web Firestore SDK wrappers (getUserData, setUserData, deleteUserData).
- `lib/firestore.native.ts` — native Firestore SDK wrappers. Note: `db()` must be called as a function before chaining `.collection()`.
- `contexts/TopicsContext.tsx` — loads from cloud on mount; syncs to cloud on every persist.
- `contexts/SettingsContext.tsx` — same pattern for settings.
- `contexts/AuthContext.tsx` and `AuthContext.native.tsx` — `deleteAccount()` now calls `deleteUserData(uid)` to wipe cloud data before deleting the Firebase Auth user.

Edge cases handled
- Offline writes are queued by Firestore SDK automatically.
- Cloud read failure falls back to AsyncStorage.
- Account deletion wipes both local AsyncStorage keys and Firestore documents.

Future work
- Add a "force sync" button in Settings for users who want to manually trigger a cloud push.
- Consider Firestore offline persistence enablement for native builds.
