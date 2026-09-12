// ======================================================
// APPLICATION BOOTSTRAP
// Connects authentication, routing, header, navigation and page modules.
// ======================================================

import { initializeSecurityLayers } from "./firebase.js";
import { observeAuth, logout } from "./auth.js";
import { navigate, currentRoute } from "./router.js";
import { getWallet } from "./wallet.js";
import { getProfile } from "./profile.js";
import { showToast } from "./ui.js";
import { formatTokens, escapeHtml, friendlyError } from "./utils.js";
import { initializeAds } from "./ads.js";

initializeSecurityLayers();
initializeAds();

let currentProfile = null;

// ======================================================
// AUTHENTICATION SESSION
// Waits for Firebase to determine whether the user is signed in.
// ======================================================
observeAuth(async user => {
  const splash = document.getElementById("splashScreen");
  if (!user) {
    location.href = "login.html";
    return;
  }

  try {
    currentProfile = await getProfile();
    if (!currentProfile) throw new Error("Account profile is not ready.");
    renderHeader();
    renderBottomNav();
    await navigate(currentRoute(), false);
    bindGlobalNavigation();
    await refreshPageData();
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    splash?.classList.add("hidden");
    document.getElementById("appShell")?.classList.remove("hidden");
  }
});

function renderHeader() {
  // Reads current profile data and updates only presentation.
  const header = document.getElementById("appHeader");
  const initial = (currentProfile?.username || "U").slice(0,1).toUpperCase();
  header.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${escapeHtml(initial)}</div>
      <div><strong>MONEY COMING</strong><div class="muted" style="font-size:.72rem">${escapeHtml(currentProfile?.username || "")}</div></div>
    </div>
    <div class="header-actions">
      <button class="icon-btn" data-route="notifications" aria-label="Notifications">🔔</button>
      <button class="icon-btn" data-route="profile" aria-label="Profile">👤</button>
    </div>`;
}

function renderBottomNav() {
  // Creates the four primary navigation controls.
  const nav = document.getElementById("bottomNavigation");
  nav.innerHTML = `
    <a href="#home" data-route="home">⌂<span>HOME</span></a>
    <a href="#history" data-route="history">▤<span>HISTORY</span></a>
    <a href="#withdraw" data-route="withdraw">৳<span>WITHDRAW</span></a>
    <a href="#profile" data-route="profile">●<span>PROFILE</span></a>`;
}

function bindGlobalNavigation() {
  // Intercepts internal route clicks and browser back/forward navigation.
  document.addEventListener("click", async event => {
    const target = event.target.closest("[data-route]");
    if (!target) return;
    event.preventDefault();
    try {
      await navigate(target.dataset.route);
      await refreshPageData();
    } catch (error) {
      showToast(friendlyError(error), "error");
    }
  });
  window.addEventListener("popstate", async () => {
    await navigate(currentRoute(), false);
    await refreshPageData();
  });
}

async function refreshPageData() {
  // Re-renders page-specific live Firebase data and wires its controls.
  const page = currentRoute();
  if (page === "home") await renderHome();
  if (page === "history") await import("./pages-controller.js").then(m => m.initHistory());
  if (page === "withdraw") await import("./pages-controller.js").then(m => m.initWithdraw());
  if (page === "profile") await import("./pages-controller.js").then(m => m.initProfile());
  if (page === "daily-bonus") await import("./pages-controller.js").then(m => m.initDailyBonus());
  if (page === "lucky-wheel") await import("./pages-controller.js").then(m => m.initLuckyWheel());
  if (page === "referral") await import("./pages-controller.js").then(m => m.initReferral());
  if (page === "notifications") await import("./pages-controller.js").then(m => m.initNotifications());
  if (page === "support") await import("./pages-controller.js").then(m => m.initSupport());
  if (page === "settings") await import("./pages-controller.js").then(m => m.initSettings());
}

async function renderHome() {
  // Reads the server wallet and displays it. It never modifies the wallet.
  const wallet = await getWallet();
  const container = document.getElementById("pageContainer");
  const adsToday = Number(wallet.adsToday || 0);
  const limit = Number(wallet.dailyAdLimit || 30);
  container.querySelector("#balanceValue").textContent = `${formatTokens(wallet.availableTokens)} Tokens`;
  container.querySelector("#todayEarningsStat").textContent = `${formatTokens(wallet.todayEarned || 0)}`;
  container.querySelector("#totalEarningsStat").textContent = `${formatTokens(wallet.totalEarned || 0)}`;
  container.querySelector("#adsWatched").textContent = `${adsToday}`;
  container.querySelector("#adProgress").style.width = `${Math.min(100, (adsToday / Math.max(limit,1))*100)}%`;
  container.querySelector("#adCount").textContent = `${adsToday} / ${limit}`;
}

window.addEventListener("hashchange", async () => {
  try { await navigate(currentRoute(), false); await refreshPageData(); } catch (e) { showToast(friendlyError(e), "error"); }
});

window.MCLogout = logout;
