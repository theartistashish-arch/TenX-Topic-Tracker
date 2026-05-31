import AsyncStorage from "@react-native-async-storage/async-storage";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import { deleteUserData } from "@/lib/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ExamGoal = string;

export const EXAM_GOALS: ExamGoal[] = [
  "UPSC",
  "NEET",
  "JEE",
  "GATE",
  "CAT",
  "SSC",
  "Other",
];

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  city: string;
  schoolName: string;
  examGoal: ExamGoal;
  createdAt: number;
  isLocal?: boolean;
}

interface ProfileExtras {
  name: string;
  city: string;
  schoolName: string;
  examGoal: ExamGoal;
}

type Result = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  currentUser: PublicUser | null;
  isLoading: boolean;
  isNewUser: boolean;
  createLocalProfile: (
    name: string,
    examGoal: ExamGoal,
    city?: string,
    schoolName?: string,
  ) => Promise<Result>;
  signInWithEmail: (email: string, password: string) => Promise<Result>;
  signInWithGoogle: () => Promise<Result>;
  signInWithGoogleCredential: (idToken: string, accessToken?: string) => Promise<Result>;
  sendOtp: (phoneNumber: string) => Promise<Result>;
  verifyOtp: (code: string) => Promise<Result>;
  signUp: (email: string, password: string, name: string) => Promise<Result>;
  updateProfile: (
    patch: Partial<Pick<PublicUser, "name" | "city" | "schoolName" | "examGoal">>,
  ) => Promise<Result>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Result>;
  sendPasswordReset: (email: string) => Promise<Result>;
  deleteAccount: () => Promise<Result>;
  logout: () => Promise<void>;
}

const LOCAL_UID_KEY = "tenx.local.uid";
const LOCAL_CREATED_AT_KEY = "tenx.local.createdAt";
const PROFILE_SYNC_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateLocalUid(): string {
  return "local-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function profileKey(uid: string) {
  return `tenx.profile.v1.${uid}`;
}

function profileSyncKey(uid: string) {
  return `tenx.profile.lastSyncAt.${uid}`;
}

async function loadProfile(uid: string): Promise<ProfileExtras | null> {
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid));
    if (!raw) return null;
    return JSON.parse(raw) as ProfileExtras;
  } catch {
    return null;
  }
}

async function loadProfileFromFirestore(uid: string): Promise<ProfileExtras | null> {
  try {
    const snap = await firestore().collection("users").doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<ProfileExtras>;
    const profile: ProfileExtras = {
      name: data.name ?? "",
      city: data.city ?? "",
      schoolName: data.schoolName ?? "",
      examGoal: data.examGoal ?? "Other",
    };
    await Promise.all([
      AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile)),
      AsyncStorage.setItem(profileSyncKey(uid), Date.now().toString()),
    ]);
    return profile;
  } catch (err) {
    console.warn("[TenX] Firestore profile sync failed:", err);
    return null;
  }
}

async function saveProfile(uid: string, profile: ProfileExtras) {
  try {
    // update writes only the changed leaf fields — less data than set merge.
    await firestore().collection("users").doc(uid).update(profile);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "firestore/not-found") {
      // Doc doesn't exist yet — fall back to set with merge.
      await firestore().collection("users").doc(uid).set(profile, { merge: true });
    } else {
      console.warn("[TenX] Firestore saveProfile failed, profile saved locally only:", err);
    }
  }
  // Update both the profile cache and the sync timestamp so the next cold
  // start doesn't re-fetch this data we just wrote.
  await Promise.all([
    AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile)),
    AsyncStorage.setItem(profileSyncKey(uid), Date.now().toString()),
  ]);
}

