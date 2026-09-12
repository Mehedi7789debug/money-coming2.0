// ======================================================
// TRANSACTION HISTORY
// Reads the immutable-ish ledger visible to the signed-in user.
// ======================================================

import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";

export async function getTransactions(type = "ALL", max = 50) {
  // Reads only transactions belonging to the current UID.
  // No token state is modified.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in.");
  const constraints = [where("uid", "==", uid), orderBy("createdAt", "desc"), limit(max)];
  if (type !== "ALL") constraints.splice(1, 0, where("category", "==", type));
  const snap = await getDocs(query(collection(db, "transactions"), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
