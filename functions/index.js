// ======================================================
// MONEY COMING — CLOUD FUNCTIONS
// Sensitive business logic lives here, not in browser JavaScript.
// ======================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { initializeApp } = require("firebase-admin/app");
const crypto = require("crypto");

initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 20 });

const db = getFirestore();

// ======================================================
// CENTRALIZED REWARD SETTINGS
// Values are read from settings/app so admins can configure them.
// These defaults are used only when the settings document is absent.
// ======================================================
const DEFAULT_SETTINGS = {
  tokenPerAd: 40,
  tokenPerBDT: 200,
  minimumWithdrawal: 10000,
  dailyAdLimit: 30,
  adCooldownSeconds: 15,
  referralReward: 100,
  dailyBonusRewards: [20,25,30,40,50,60,100],
  wheelRewards: [0,10,20,40,50,80,100,150],
  wheelDailyLimit: 1
};

async function getSettings() {
  // Reads public reward configuration from Firestore.
  const snap = await db.doc("settings/app").get();
  return { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}) };
}

function requireUser(request) {
  // Verifies that Firebase Authentication supplied an authenticated caller.
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Please sign in.");
  return request.auth.uid;
}

async function getUser(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Account profile is unavailable.");
  const user = snap.data();
  if (["SUSPENDED","BANNED"].includes(user.status)) {
    throw new HttpsError("permission-denied", "Your account is currently restricted.");
  }
  return user;
}

