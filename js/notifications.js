// ======================================================
// NOTIFICATIONS
// Reads persistent notifications belonging to the current user.
// ======================================================

import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";

export async function getNotifications(max = 50) {
  // Reads only the signed-in user's notification documents.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in.");
  const snap = await getDocs(query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
