// ======================================================
// FIREBASE INITIALIZATION
// Creates the browser-side Firebase connection.
// Sensitive operations are NOT performed here.
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app-check.js";
import { APP_CONFIG } from "./config.js";

const firebaseApp = initializeApp(APP_CONFIG.firebase);
export const auth = getAuth(firebaseApp);

// ======================================================
// FIRESTORE
// Reads/writes are still restricted by Firestore Security Rules.
// ======================================================
export const db = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });

// ======================================================
// APP CHECK
// Replace the placeholder public reCAPTCHA site key before production.
// App Check is an additional layer; it is not a replacement for Rules.
// ======================================================
export function initializeSecurityLayers() {
  const siteKey = window.MC_APPCHECK_SITE_KEY || "";
  if (!siteKey || location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn("App Check initialization skipped:", error);
  }
}
