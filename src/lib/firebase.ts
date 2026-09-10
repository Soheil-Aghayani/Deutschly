import type { FirebaseApp } from "firebase/app";
import type { Auth, Unsubscribe, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore/lite";

export type FirebaseAuthProvider = "google" | "github";

export interface FirebaseUserSummary {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  provider: string;
}

export interface FirebaseCloudDocument {
  state: unknown;
  profileName?: string;
  updatedAt?: string;
}

export class FirebaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseSetupError";
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;

async function getFirebaseAppAsync(): Promise<FirebaseApp> {
  if (!firebaseConfigured) throw new FirebaseSetupError("Firebase is not configured for this build yet.");
  const { getApp, getApps, initializeApp } = await import("firebase/app");
  firebaseApp ??= getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return firebaseApp;
}

async function getFirebaseAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase/auth");
  firebaseAuth ??= getAuth(await getFirebaseAppAsync());
  return firebaseAuth;
}

function toUserSummary(user: User): FirebaseUserSummary {
  return {
    uid: user.uid,
    displayName: user.displayName?.trim() ?? "",
    email: user.email?.trim() ?? "",
    photoURL: user.photoURL ?? "",
    provider: user.providerData[0]?.providerId ?? "unknown",
  };
}

async function getFirebaseDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase/firestore/lite");
  firebaseDb ??= getFirestore(await getFirebaseAppAsync());
  return firebaseDb;
}

async function userDocument(uid: string) {
  const { doc } = await import("firebase/firestore/lite");
  return doc(await getFirebaseDb(), "users", uid);
}

function cloneForFirestore(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfigured;
}

export function subscribeToFirebaseAuth(onUser: (user: FirebaseUserSummary | null) => void): Unsubscribe {
  if (!firebaseConfigured) {
    onUser(null);
    return () => undefined;
  }
  let cancelled = false;
  let unsubscribe: Unsubscribe | null = null;
  void Promise.all([getFirebaseAuth(), import("firebase/auth")]).then(([auth, { onAuthStateChanged }]) => {
    if (cancelled) return;
    unsubscribe = onAuthStateChanged(auth, (user) => onUser(user ? toUserSummary(user) : null));
  }).catch(() => onUser(null));
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function finishFirebaseRedirectSignIn(): Promise<FirebaseUserSummary | null> {
  if (!firebaseConfigured) return null;
  const [auth, { browserPopupRedirectResolver, getRedirectResult }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  const result = await getRedirectResult(auth, browserPopupRedirectResolver);
  return result?.user ? toUserSummary(result.user) : null;
}

export async function signInWithFirebaseProvider(provider: FirebaseAuthProvider, useRedirect: boolean): Promise<FirebaseUserSummary | null> {
  const [auth, authModule] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  const authProvider = provider === "google" ? new authModule.GoogleAuthProvider() : new authModule.GithubAuthProvider();
  if (useRedirect) {
    await authModule.signInWithRedirect(auth, authProvider, authModule.browserPopupRedirectResolver);
    return null;
  }
  const result = await authModule.signInWithPopup(auth, authProvider, authModule.browserPopupRedirectResolver);
  return toUserSummary(result.user);
}

export async function signOutFromFirebase(): Promise<void> {
  if (!firebaseConfigured) return;
  const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  await signOut(auth);
}

export async function deleteFirebaseAccount(): Promise<void> {
  if (!firebaseConfigured) return;
  const [auth, { deleteUser }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  if (!auth.currentUser) throw new FirebaseSetupError("No signed-in account is available to delete.");
  const { deleteDoc } = await import("firebase/firestore/lite");
  await deleteDoc(await userDocument(auth.currentUser.uid));
  await deleteUser(auth.currentUser);
}

export async function loadFirebaseCloudDocument(uid: string): Promise<FirebaseCloudDocument | null> {
  if (!firebaseConfigured) return null;
  const { getDoc } = await import("firebase/firestore/lite");
  const snapshot = await getDoc(await userDocument(uid));
  if (!snapshot.exists()) return null;
  const value = snapshot.data();
  if (!value || typeof value.state !== "object" || value.state === null) return null;
  return {
    state: value.state,
    profileName: typeof value.profileName === "string" ? value.profileName : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

export async function saveFirebaseCloudDocument(uid: string, document: { state: unknown; profileName?: string }): Promise<string> {
  if (!firebaseConfigured) throw new FirebaseSetupError("Firebase is not configured for this build yet.");
  const { setDoc } = await import("firebase/firestore/lite");
  const updatedAt = new Date().toISOString();
  await setDoc(await userDocument(uid), {
    state: cloneForFirestore(document.state),
    profileName: document.profileName ?? "",
    updatedAt,
  });
  return updatedAt;
}
