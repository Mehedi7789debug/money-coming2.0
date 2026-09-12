// ======================================================
// PAGE CONTROLLERS
// Small page-level controllers keep business logic out of HTML fragments.
// ======================================================

import { getWallet } from "./wallet.js";
import { getTransactions } from "./history.js";
import { getProfile } from "./profile.js";
import { getReferralSummary } from "./referral.js";
import { getNotifications } from "./notifications.js";
import { createWithdrawal } from "./withdrawal.js";
import { claimDailyBonus } from "./dailyBonus.js";
import { spinLuckyWheel, animateWheel } from "./luckyWheel.js";
import { createTicket } from "./support.js";
import { showToast, setButtonLoading, showConfirm, renderEmpty } from "./ui.js";
import { formatTokens, formatDate, maskPaymentNumber, escapeHtml } from "./utils.js";
import { auth } from "./firebase.js";

export async function initHistory() {
  // Reads transaction ledger and renders it; no financial data is changed.
  const list = document.querySelector("#transactionList");
  const filter = document.querySelector("#historyFilter");
  async function load() {
    list.innerHTML = renderEmpty("Loading...");
    try {
      const rows = await getTransactions(filter.value);
      if (!rows.length) return list.innerHTML = renderEmpty("No transactions yet.");
      list.innerHTML = rows.map(row => `
        <div class="transaction-item">
          <div class="item-icon">${row.amount >= 0 ? "+" : "−"}</div>
          <div class="item-main"><strong>${escapeHtml(row.description || row.type)}</strong><small>${formatDate(row.createdAt)}</small></div>
          <div class="${row.amount >= 0 ? "amount-positive" : "amount-negative"}">${row.amount >= 0 ? "+" : ""}${formatTokens(row.amount)}</div>
        </div>`).join("");
    } catch (e) { list.innerHTML = `<div class="error-state">${escapeHtml(e.message)}</div>`; }
  }
  filter.onchange = load;
  await load();
}

export async function initWithdraw() {
  // Reads wallet/settings for UX, then sends requests to the secure withdrawal function.
  const wallet = await getWallet();
  document.querySelector("#availableTokens").textContent = formatTokens(wallet.availableTokens);
  const form = document.querySelector("#withdrawForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const amount = Number(form.amount.value);
    if (!Number.isInteger(amount) || amount <= 0) return showToast("Enter a valid token amount.", "error");
    setButtonLoading(button, true, "Processing...");
    try {
      const result = await createWithdrawal({
        method: form.method.value,
        paymentNumber: form.paymentNumber.value.trim(),
        amountTokens: amount
      });
      showToast(`Withdrawal ${result.withdrawalId} submitted.`, "success");
      form.reset();
      setButtonLoading(button, false);
    } catch (e) { showToast(e.message || "Withdrawal failed.", "error"); setButtonLoading(button, false); }
  }, { once: true });
}

export async function initProfile() {
  // Reads profile and wallet statistics from Firebase.
  const [profile, wallet] = await Promise.all([getProfile(), getWallet()]);
  document.querySelector("#profileName").textContent = profile?.username || "User";
  document.querySelector("#profileId").textContent = profile?.userId || "—";
  document.querySelector("#profileEmail").textContent = profile?.email || auth.currentUser?.email || "—";
  document.querySelector("#profileStatus").textContent = profile?.status || "—";
  document.querySelector("#profileDate").textContent = formatDate(profile?.createdAt);
  document.querySelector("#profileTotal").textContent = formatTokens(wallet.totalEarned || 0);
  document.querySelector("#profileWithdrawn").textContent = formatTokens(wallet.totalWithdrawn || 0);
  document.querySelector("#profileAds").textContent = formatTokens(wallet.adsWatched || 0);
  document.querySelector("#profileRefs").textContent = formatTokens(wallet.successfulReferrals || 0);
  document.querySelector("#logoutBtn").onclick = () => window.MCLogout?.();
}

export async function initDailyBonus() {
  // Requests a server-side daily bonus claim and displays the returned reward.
  const button = document.querySelector("#claimBonus");
  button.onclick = async () => {
    setButtonLoading(button, true, "Claiming...");
    try {
      const result = await claimDailyBonus();
      showToast(`You earned ${formatTokens(result.rewardTokens)} tokens.`, "success");
      document.querySelector("#bonusResult").textContent = `+${formatTokens(result.rewardTokens)} Tokens`;
    } catch (e) { showToast(e.message || "Bonus unavailable.", "error"); }
    finally { setButtonLoading(button, false); }
  };
}

export async function initLuckyWheel() {
  // Requests the server-selected result, then only animates to that result.
  const button = document.querySelector("#spinButton");
  const wheel = document.querySelector("#wheel");
  button.onclick = async () => {
    setButtonLoading(button, true, "Spinning...");
    try {
      const result = await spinLuckyWheel();
      animateWheel(wheel, Number(result.segmentIndex || 0), Number(result.segmentCount || 8));
      setTimeout(() => {
        document.querySelector("#wheelResult").textContent = `+${formatTokens(result.rewardTokens)} Tokens`;
        showToast(`Lucky Wheel: ${formatTokens(result.rewardTokens)} tokens.`, "success");
      }, 4200);
    } catch (e) { showToast(e.message || "Spin unavailable.", "error"); }
    finally { setTimeout(() => setButtonLoading(button, false), 4300); }
  };
}

export async function initReferral() {
  // Reads referral records and code; reward decisions stay server-side.
  const summary = await getReferralSummary();
  document.querySelector("#referralCode").textContent = summary.referralCode || "—";
  document.querySelector("#refTotal").textContent = summary.total;
  document.querySelector("#refSuccessful").textContent = summary.successful;
  document.querySelector("#refEarnings").textContent = formatTokens(summary.earnings);
  document.querySelector("#copyReferral").onclick = async () => {
    const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(summary.referralCode)}`;
    await navigator.clipboard.writeText(link);
    showToast("Referral link copied.", "success");
  };
}

export async function initNotifications() {
  // Reads persistent notification records from Firebase.
  const list = document.querySelector("#notificationList");
  const rows = await getNotifications();
  list.innerHTML = rows.length ? rows.map(n => `
    <div class="notification-item"><div class="item-icon">🔔</div>
      <div class="item-main"><strong>${escapeHtml(n.title || "Notification")}</strong><small>${escapeHtml(n.message || "")} · ${formatDate(n.createdAt)}</small></div>
    </div>`).join("") : renderEmpty("You're all caught up.");
}

export async function initSupport() {
  // Creates a support ticket through Cloud Functions after basic UX validation.
  const form = document.querySelector("#ticketForm");
  form.onsubmit = async e => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    setButtonLoading(button, true, "Submitting...");
    try {
      const result = await createTicket({
        subject: form.subject.value.trim(),
        category: form.category.value,
        message: form.message.value.trim()
      });
      showToast(`Ticket ${result.ticketId} created.`, "success");
      form.reset();
    } catch (e) { showToast(e.message || "Could not create ticket.", "error"); }
    finally { setButtonLoading(button, false); }
  };
}

export async function initSettings() {
  // Settings are currently preference/account actions; sensitive changes are delegated to Firebase.
  document.querySelector("#resetPassword").onclick = async () => {
    const email = auth.currentUser?.email;
    if (!email) return showToast("No email is available.", "error");
    const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js");
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset email sent.", "success");
  };
  document.querySelector("#logoutSettings").onclick = () => window.MCLogout?.();
}
