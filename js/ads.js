// ======================================================
// MONEY COMING — ADOPERATOR SMARTLINK SESSION
// ------------------------------------------------------
// IMPORTANT:
// • This uses the SmartLink as a traffic/monetization link.
// • The 30-second timer is a session rule, NOT proof that an
//   advertisement was completed by the network.
// • Tokens are awarded only by Firebase Cloud Functions.
// • Use this reward flow only if your ad provider explicitly
//   permits incentivized/rewarded traffic for your account.
// ======================================================

import { callRewardFunction } from "./rewards.js";

// ------------------------------------------------------
// ADOPERATOR SMARTLINK
// Replace this URL if AdOperator gives you a new SmartLink.
// ------------------------------------------------------
export const SMARTLINK_URL = "https://wwp.giriuvpn.com/redirect-zone/ad92a6d0";

// User must remain in the ad session for this many seconds.
export const AD_SESSION_SECONDS = 30;

// The app's configured reward for one completed session.
export const AD_REWARD_TOKENS = 40;

let activePopup = null;
let countdownTimer = null;
let popupWatchTimer = null;
let activeSessionId = null;
let remainingSeconds = AD_SESSION_SECONDS;

function getElements() {
  return {
    modal: document.getElementById("adRewardModal"),
    countdown: document.getElementById("adCountdown"),
    status: document.getElementById("adSessionStatus"),
    close: document.getElementById("closeAdModal"),
    cancel: document.getElementById("cancelAdSession")
  };
}

function setStatus(text) {
  const { status } = getElements();
  if (status) status.textContent = text;
}

function updateCountdown() {
  const { countdown } = getElements();
  if (countdown) countdown.textContent = `${remainingSeconds}s`;
}

function clearTimers() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (popupWatchTimer) clearInterval(popupWatchTimer);
  countdownTimer = null;
  popupWatchTimer = null;
}

function hideModal() {
  const { modal } = getElements();
  modal?.classList.add("hidden");
}

function showModal() {
  const { modal } = getElements();
  modal?.classList.remove("hidden");
}

function resetLocalState() {
  clearTimers();
  activeSessionId = null;
  remainingSeconds = AD_SESSION_SECONDS;
  activePopup = null;
}

// ------------------------------------------------------
// Starts a server-controlled session, then opens SmartLink.
// The popup is opened from the original user click to reduce
// the chance of browser popup blocking.
// ------------------------------------------------------
export async function startSmartlinkAd() {
  if (activeSessionId) return;

  const { close, cancel } = getElements();
  const popup = window.open("about:blank", "moneyComingAd", "popup=yes,width=430,height=720,resizable=yes,scrollbars=yes");

  if (!popup) {
    throw new Error("Popup was blocked. Please allow popups for this website.");
  }

  activePopup = popup;
  popup.document.title = "MONEY COMING — Advertisement";
  popup.document.body.innerHTML = "<p style='font-family:system-ui;padding:20px'>Loading advertisement…</p>";

  try {
    // Server checks account status, daily limit, cooldown and
    // creates a unique session ID. It does NOT trust the browser timer.
    const result = await callRewardFunction("startSmartlinkSession", {
      provider: "adoperator",
      sessionSeconds: AD_SESSION_SECONDS
    });

    activeSessionId = result.sessionId;
    remainingSeconds = Number(result.sessionSeconds || AD_SESSION_SECONDS);
    updateCountdown();
    showModal();

    popup.location.href = SMARTLINK_URL;

    if (close) close.disabled = true;
    if (cancel) cancel.disabled = false;
    setStatus("Advertisement is open. Please keep it open until the timer finishes.");

    countdownTimer = setInterval(async () => {
      remainingSeconds -= 1;
      updateCountdown();

      if (remainingSeconds <= 0) {
        clearTimers();
        setStatus("Time completed. Verifying your session…");
        if (close) close.disabled = true;
        if (cancel) cancel.disabled = true;

        try {
          const reward = await callRewardFunction("completeSmartlinkSession", {
            sessionId: activeSessionId
          });

          setStatus(`Completed! +${reward.rewardTokens} tokens added.`);
          if (activePopup && !activePopup.closed) activePopup.close();
          if (close) {
            close.disabled = false;
            close.textContent = "CLOSE";
          }
        } catch (error) {
          setStatus(error?.message || "The session could not be completed.");
          if (close) close.disabled = false;
        }
      }
    }, 1000);

    // Detect if the user closes the ad popup early.
    popupWatchTimer = setInterval(async () => {
      if (!activePopup || activePopup.closed) {
        clearTimers();
        if (remainingSeconds > 0 && activeSessionId) {
          try {
            await callRewardFunction("cancelSmartlinkSession", { sessionId: activeSessionId });
          } catch (_) {
            // The server session has an expiry safeguard even if cancellation fails.
          }
          setStatus("Advertisement was closed before 30 seconds. No reward was added.");
          if (close) close.disabled = false;
        }
      }
    }, 700);
  } catch (error) {
    try { popup.close(); } catch (_) {}
    resetLocalState();
    throw error;
  }
}

export async function cancelSmartlinkAd() {
  clearTimers();

  if (activeSessionId) {
    try {
      await callRewardFunction("cancelSmartlinkSession", { sessionId: activeSessionId });
    } catch (_) {
      // Server-side expiry prevents a stale session from becoming permanent.
    }
  }

  if (activePopup && !activePopup.closed) {
    try { activePopup.close(); } catch (_) {}
  }

  setStatus("Advertisement closed. No reward was added.");
  const { close, cancel } = getElements();
  if (close) close.disabled = false;
  if (cancel) cancel.disabled = true;
  activeSessionId = null;
  activePopup = null;
}

export function closeSmartlinkModal() {
  clearTimers();
  if (activePopup && !activePopup.closed) {
    try { activePopup.close(); } catch (_) {}
  }
  hideModal();
  resetLocalState();
}

export function bindSmartlinkAds() {
  const watchButton = document.getElementById("watchAdsButton");
  const close = document.getElementById("closeAdModal");
  const cancel = document.getElementById("cancelAdSession");

  if (!watchButton || watchButton.dataset.adsBound === "1") return;
  watchButton.dataset.adsBound = "1";
  watchButton.disabled = false;
  watchButton.textContent = `WATCH ADS — +${AD_REWARD_TOKENS} TOKENS`;

  watchButton.addEventListener("click", async () => {
    watchButton.disabled = true;
    try {
      await startSmartlinkAd();
    } catch (error) {
      watchButton.disabled = false;
      setStatus(error?.message || "Unable to start the advertisement.");
      showModal();
    }
  });

  close?.addEventListener("click", () => {
    closeSmartlinkModal();
    watchButton.disabled = false;
  });

  cancel?.addEventListener("click", async () => {
    await cancelSmartlinkAd();
  });
}

export function initializeAds() {
  // No provider SDK is loaded here because SmartLink is a normal URL.
  bindSmartlinkAds();
  return { ready: true, provider: "adoperator", mode: "smartlink-session" };
}
