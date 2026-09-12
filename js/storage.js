// ======================================================
// FRONTEND STORAGE
// Only non-sensitive preferences are stored locally.
// Financial/account truth always comes from Firebase.
// ======================================================

const KEY = "mc_preferences";

export function getPreferences() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function setPreference(key, value) {
  const data = getPreferences();
  data[key] = value;
  localStorage.setItem(KEY, JSON.stringify(data));
}
