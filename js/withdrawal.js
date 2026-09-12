// ======================================================
// WITHDRAWAL
// Client validates for UX, then Cloud Function repeats all security checks.
// ======================================================

import { callRewardFunction } from "./rewards.js";

export async function createWithdrawal({ method, paymentNumber, amountTokens }) {
  // Sends the requested amount to the trusted backend.
  // Backend validates balance, minimum, status, payment method and conflicts,
  // then moves availableTokens -> pendingTokens atomically.
  return callRewardFunction("createWithdrawal", {
    method, paymentNumber, amountTokens: Number(amountTokens)
  });
}
