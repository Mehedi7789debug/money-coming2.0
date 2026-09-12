// ======================================================
// UI HELPERS
// Centralizes toasts, loading states and confirmation dialogs.
// ======================================================

import { escapeHtml } from "./utils.js";

export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const item = document.createElement("div");
  item.className = `toast ${type === "success" ? "success" : type === "error" ? "error" : ""}`;
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => item.remove(), 3500);
}

export function setButtonLoading(button, loading, loadingText = "Loading...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

export function showConfirm({ title, message, confirmText = "Confirm", danger = false }) {
  return new Promise(resolve => {
    const modal = document.getElementById("globalModal");
    if (!modal) return resolve(false);
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(message)}</p>
        <div class="grid grid-2">
          <button class="btn btn-secondary" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const close = result => { modal.className = "modal hidden"; modal.innerHTML = ""; resolve(result); };
    modal.querySelector("[data-cancel]").onclick = () => close(false);
    modal.querySelector("[data-confirm]").onclick = () => close(true);
  });
}

export function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}
