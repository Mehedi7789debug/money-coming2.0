// ======================================================
// SERVER REWARD CLIENT
// This module calls trusted Cloud Functions. It never calculates balances.
// ======================================================

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { APP_CONFIG } from "./config.js";

const app = initializeApp(APP_CONFIG.firebase);
const functions = getFunctions(app);

export async function callRewardFunction(name, payload = {}) {
  // Sends a request to a server-side operation. The server authenticates,
  // validates eligibility and performs the Firestore transaction.
  const fn = httpsCallable(functions, name);
  const result = await fn(payload);
  return result.data;
}