function randomId(prefix) {
  // Generates a non-secret server-side reference identifier.
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

async function createLedgerEntry(tx, data) {
  // Adds a token ledger entry inside the same Firestore transaction as the wallet change.
  const ref = db.collection("transactions").doc();
  tx.set(ref, {
    id: ref.id,
    createdAt: FieldValue.serverTimestamp(),
    ...data
  });
  return ref.id;
}

// ======================================================
// USER PROFILE CREATION
// Called immediately after Firebase Auth registration.
// ======================================================
exports.createUserProfile = onCall(async request => {
  const uid = requireUser(request);
  const username = String(request.data?.username || "").trim();
  const referralCode = String(request.data?.referralCode || "").trim().toUpperCase();

  if (!/^[A-Za-z0-9_ .-]{3,30}$/.test(username)) {
    throw new HttpsError("invalid-argument", "Invalid username.");
  }

  const authUser = await getAuth().getUser(uid);
  const existing = await db.doc(`users/${uid}`).get();
  if (existing.exists) return { ok: true, alreadyCreated: true };

  const settings = await getSettings();
  const userId = await allocatePublicUserId();
  const ownReferralCode = `MC-${username.replace(/[^A-Za-z0-9]/g,"").slice(0,10).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  let referredBy = null;
  if (referralCode) {
    const refQuery = await db.collection("users").where("referralCode", "==", referralCode).limit(1).get();
    if (!refQuery.empty && refQuery.docs[0].id !== uid) referredBy = refQuery.docs[0].id;
  }

  const userRef = db.doc(`users/${uid}`);
  const walletRef = db.doc(`wallets/${uid}`);
  const batch = db.batch();

  batch.set(userRef, {
    uid, userId, username, email: authUser.email || "",
    referralCode: ownReferralCode, referredBy,
    status: "ACTIVE",
    emailVerified: Boolean(authUser.emailVerified),
    createdAt: FieldValue.serverTimestamp(),
    lastLogin: FieldValue.serverTimestamp()
  });
  batch.set(walletRef, {
    availableTokens: 0, pendingTokens: 0, totalEarned: 0, totalWithdrawn: 0,
    todayEarned: 0, adsToday: 0, adsWatched: 0, successfulReferrals: 0,
    dailyAdDate: null, lastRewardAt: null, updatedAt: FieldValue.serverTimestamp()
  });
  if (referredBy) {
    const referralRef = db.collection("referrals").doc();
    batch.set(referralRef, {
      id: referralRef.id, referrerUid: referredBy, referredUid: uid,
      code: referralCode, status: "REGISTERED",
      rewardTokens: Number(settings.referralReward) || 100,
      createdAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
  return { ok: true, userId };
});

async function allocatePublicUserId() {
  // Allocates a user-facing MC ID in a transaction to avoid duplicate IDs.
  const counterRef = db.doc("settings/counters");
  let allocated;
  await db.runTransaction(async tx => {
    const snap = await tx.get(counterRef);
    const next = Number(snap.exists ? snap.data().nextUserNumber : 100001);
    allocated = `MC${next}`;
    tx.set(counterRef, { nextUserNumber: next + 1 }, { merge: true });
  });
  return allocated;
}

// ======================================================
// ADOPERATOR SMARTLINK SESSION REWARD
// ------------------------------------------------------
// This is a server-controlled 30-second session. It does NOT
// claim that AdOperator verified an ad completion. It only
// verifies the MONEY COMING session duration and one-time use.
// Use only when your provider/account terms explicitly permit
// incentivized rewards for this traffic model.
// ======================================================
const SMARTLINK_SESSION_SECONDS = 30;
const SMARTLINK_REWARD_TOKENS = 40;
const SMARTLINK_SESSION_MAX_SECONDS = 300;

exports.startSmartlinkSession = onCall(async request => {
  const uid = requireUser(request);
  const user = await getUser(uid);
  if (user.status !== "ACTIVE") throw new HttpsError("permission-denied", "Earning is restricted.");

  const settings = await getSettings();
  const rewardTokens = Number(settings.tokenPerAd ?? SMARTLINK_REWARD_TOKENS);
  const requiredSeconds = Math.max(1, Number(request.data?.sessionSeconds || SMARTLINK_SESSION_SECONDS));
  if (requiredSeconds !== SMARTLINK_SESSION_SECONDS) {
    throw new HttpsError("invalid-argument", "Invalid ad session duration.");
  }

  const walletRef = db.doc(`wallets/${uid}`);
  const sessionRef = db.collection("adSessions").doc();
  const now = Timestamp.now();
  const today = now.toDate().toISOString().slice(0, 10);

  await db.runTransaction(async tx => {
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new HttpsError("failed-precondition", "Wallet is unavailable.");

    const wallet = walletSnap.data() || {};
    const storedDate = wallet.dailyAdDate || null;
    const adsToday = storedDate === today ? Number(wallet.adsToday || 0) : 0;
    const dailyLimit = Number(settings.dailyAdLimit || 30);

    if (adsToday >= dailyLimit) {
      throw new HttpsError("resource-exhausted", "Daily ad limit reached.");
    }

    const lastRewardAt = wallet.lastRewardAt;
    if (lastRewardAt?.toMillis) {
      const elapsed = (now.toMillis() - lastRewardAt.toMillis()) / 1000;
      const cooldown = Number(settings.adCooldownSeconds || 15);
      if (elapsed < cooldown) {
        throw new HttpsError("resource-exhausted", `Please wait ${Math.ceil(cooldown - elapsed)} seconds before watching another ad.`);
      }
    }

    const activeId = wallet.activeAdSessionId;
    const activeStarted = wallet.activeAdSessionStartedAt;
    if (activeId && activeStarted?.toMillis) {
      const activeAge = (now.toMillis() - activeStarted.toMillis()) / 1000;
      if (activeAge < SMARTLINK_SESSION_MAX_SECONDS) {
        throw new HttpsError("already-exists", "An advertisement session is already active.");
      }
    }

    tx.set(sessionRef, {
      uid,
      provider: "adoperator",
      type: "SMARTLINK_SESSION",
      rewardTokens,
      requiredSeconds: SMARTLINK_SESSION_SECONDS,
      startedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + SMARTLINK_SESSION_MAX_SECONDS * 1000),
      status: "STARTED",
      claimed: false,
      createdAt: now
    });

    tx.set(walletRef, {
      activeAdSessionId: sessionRef.id,
      activeAdSessionStartedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return {
    ok: true,
    sessionId: sessionRef.id,
    sessionSeconds: SMARTLINK_SESSION_SECONDS,
    rewardTokens
  };
});

exports.completeSmartlinkSession = onCall(async request => {
  const uid = requireUser(request);
  const user = await getUser(uid);
  if (user.status !== "ACTIVE") throw new HttpsError("permission-denied", "Earning is restricted.");

  const sessionId = String(request.data?.sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid ad session.");
  }

  const settings = await getSettings();
  const walletRef = db.doc(`wallets/${uid}`);
  const sessionRef = db.doc(`adSessions/${sessionId}`);
  const now = Timestamp.now();
  const today = now.toDate().toISOString().slice(0, 10);
  let rewardTokens = 0;

  await db.runTransaction(async tx => {
    const [sessionSnap, walletSnap] = await Promise.all([tx.get(sessionRef), tx.get(walletRef)]);
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Ad session not found.");
    if (!walletSnap.exists) throw new HttpsError("failed-precondition", "Wallet is unavailable.");

    const session = sessionSnap.data() || {};
    const wallet = walletSnap.data() || {};
    if (session.uid !== uid) throw new HttpsError("permission-denied", "Invalid ad session owner.");
    if (session.claimed || session.status !== "STARTED") {
      throw new HttpsError("already-exists", "This ad session has already been used.");
    }
    if (wallet.activeAdSessionId !== sessionId) {
      throw new HttpsError("failed-precondition", "This ad session is no longer active.");
    }

    const startedAt = session.startedAt;
    if (!startedAt?.toMillis) throw new HttpsError("failed-precondition", "Invalid ad session timestamp.");

    const elapsedSeconds = (now.toMillis() - startedAt.toMillis()) / 1000;
    const requiredSeconds = Number(session.requiredSeconds || SMARTLINK_SESSION_SECONDS);
    if (elapsedSeconds < requiredSeconds) {
      throw new HttpsError("failed-precondition", `Please keep the advertisement open for ${Math.ceil(requiredSeconds - elapsedSeconds)} more seconds.`);
    }
    if (session.expiresAt?.toMillis && now.toMillis() > session.expiresAt.toMillis()) {
      throw new HttpsError("deadline-exceeded", "Ad session expired. Please start again.");
    }

    const storedDate = wallet.dailyAdDate || null;
    const adsToday = storedDate === today ? Number(wallet.adsToday || 0) : 0;
    const dailyLimit = Number(settings.dailyAdLimit || 30);
    if (adsToday >= dailyLimit) throw new HttpsError("resource-exhausted", "Daily ad limit reached.");

    rewardTokens = Number(session.rewardTokens ?? settings.tokenPerAd ?? SMARTLINK_REWARD_TOKENS);
    if (!Number.isFinite(rewardTokens) || rewardTokens <= 0) {
      throw new HttpsError("failed-precondition", "Invalid reward configuration.");
    }

    const newAdsToday = adsToday + 1;
    tx.update(walletRef, {
      availableTokens: Number(wallet.availableTokens || 0) + rewardTokens,
      totalEarned: Number(wallet.totalEarned || 0) + rewardTokens,
      todayEarned: Number(wallet.todayEarned || 0) + rewardTokens,
      adsToday: newAdsToday,
      adsWatched: Number(wallet.adsWatched || 0) + 1,
      dailyAdDate: today,
      lastRewardAt: now,
      activeAdSessionId: FieldValue.delete(),
      activeAdSessionStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });

    tx.update(sessionRef, {
      status: "COMPLETED",
      claimed: true,
      completedAt: now,
      elapsedSeconds: Math.floor(elapsedSeconds),
      updatedAt: FieldValue.serverTimestamp()
    });

    const rewardRef = db.collection("adRewards").doc();
    tx.set(rewardRef, {
      id: rewardRef.id,
      uid,
      provider: "adoperator",
      method: "smartlink_session",
      sessionId,
      rewardTokens,
      status: "COMPLETED",
      createdAt: FieldValue.serverTimestamp()
    });

    await createLedgerEntry(tx, {
      uid,
      type: "AD_REWARD",
      category: "EARNINGS",
      amount: rewardTokens,
      description: "AdOperator SmartLink session reward",
      status: "COMPLETED",
      referenceId: sessionId
    });
  });

  return { ok: true, rewardTokens };
});

exports.cancelSmartlinkSession = onCall(async request => {
  const uid = requireUser(request);
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "Invalid ad session.");

  const sessionRef = db.doc(`adSessions/${sessionId}`);
  const walletRef = db.doc(`wallets/${uid}`);
  const now = Timestamp.now();

  await db.runTransaction(async tx => {
    const [sessionSnap, walletSnap] = await Promise.all([tx.get(sessionRef), tx.get(walletRef)]);
    if (!sessionSnap.exists || !walletSnap.exists) return;

    const session = sessionSnap.data() || {};
    const wallet = walletSnap.data() || {};
    if (session.uid !== uid) throw new HttpsError("permission-denied", "Invalid ad session owner.");
    if (session.status !== "STARTED" || session.claimed) return;
    if (wallet.activeAdSessionId !== sessionId) return;

    tx.update(sessionRef, {
      status: "CANCELLED",
      cancelledAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.update(walletRef, {
      activeAdSessionId: FieldValue.delete(),
      activeAdSessionStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

// ======================================================
// REWARDED AD VERIFICATION
// IMPORTANT: This function intentionally rejects provider events until
// an approved ad network's official server-side verification is integrated.
// ======================================================
exports.verifyAdReward = onCall(async request => {
  const uid = requireUser(request);
  await getUser(uid);
  const event = request.data?.providerEvent;
  if (!event || !event.eventId || !event.provider) {
    throw new HttpsError("invalid-argument", "Invalid reward event.");
  }

  // TODO: CONNECT APPROVED AD PROVIDER.
  // Verify event authenticity with the provider's documented server API/callback.
  // Never trust a client-only "completed": true field.
  throw new HttpsError("failed-precondition", "Rewarded ad provider verification is not configured.");
});

// ======================================================
// DAILY BONUS
// Server decides streak and reward; wallet + ledger are atomic.
// ======================================================
exports.claimDailyBonus = onCall(async request => {
  const uid = requireUser(request);
  const user = await getUser(uid);
  if (user.status !== "ACTIVE") throw new HttpsError("permission-denied", "Earning is restricted.");
  const settings = await getSettings();
  const bonusRef = db.doc(`dailyBonuses/${uid}`);
  const walletRef = db.doc(`wallets/${uid}`);
  const reward = await db.runTransaction(async tx => {
    const [bonusSnap, walletSnap] = await Promise.all([tx.get(bonusRef), tx.get(walletRef)]);
    const today = new Date().toISOString().slice(0,10);
    const old = bonusSnap.exists ? bonusSnap.data() : {};
    if (old.lastClaimDate === today) throw new HttpsError("already-exists", "Daily bonus already claimed today.");

    let streak = Number(old.streak || 0);
    if (old.lastClaimDate) {
      const previous = new Date(`${old.lastClaimDate}T00:00:00Z`);
      const current = new Date(`${today}T00:00:00Z`);
      const days = Math.round((current - previous) / 86400000);
      streak = days === 1 ? (streak % 7) + 1 : 1;
    } else streak = 1;

    const rewards = Array.isArray(settings.dailyBonusRewards) ? settings.dailyBonusRewards : DEFAULT_SETTINGS.dailyBonusRewards;
    const rewardTokens = Number(rewards[streak - 1] ?? rewards[0] ?? 0);
    const wallet = walletSnap.data() || {};
    tx.update(walletRef, {
      availableTokens: Number(wallet.availableTokens || 0) + rewardTokens,
      totalEarned: Number(wallet.totalEarned || 0) + rewardTokens,
      todayEarned: Number(wallet.todayEarned || 0) + rewardTokens,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(bonusRef, { uid, streak, lastClaimDate: today, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await createLedgerEntry(tx, {
      uid, type:"DAILY_BONUS", category:"BONUS", amount:rewardTokens,
      description:`Daily Bonus — Day ${streak}`, status:"COMPLETED",
      referenceId:`daily_${today}`
    });
    return rewardTokens;
  });
  return { rewardTokens: reward };
});

// ======================================================
// LUCKY WHEEL
// Uses a server-side random selection and records the spin idempotently.
// ======================================================
exports.spinLuckyWheel = onCall(async request => {
  const uid = requireUser(request);
  await getUser(uid);
  const settings = await getSettings();
  const rewards = Array.isArray(settings.wheelRewards) ? settings.wheelRewards : DEFAULT_SETTINGS.wheelRewards;
  const today = new Date().toISOString().slice(0,10);
  const spinRef = db.collection("wheelSpins").doc();
  const walletRef = db.doc(`wallets/${uid}`);
  const rewardIndex = crypto.randomInt(0, rewards.length);
  const rewardTokens = Number(rewards[rewardIndex] || 0);

  await db.runTransaction(async tx => {
    const existing = await db.collection("wheelSpins")
      .where("uid","==",uid).where("date","==",today).limit(1).get();
    if (!existing.empty) throw new HttpsError("already-exists", "You have already used today's spin.");

    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() || {};
    tx.set(spinRef, {
      id: spinRef.id, uid, date:today, segmentIndex:rewardIndex,
      segmentCount:rewards.length, rewardTokens, createdAt:FieldValue.serverTimestamp()
    });
    if (rewardTokens > 0) {
      tx.update(walletRef, {
        availableTokens:Number(wallet.availableTokens||0)+rewardTokens,
        totalEarned:Number(wallet.totalEarned||0)+rewardTokens,
        todayEarned:Number(wallet.todayEarned||0)+rewardTokens,
        updatedAt:FieldValue.serverTimestamp()
      });
      await createLedgerEntry(tx, {
        uid,type:"LUCKY_WHEEL",category:"BONUS",amount:rewardTokens,
        description:`Lucky Wheel — ${rewardTokens} Tokens`,status:"COMPLETED",referenceId:spinRef.id
      });
    }
  });
  return { rewardTokens, segmentIndex:rewardIndex, segmentCount:rewards.length };
});

// ======================================================
// WITHDRAWAL CREATION
// Atomically moves available tokens into pending tokens.
// ======================================================
exports.createWithdrawal = onCall(async request => {
  const uid = requireUser(request);
  const user = await getUser(uid);
  if (user.status !== "ACTIVE") throw new HttpsError("permission-denied", "Withdrawal is restricted.");

  const method = String(request.data?.method || "");
  const paymentNumber = String(request.data?.paymentNumber || "").trim();
  const amountTokens = Number(request.data?.amountTokens);
  const allowedMethods = ["bKash","Nagad","Rocket"];
  const settings = await getSettings();

  if (!allowedMethods.includes(method)) throw new HttpsError("invalid-argument", "Invalid payment method.");
  if (!/^(01)[0-9]{9}$/.test(paymentNumber)) throw new HttpsError("invalid-argument", "Invalid payment number.");
  if (!Number.isInteger(amountTokens) || amountTokens < Number(settings.minimumWithdrawal)) {
    throw new HttpsError("invalid-argument", "Minimum withdrawal has not been reached.");
  }

  const withdrawalRef = db.collection("withdrawals").doc();
  const walletRef = db.doc(`wallets/${uid}`);
  const bdtAmount = amountTokens / Number(settings.tokenPerBDT || 200);

  await db.runTransaction(async tx => {
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() || {};
    const available = Number(wallet.availableTokens || 0);
    if (available < amountTokens) throw new HttpsError("failed-precondition", "Insufficient balance.");

    const conflictSnap = await db.collection("withdrawals")
      .where("uid","==",uid).where("status","in",["PENDING","PROCESSING"]).limit(1).get();
    if (!conflictSnap.empty) throw new HttpsError("failed-precondition", "A withdrawal is already being processed.");

    tx.update(walletRef, {
      availableTokens: available - amountTokens,
      pendingTokens: Number(wallet.pendingTokens || 0) + amountTokens,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(withdrawalRef, {
      id:withdrawalRef.id, uid, tokenAmount:amountTokens, bdtAmount,
      method, paymentNumber, maskedPaymentNumber:`${paymentNumber.slice(0,2)}******${paymentNumber.slice(-4)}`,
      status:"PENDING", createdAt:FieldValue.serverTimestamp()
    });
    await createLedgerEntry(tx, {
      uid,type:"WITHDRAWAL",category:"WITHDRAWAL",amount:-amountTokens,
      description:`Withdrawal Request — ${bdtAmount} BDT`,status:"PENDING",
      referenceId:withdrawalRef.id
    });
  });

  return { withdrawalId: withdrawalRef.id, bdtAmount };
});

// ======================================================
// SUPPORT TICKET
// ======================================================
exports.createSupportTicket = onCall(async request => {
  const uid = requireUser(request);
  await getUser(uid);
  const subject = String(request.data?.subject || "").trim();
  const category = String(request.data?.category || "OTHER");
  const message = String(request.data?.message || "").trim();
  if (!subject || !message || subject.length > 100 || message.length > 2000) {
    throw new HttpsError("invalid-argument", "Please provide a valid support message.");
  }
  const ref = db.collection("supportTickets").doc();
  await ref.set({
    id:ref.id, uid, subject, category, message,
    status:"OPEN", createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()
  });
  return { ticketId: ref.id };
});

// ======================================================
// ADMIN SESSION
// Uses Firebase Auth custom claim. The callable also checks adminUsers/{uid}.
// ======================================================
exports.getAdminSession = onCall(async request => {
  const uid = requireUser(request);
  if (request.auth.token.admin !== true) return { isAdmin:false };
  const snap = await db.doc(`adminUsers/${uid}`).get();
  if (!snap.exists) return { isAdmin:false };
  return { isAdmin:true, role:snap.data().role || "admin" };
});

// ======================================================
// ADMIN WITHDRAWAL STATE MACHINE
// All transitions are validated server-side and audited.
// ======================================================
exports.adminUpdateWithdrawal = onCall(async request => {
  const uid = requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied","Admin only.");
  const roleSnap = await db.doc(`adminUsers/${uid}`).get();
  if (!roleSnap.exists) throw new HttpsError("permission-denied","Admin only.");

  const withdrawalId = String(request.data?.withdrawalId || "");
  const nextStatus = String(request.data?.status || "");
  const allowed = ["PROCESSING","PAID","REJECTED","CANCELLED"];
  if (!allowed.includes(nextStatus)) throw new HttpsError("invalid-argument","Invalid status.");

  const withdrawalRef = db.doc(`withdrawals/${withdrawalId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(withdrawalRef);
    if (!snap.exists) throw new HttpsError("not-found","Withdrawal not found.");
    const w = snap.data();
    const walletRef = db.doc(`wallets/${w.uid}`);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() || {};
    const current = w.status;

    if (nextStatus === "PROCESSING" && current !== "PENDING") throw new HttpsError("failed-precondition","Invalid state transition.");
    if (["PAID","REJECTED","CANCELLED"].includes(nextStatus) && !["PENDING","PROCESSING"].includes(current)) {
      throw new HttpsError("failed-precondition","Invalid state transition.");
    }

    const pending = Number(wallet.pendingTokens || 0);
    if (nextStatus === "PAID") {
      tx.update(walletRef, {
        pendingTokens:Math.max(0,pending-Number(w.tokenAmount||0)),
        totalWithdrawn:Number(wallet.totalWithdrawn||0)+Number(w.tokenAmount||0),
        updatedAt:FieldValue.serverTimestamp()
      });
    } else if (nextStatus === "REJECTED" || nextStatus === "CANCELLED") {
      tx.update(walletRef, {
        pendingTokens:Math.max(0,pending-Number(w.tokenAmount||0)),
        availableTokens:Number(wallet.availableTokens||0)+Number(w.tokenAmount||0),
        updatedAt:FieldValue.serverTimestamp()
      });
      await createLedgerEntry(tx, {
        uid:w.uid,type:"WITHDRAWAL_REFUND",category:"WITHDRAWAL",amount:Number(w.tokenAmount||0),
        description:"Withdrawal refunded",status:"COMPLETED",referenceId:withdrawalId
      });
    }
    tx.update(withdrawalRef, {
      status:nextStatus, updatedAt:FieldValue.serverTimestamp(), processedBy:uid
    });
    const auditRef = db.collection("auditLogs").doc();
    tx.set(auditRef, {
      adminUid:uid, action:"WITHDRAWAL_STATUS_CHANGE", targetUid:w.uid,
      referenceId:withdrawalId, fromStatus:current, toStatus:nextStatus,
      createdAt:FieldValue.serverTimestamp()
    });
  });
  return { ok:true };
});

