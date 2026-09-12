// ======================================================
// PUBLIC CONFIGURATION
// This file contains only values that are safe to ship to the browser.
// Replace Firebase placeholders with your Firebase Web App configuration.
// Never put Admin SDK private keys, payment secrets or API secrets here.
// ======================================================

export const APP_CONFIG = Object.freeze({
  environment: "development",
  firebase: {
        apiKey: "AIzaSyCSwqN3Io3TOvE01Zr_tcY6SsAj5Wslddw",
    authDomain: "money-comming.firebaseapp.com",
    projectId: "money-comming",
    storageBucket: "money-comming.firebasestorage.app",
    messagingSenderId: "897859210607",
    appId: "1:897859210607:web:0e3799f061c9a68c2eec9a"
  },
  routes: {
    defaultPage: "home",
    authPage: "login.html"
  }
});
