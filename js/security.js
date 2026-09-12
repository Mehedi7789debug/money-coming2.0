// ======================================================
// SECURITY UX
// Central place for client-visible account restriction messaging.
// Backend Rules/Functions remain the real enforcement layer.
// ======================================================

export function restrictionMessage(status) {
  if (status === "LIMITED" || status === "SUSPENDED" || status === "BANNED") {
    return "Your account is currently restricted. Please contact support if you believe this is a mistake.";
  }
  return "";
}
