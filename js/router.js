// ======================================================
// ROUTER
// Loads HTML page fragments into the authenticated shell.
// ======================================================

const routes = {
  home: "pages/home.html",
  history: "pages/history.html",
  withdraw: "pages/withdraw.html",
  profile: "pages/profile.html",
  "daily-bonus": "pages/daily-bonus.html",
  "lucky-wheel": "pages/lucky-wheel.html",
  referral: "pages/referral.html",
  notifications: "pages/notifications.html",
  support: "pages/support.html",
  settings: "pages/settings.html"
};

export async function navigate(page, push = true) {
  // Fetches a page fragment and injects it into the main container.
  // The fragment itself does not bypass Firebase security controls.
  const target = routes[page] ? page : "home";
  const response = await fetch(routes[target], { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load this page.");
  const html = await response.text();
  const container = document.getElementById("pageContainer");
  container.innerHTML = html;
  if (push) history.pushState({ page: target }, "", `#${target}`);
  container.focus();
  return target;
}

export function currentRoute() {
  return location.hash.replace(/^#/, "") || "home";
}