// ======================================================
// ADMIN BALANCE ADJUSTMENT
// Every manual adjustment creates a ledger entry and audit log.
// ======================================================
exports.adminAdjustBalance = onCall(async request => {
  const adminUid = requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied","Admin only.");
  const targetUid = String(request.data?.targetUid || "");
  const amount = Number(request.data?.amount);
  const reason = String(request.data?.reason || "").trim();
  if (!targetUid || !Number.isInteger(amount) || amount === 0 || !reason) {
    throw new HttpsError("invalid-argument","Invalid adjustment.");
  }

  await db.runTransaction(async tx => {
    const walletRef = db.doc(`wallets/${targetUid}`);
    const snap = await tx.get(walletRef);
    if (!snap.exists) throw new HttpsError("not-found","Wallet not found.");
    const wallet = snap.data();
    const next = Number(wallet.availableTokens||0) + amount;
    if (next < 0) throw new HttpsError("failed-precondition","Adjustment would make balance negative.");
    tx.update(walletRef,{availableTokens:next,updatedAt:FieldValue.serverTimestamp()});
    await createLedgerEntry(tx,{
      uid:targetUid,type:"ADMIN_ADJUSTMENT",category:"EARNINGS",amount,
      description:`Admin adjustment: ${reason}`,status:"COMPLETED",referenceId:randomId("adjust")
    });
    const auditRef = db.collection("auditLogs").doc();
    tx.set(auditRef,{
      adminUid,action:"BALANCE_ADJUSTMENT",targetUid,reason,amount,
      createdAt:FieldValue.serverTimestamp()
    });
  });
  return { ok:true };
});

