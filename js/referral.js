// ======================================================
// REFERRAL
// Displays referral information and relies on Cloud Functions for reward logic.
// ======================================================

import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";

export async function getReferralSummary() {
  // Reads the signed-in user's referral code and their referral records.
  // It never grants referral rewards from the browser.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in.");
  const [userSnap, refs] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDocs(query(collection(db, "referrals"), where("referrerUid", "==", uid)))
  ]);
  const data = userSnap.data() || {};
  const records = refs.docs.map(d => d.data());
  return {
    referralCode: data.referralCode || "",
    total: records.length,
    successful: records.filter(r => r.status === "QUALIFIED").length,
    earnings: records.filter(r => r.status === "QUALIFIED").reduce((sum, r) => sum + (r.rewardTokens || 0), 0)
  };
}
