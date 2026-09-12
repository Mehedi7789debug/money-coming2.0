// ======================================================
// AUTHENTICATION PAGES
// Login, registration and secure password-reset workflows.
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { APP_CONFIG } from "./config.js";
import { showToast, setButtonLoading } from "./ui.js";
import { friendlyError } from "./utils.js";

const app = initializeApp(APP_CONFIG.firebase);
const auth = getAuth(app);
const functions = getFunctions(app, "asia-southeast1");

const form = document.querySelector("form");
if (form?.id === "loginForm") form.addEventListener("submit", login);
if (form?.id === "registerForm") form.addEventListener("submit", register);
if (form?.id === "resetForm") form.addEventListener("submit", resetPassword);

async function login(event) {
  // Reads email/password from the form and creates a Firebase Auth session.
  // It does not write wallet or reward values.
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  setButtonLoading(button, true, "Signing in...");
  try {
    await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    location.href = "index.html";
  } catch (error) {
    showToast(friendlyError(error), "error");
    setButtonLoading(button, false);
  }
}

async function register(event) {
  // Creates a Firebase Auth account, then asks a trusted Cloud Function to
  // create the user profile/wallet atomically and validate the referral code.
  event.preventDefault();
  const username = form.username.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const referralCode = form.referralCode.value.trim().toUpperCase();
  if (password !== confirmPassword) return showToast("Passwords do not match.", "error");
  if (username.length < 3) return showToast("Username must be at least 3 characters.", "error");

  const button = form.querySelector("button[type=submit]");
  setButtonLoading(button, true, "Creating...");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: username });
    await sendEmailVerification(credential.user);
    const createProfile = httpsCallable(functions, "createUserProfile");
    await createProfile({ username, referralCode: referralCode || null });
    showToast("Account created. Please verify your email.", "success");
    setTimeout(() => location.href = "index.html", 700);
  } catch (error) {
    showToast(friendlyError(error), "error");
    setButtonLoading(button, false);
  }
}

async function resetPassword(event) {
  // Sends Firebase's official password-reset email. No custom password data is stored.
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  setButtonLoading(button, true, "Sending...");
  try {
    await sendPasswordResetEmail(auth, form.email.value.trim());
    showToast("If an account exists for that email, a reset link has been sent.", "success");
    setButtonLoading(button, false);
  } catch (error) {
    showToast(friendlyError(error), "error");
    setButtonLoading(button, false);
  }
}
