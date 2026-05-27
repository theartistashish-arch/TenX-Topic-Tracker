import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConfirmationResult } from "firebase/auth";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile as firebaseUpdateProfile,
} from "firebase/auth";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { deleteUserData } from "@/lib/firestore";

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
  sendOtp: (phoneNumber: string, recaptchaVerifier?: RecaptchaVerifier) => Promise<Result>;
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

function profileKey(uid: string) {
  return `tenx.profile.v1.${uid}`;
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
  if (!firebaseConfigured || !db) return null;
  try {
    // Only fetch the 4 fields we need instead of the whole document.
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<ProfileExtras>;
    const profile: ProfileExtras = {
      name: data.name ?? "",
      city: data.city ?? "",
      schoolName: data.schoolName ?? "",
      examGoal: data.examGoal ?? "Other",
    };
    await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile));
    return profile;
  } catch (err) {
    console.warn("[TenX] Firestore profile sync failed:", err);
    return null;
  }
}

async function saveProfile(uid: string, profile: ProfileExtras) {
  if (firebaseConfigured && db) {
    try {
      // updateDoc writes only the changed leaf fields — less data than setDoc merge.
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid), { ...profile, updatedAt: serverTimestamp() });
    } catch (err) {
      // Fallback to setDoc if doc doesn't exist yet.
      console.warn("[TenX] updateDoc failed, falling back to setDoc:", err);
      try {
        await setDoc(doc(db, "users", uid), profile, { merge: true });
      } catch (err2) {
        console.warn("[TenX] Firestore saveProfile failed, profile saved locally only:", err2);
      }
    }
  }
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile));
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
    case "auth/unauthorized-domain":
    case "auth/captcha-check-failed":
      return "This domain isn't authorised for phone sign-in. In Firebase Console → Authentication → Settings → Authorized domains, add your web preview URL (e.g. your-repl.replit.dev).";
    case "auth/missing-client-identifier":
      return "Phone sign-in requires an authorised domain. Add your web preview domain in Firebase Console → Authentication → Settings → Authorized domains.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Please allow popups for this site.";
    case "auth/internal-error":
      return "Firebase internal error. Check that all sign-in providers are enabled in the Firebase Console.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key":
      return "API key error. In Google Cloud Console → APIs & Services → Credentials, remove Android app restrictions from your Firebase API key, or enable Identity Toolkit API.";
    case "auth/app-not-authorized":
      return "This app is not authorized to use Firebase Auth. Check your Firebase project settings.";
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
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const GUEST_KEY = "tenx.guest.v1";

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      // No Firebase — load or create a stable local guest user so the app
      // works fully offline / in web preview without Firebase credentials.
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(GUEST_KEY);
          if (raw) {
            setCurrentUser(JSON.parse(raw) as PublicUser);
          } else {
            const guestUser: PublicUser = {
              id: "local-" + Date.now().toString(36),
              email: "",
              name: "",
              city: "",
              schoolName: "",
              examGoal: "Other",
              createdAt: Date.now(),
            };
            await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(guestUser));
            setCurrentUser(guestUser);
            setIsNewUser(true);
          }
        } catch {
          setCurrentUser({
            id: "local-guest",
            email: "",
            name: "",
            city: "",
            schoolName: "",
            examGoal: "Other",
            createdAt: Date.now(),
          });
        }
        setIsLoading(false);
      })();
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
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
      };

      setCurrentUser(publicUser);
      setIsNewUser(!hasProfile);
      setIsLoading(false);

      void loadProfileFromFirestore(fbUser.uid).then((freshProfile) => {
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
      });
    });

    return unsubscribe;
  }, []);

  const notConfiguredError = { ok: false as const, error: "Firebase is not configured. Please add the EXPO_PUBLIC_FIREBASE_* secrets." };

  const createLocalProfile = useCallback<AuthContextValue["createLocalProfile"]>(
    async (name, examGoal, city = "", schoolName = "") => {
      const trimmedName = name.trim();
      if (!trimmedName) return { ok: false, error: "Please enter your name." };
      try {
        const raw = await AsyncStorage.getItem(GUEST_KEY);
        const existing: PublicUser = raw
          ? (JSON.parse(raw) as PublicUser)
          : { id: "local-" + Date.now().toString(36), email: "", name: "", city: "", schoolName: "", examGoal: "Other", createdAt: Date.now(), isLocal: true };
        const updated: PublicUser = {
          ...existing,
          name: trimmedName,
          city: city.trim(),
          schoolName: schoolName.trim(),
          examGoal,
          isLocal: true,
        };
        await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(updated));
        setCurrentUser(updated);
        setIsNewUser(false);
        return { ok: true };
      } catch {
        return { ok: false, error: "Could not save profile." };
      }
    },
    [],
  );

  const signInWithEmail = useCallback<AuthContextValue["signInWithEmail"]>(
    async (email, password) => {
      if (!firebaseConfigured || !auth) return notConfiguredError;
      try {
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
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
      if (!firebaseConfigured || !auth) return notConfiguredError;
      if (Platform.OS !== "web") {
        return { ok: false, error: "Use the Google sign-in flow via expo-auth-session on native." };
      }
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          return { ok: false, error: "Sign-in cancelled." };
        }
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const signInWithGoogleCredential = useCallback<AuthContextValue["signInWithGoogleCredential"]>(
    async (idToken, accessToken) => {
      if (!firebaseConfigured || !auth) return notConfiguredError;
      try {
        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        await signInWithCredential(auth, credential);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const sendOtp = useCallback<AuthContextValue["sendOtp"]>(
    async (phoneNumber, recaptchaVerifier) => {
      if (!firebaseConfigured || !auth) return notConfiguredError;
      if (Platform.OS !== "web") {
        return { ok: false, error: "Phone sign-in is only supported on web in this version." };
      }
      try {
        let verifier = recaptchaVerifier;
        if (!verifier) {
          if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(
              auth,
              "recaptcha-container",
              { size: "invisible" },
            );
          }
          verifier = recaptchaVerifierRef.current;
        }
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        confirmationRef.current = confirmation;
        return { ok: true };
      } catch (err: unknown) {
        recaptchaVerifierRef.current = null;
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
      if (!firebaseConfigured || !auth) return notConfiguredError;
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      if (!cleanEmail || !password || !cleanName) {
        return { ok: false, error: "Name, email and password are all required." };
      }
      if (password.length < 6) {
        return { ok: false, error: "Password must be at least 6 characters." };
      }
      try {
        const { user } = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await firebaseUpdateProfile(user, { displayName: cleanName });
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        const message = (err as { message?: string }).message ?? "";
        console.warn("[TenX] signUp error:", code, message);
        return { ok: false, error: fbErrorMessage(code, message) };
      }
    },
    [],
  );

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(
    async (patch) => {
      // ── Local / guest mode (no Firebase) ──────────────────────────────────
      if (!firebaseConfigured || !auth) {
        try {
          const raw = await AsyncStorage.getItem(GUEST_KEY);
          const existing: PublicUser = raw
            ? (JSON.parse(raw) as PublicUser)
            : { id: "local-guest", email: "", name: "", city: "", schoolName: "", examGoal: "Other", createdAt: Date.now() };
          const updated: PublicUser = {
            ...existing,
            name: patch.name !== undefined ? patch.name.trim() : existing.name,
            city: patch.city !== undefined ? patch.city.trim() : existing.city,
            schoolName: patch.schoolName !== undefined ? patch.schoolName.trim() : existing.schoolName,
            examGoal: patch.examGoal !== undefined ? patch.examGoal : existing.examGoal,
          };
          if (!updated.name) return { ok: false, error: "Name can't be empty." };
          await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(updated));
          setCurrentUser(updated);
          setIsNewUser(false);
          return { ok: true };
        } catch {
          return { ok: false, error: "Could not save profile." };
        }
      }
      // ── Firebase mode ──────────────────────────────────────────────────────
      const fbUser = auth.currentUser;
      if (!fbUser) return { ok: false, error: "Not signed in." };

      const existing = (await loadProfile(fbUser.uid)) ?? {
        name: fbUser.displayName ?? "",
        city: "",
        schoolName: "",
        examGoal: "Other" as ExamGoal,
      };

      const updated: ProfileExtras = {
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        city: patch.city !== undefined ? patch.city.trim() : existing.city,
        schoolName: patch.schoolName !== undefined ? patch.schoolName.trim() : existing.schoolName,
        examGoal: patch.examGoal !== undefined ? patch.examGoal : existing.examGoal,
      };

      if (!updated.name) return { ok: false, error: "Name can't be empty." };

      await saveProfile(fbUser.uid, updated);

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
    [],
  );

  const sendPasswordReset = useCallback<AuthContextValue["sendPasswordReset"]>(
    async (email) => {
      if (!firebaseConfigured || !auth) return notConfiguredError;
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return { ok: false, error: "Please enter your email address." };
      try {
        await sendPasswordResetEmail(auth, trimmed);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        if (code === "auth/user-not-found") {
          return { ok: true };
        }
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (currentPassword, newPassword) => {
      if (!firebaseConfigured || !auth) return notConfiguredError;
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.email) {
        return { ok: false, error: "Not signed in with email." };
      }
      if (!newPassword || newPassword.length < 6) {
        return { ok: false, error: "New password must be 6+ characters." };
      }
      try {
        const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
        await reauthenticateWithCredential(fbUser, credential);
        await updatePassword(fbUser, newPassword);
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? "";
        return { ok: false, error: fbErrorMessage(code) };
      }
    },
    [],
  );

  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(async () => {
    if (!firebaseConfigured || !auth) return notConfiguredError;
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) return { ok: false, error: "Not signed in." };
      const uid = fbUser.uid;
      await fbUser.delete();
      await deleteUserData(uid);
      await AsyncStorage.multiRemove([
        `tenx.profile.v1.${uid}`,
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
    if (firebaseConfigured && auth) await signOut(auth);
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
