// ======================================================
// ADMIN AUTHORIZATION
// Only a trusted Cloud Function decides whether the current
// Firebase Auth UID has an admin role. Do not use URL/localStorage checks.
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { APP_CONFIG } from "../js/config.js";
import { showToast } from "../js/ui.js";

const app = initializeApp(APP_CONFIG.firebase);
const auth = getAuth(app);
const functions = getFunctions(app);

onAuthStateChanged(auth, async user => {
  const guard = document.querySelector("#adminGuard");
  if (!user) { guard.textContent = "Please log in first."; return; }
  try {
    const check = httpsCallable(functions, "getAdminSession");
    const result = await check({});
    if (!result.data?.isAdmin) throw new Error("You are not authorized for the admin panel.");
    document.querySelector("#adminRole").textContent = result.data.role || "admin";
    guard.classList.add("hidden");
    document.querySelector("#adminContent").classList.remove("hidden");
  } catch (e) { guard.textContent = e.message; showToast(e.message, "error"); }
});
