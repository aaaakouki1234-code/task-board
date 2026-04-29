import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth } from "./firebase-app.js";

// Persist auth in localStorage so reload keeps you signed in.
setPersistence(auth, browserLocalPersistence).catch(() => {});

const provider = new GoogleAuthProvider();

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOut() {
  return fbSignOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
