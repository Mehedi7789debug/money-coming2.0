// ======================================================
// SUPPORT
// Creates support tickets through a trusted backend function.
// ======================================================

import { callRewardFunction } from "./rewards.js";

export async function createTicket({ subject, category, message }) {
  // The server authenticates the user and creates the ticket.
  // It does not alter token balances.
  return callRewardFunction("createSupportTicket", { subject, category, message });
}