function fbErrorMessage(code: string, rawMessage?: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/invalid-phone-number":
      return "Please enter a valid phone number with country code.";
    case "auth/invalid-verification-code":
      return "Incorrect OTP. Please try again.";
    case "auth/session-expired":
      return "OTP expired. Please request a new code.";
    case "auth/requires-recent-login":
      return "Please sign in again before changing your password.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/api-key-not-valid":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key":
    case "auth/invalid-api-key":
      return "Firebase configuration error. Please contact support.";
    default:
      return code
        ? `Error: ${code}${rawMessage ? " — " + rawMessage : ""}. Please try again.`
        : `Something went wrong${rawMessage ? " — " + rawMessage : ""}. Please try again.`;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const confirmationRef = useRef<FirebaseAuthTypes.ConfirmationResult | null>(null);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (fbUser) => {
      if (!fbUser) {
        const localUid = await AsyncStorage.getItem(LOCAL_UID_KEY);
        if (localUid) {
          const localProfile = await loadProfile(localUid);
          if (localProfile) {
            const rawCreatedAt = await AsyncStorage.getItem(LOCAL_CREATED_AT_KEY);
            const createdAt = rawCreatedAt ? parseInt(rawCreatedAt, 10) : Date.now();
            setCurrentUser({
              id: localUid,
              email: "",
              name: localProfile.name,
              city: localProfile.city,
              schoolName: localProfile.schoolName,
              examGoal: localProfile.examGoal,
              createdAt,
              isLocal: true,
            });
            setIsLoading(false);
            return;
          }
        }
        setCurrentUser(null);
        setIsNewUser(false);
        setIsLoading(false);
        return;
      }

      const profile = await loadProfile(fbUser.uid);
      const hasProfile = profile !== null;

      const createdAt = fbUser.metadata.creationTime
        ? new Date(fbUser.metadata.creationTime).getTime()
        : Date.now();

      const publicUser: PublicUser = {
        id: fbUser.uid,
        email: fbUser.email ?? fbUser.phoneNumber ?? "",
        name: profile?.name ?? fbUser.displayName ?? "",
        city: profile?.city ?? "",
        schoolName: profile?.schoolName ?? "",
        examGoal: profile?.examGoal ?? "Other",
        createdAt,
        isLocal: false,
      };

      setCurrentUser(publicUser);
      setIsNewUser(!hasProfile);
      setIsLoading(false);

      // Only hit Firestore for the profile if the local cache is stale.
      // Writes from saveProfile() already keep AsyncStorage up to date,
      // so this read is only needed for cross-device sync.
      void (async () => {
        try {
          const lastSyncRaw = await AsyncStorage.getItem(profileSyncKey(fbUser.uid));
          const lastSync = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;
          if (Date.now() - lastSync < PROFILE_SYNC_TTL_MS) return;
        } catch {
          // If we can't read the timestamp, proceed with the Firestore fetch.
        }
        const freshProfile = await loadProfileFromFirestore(fbUser.uid);
        if (!freshProfile) return;
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                name: freshProfile.name,
                city: freshProfile.city,
                schoolName: freshProfile.schoolName,
                examGoal: freshProfile.examGoal,
              }
            : prev,
        );
        setIsNewUser(false);
      })();
    });

    return unsubscribe;
  }, []);

  const createLocalProfile = useCallback<AuthContextValue["createLocalProfile"]>(
    async (name, examGoal, city = "", schoolName = "") => {
      const trimmedName = name.trim();
      if (!trimmedName) return { ok: false, error: "Please enter your name." };

      let uid = await AsyncStorage.getItem(LOCAL_UID_KEY);
      if (!uid) {
        uid = generateLocalUid();
        await AsyncStorage.setItem(LOCAL_UID_KEY, uid);
        await AsyncStorage.setItem(LOCAL_CREATED_AT_KEY, Date.now().toString());
      }

      const profile: ProfileExtras = {
        name: trimmedName,
        city: city.trim(),
        schoolName: schoolName.trim(),
        examGoal,
      };
      await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile));

      const rawCreatedAt = await AsyncStorage.getItem(LOCAL_CREATED_AT_KEY);
      const createdAt = rawCreatedAt ? parseInt(rawCreatedAt, 10) : Date.now();

      setCurrentUser({
        id: uid,
        email: "",
        name: profile.name,
        city: profile.city,
        schoolName: profile.schoolName,
        examGoal: profile.examGoal,
        createdAt,
        isLocal: true,
      });
      setIsNewUser(false);

      return { ok: true };
    },
    [],
  );

  const signInWithEmail = useCallback<AuthContextValue["signInWithEmail"]>(
    async (email, password) => {
      try {
        await auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback<AuthContextValue["signInWithGoogle"]>(
    async () => {
      return { ok: false, error: "Google sign-in not available on this platform. Please use email/password." };
    },
    [],
  );

  const signInWithGoogleCredential = useCallback<AuthContextValue["signInWithGoogleCredential"]>(
    async (idToken, accessToken) => {
      try {
        const credential = auth.GoogleAuthProvider.credential(idToken, accessToken);
        await auth().signInWithCredential(credential);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const sendOtp = useCallback<AuthContextValue["sendOtp"]>(
    async (phoneNumber) => {
      try {
        const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
        confirmationRef.current = confirmation;
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const verifyOtp = useCallback<AuthContextValue["verifyOtp"]>(
    async (code) => {
      if (!confirmationRef.current) {
        return { ok: false, error: "No OTP request in progress. Please request a new code." };
      }
      try {
        await confirmationRef.current.confirm(code);
        confirmationRef.current = null;
        return { ok: true };
      } catch (err: unknown) {
        const code_ = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code_) };
      }
    },
    [],
  );

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (email, password, name) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      if (!cleanEmail || !password || !cleanName) {
        return { ok: false, error: "Name, email and password are all required." };
      }
      if (password.length < 6) {
        return { ok: false, error: "Password must be at least 6 characters." };
      }
      try {
        const { user } = await auth().createUserWithEmailAndPassword(cleanEmail, password);
        await user.updateProfile({ displayName: cleanName });
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        const message = (err as { message?: string }).message ?? "";
        if (__DEV__) console.warn("[TenX] signUp error:", code, message);
        return { ok: false, error: fbErrorMessage(code, message) };
      }
    },
    [],
  );

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(
    async (patch) => {
      const fbUser = auth().currentUser;
      const uid = fbUser?.uid ?? currentUser?.id;
      if (!uid) return { ok: false, error: "Not signed in." };

      const existing = (await loadProfile(uid)) ?? {
        name: fbUser?.displayName ?? currentUser?.name ?? "",
        city: currentUser?.city ?? "",
        schoolName: currentUser?.schoolName ?? "",
        examGoal: (currentUser?.examGoal ?? "Other") as ExamGoal,
      };

      const updated: ProfileExtras = {
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        city: patch.city !== undefined ? patch.city.trim() : existing.city,
        schoolName: patch.schoolName !== undefined ? patch.schoolName.trim() : existing.schoolName,
        examGoal: patch.examGoal !== undefined ? patch.examGoal : existing.examGoal,
      };

      if (!updated.name) return { ok: false, error: "Name can't be empty." };

      if (fbUser) {
        await saveProfile(uid, updated);
      } else {
        await AsyncStorage.setItem(profileKey(uid), JSON.stringify(updated));
      }

      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name,
              city: updated.city,
              schoolName: updated.schoolName,
              examGoal: updated.examGoal,
            }
          : prev,
      );
      setIsNewUser(false);

      return { ok: true };
    },
    [currentUser],
  );

  const sendPasswordReset = useCallback<AuthContextValue["sendPasswordReset"]>(
    async (email) => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return { ok: false, error: "Please enter your email address." };
      try {
        await auth().sendPasswordResetEmail(trimmed);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        if (code === "auth/user-not-found") return { ok: true };
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (currentPassword, newPassword) => {
      const fbUser = auth().currentUser;
      if (!fbUser || !fbUser.email) {
        return { ok: false, error: "Not signed in with email." };
      }
      if (!newPassword || newPassword.length < 6) {
        return { ok: false, error: "New password must be 6+ characters." };
      }
      try {
        const credential = auth.EmailAuthProvider.credential(fbUser.email, currentPassword);
        await fbUser.reauthenticateWithCredential(credential);
        await fbUser.updatePassword(newPassword);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(async () => {
    try {
      const fbUser = auth().currentUser;
      if (!fbUser) return { ok: false, error: "Not signed in." };
      const uid = fbUser.uid;
      await fbUser.delete();
      await deleteUserData(uid);
      await AsyncStorage.multiRemove([
        profileKey(uid),
        `tenx.settings.v2.${uid}`,
        "tenx.topics.v2",
        "tenx.topics.v1",
        "tenx.onboarded",
      ]);
      setCurrentUser(null);
      setIsNewUser(false);
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/requires-recent-login") {
        return { ok: false, error: "Please sign in again before deleting your account." };
      }
      return { ok: false, error: "Could not delete account. Please try again." };
    }
  }, []);

  const logout = useCallback(async () => {
    const fbUser = auth().currentUser;
    if (fbUser) {
      await auth().signOut();
    }
    const localUid = await AsyncStorage.getItem(LOCAL_UID_KEY);
    if (localUid) {
      await AsyncStorage.multiRemove([
        LOCAL_UID_KEY,
        LOCAL_CREATED_AT_KEY,
        profileKey(localUid),
      ]);
    }
    setCurrentUser(null);
    setIsNewUser(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isLoading,
      isNewUser,
      createLocalProfile,
      signInWithEmail,
      signInWithGoogle,
      signInWithGoogleCredential,
      sendOtp,
      verifyOtp,
      signUp,
      updateProfile,
      changePassword,
      sendPasswordReset,
      deleteAccount,
      logout,
    }),
    [
      currentUser,
      isLoading,
      isNewUser,
      createLocalProfile,
      signInWithEmail,
      signInWithGoogle,
      signInWithGoogleCredential,
      sendOtp,
      verifyOtp,
      signUp,
      updateProfile,
      changePassword,
      sendPasswordReset,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
