// ======================================================
// AUTHENTICATION
// Handles Firebase Auth session state and logout.
// ======================================================

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { friendlyError } from "./utils.js";

export function observeAuth(callback) {
  // Reads Firebase Authentication state; does not change wallet/account data.
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  // Signs the current Firebase user out. No financial data is changed.
  try {
    await signOut(auth);
    location.href = "login.html";
  } catch (error) {
    throw new Error(friendlyError(error));
  }
}