// ======================================================
// REFERRAL QUALIFICATION HOOK
// Call this only from a trusted qualifying activity flow.
// ======================================================
exports.processReferral = onCall(async request => {
  const uid = requireUser(request);
  await getUser(uid);
  const referralQuery = await db.collection("referrals").where("referredUid","==",uid).limit(1).get();
  if (referralQuery.empty) return { qualified:false };
  const referralRef = referralQuery.docs[0].ref;
  const settings = await getSettings();
  const walletRef = db.doc(`wallets/${referralQuery.docs[0].data().referrerUid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(referralRef);
    if (!snap.exists || snap.data().status === "QUALIFIED") return;
    const referral = snap.data();
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() || {};
    const reward = Number(settings.referralReward || 0);
    tx.update(referralRef,{status:"QUALIFIED",qualifiedAt:FieldValue.serverTimestamp(),rewardTokens:reward});
    tx.update(walletRef,{
      availableTokens:Number(wallet.availableTokens||0)+reward,
      totalEarned:Number(wallet.totalEarned||0)+reward,
      todayEarned:Number(wallet.todayEarned||0)+reward,
      successfulReferrals:Number(wallet.successfulReferrals||0)+1,
      updatedAt:FieldValue.serverTimestamp()
    });
    await createLedgerEntry(tx,{
      uid:referral.referrerUid,type:"REFERRAL_REWARD",category:"REFERRAL",
      amount:reward,description:"Referral reward",status:"COMPLETED",referenceId:referralRef.id
    });
  });
  return { qualified:true };
});
