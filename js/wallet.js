// ======================================================
// WALLET
// Reads the server-controlled wallet. The client never writes balances.
// ======================================================

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { auth } from "./firebase.js";

export async function getWallet() {
  // Reads wallets/{uid}. Security Rules allow the owner to read it,
  // but no client code can arbitrarily modify token fields.
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const snapshot = await getDoc(doc(db, "wallets", user.uid));
  if (!snapshot.exists()) throw new Error("Wallet is not available yet.");
  return snapshot.data();
}
