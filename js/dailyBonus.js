// ======================================================
// DAILY BONUS
// UI requests the reward; Cloud Function decides eligibility and amount.
// ======================================================

import { callRewardFunction } from "./rewards.js";

export async function claimDailyBonus() {
  // Reads no client balance and writes no wallet fields.
  // Server validates one claim per calendar day and updates wallet + ledger atomically.
  return callRewardFunction("claimDailyBonus");
}
