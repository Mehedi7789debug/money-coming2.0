// ======================================================
// UTILITY HELPERS
// Shared formatting and error handling functions.
// ======================================================

export function formatTokens(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function formatDateOnly(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function maskPaymentNumber(value = "") {
  const s = String(value);
  if (s.length < 6) return "******";
  return `${s.slice(0, 2)}******${s.slice(-4)}`;
}

export function friendlyError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Please check your connection.",
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/weak-password": "Password is too weak. Use at least 8 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "permission-denied": "You do not have permission to perform this action.",
    "failed-precondition": "This action is currently unavailable.",
    "unavailable": "Service temporarily unavailable. Please try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
