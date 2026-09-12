// ======================================================
// PROFILE
// Reads user profile information from Firestore.
// Sensitive authentication credentials remain in Firebase Auth.
// ======================================================

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";

export async function getProfile() {
  // Reads users/{uid}; it does not expose password data because passwords
  // are managed by Firebase Authentication.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in.");
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}
