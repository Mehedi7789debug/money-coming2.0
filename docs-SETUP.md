# Beginner Setup Guide — MONEY COMING

## 1. Firebase project

Create a Firebase project in the Firebase Console. Add a Web App and copy its web configuration into `js/config.js`.

## 2. Authentication

Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Enable.

Enable email verification in the app flow. The current registration code sends Firebase's verification email.

## 3. Firestore

Create a production Firestore database. Deploy:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Do not manually grant browser write access to wallet/transaction documents.

## 4. Cloud Functions

Install Firebase CLI and then:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

The functions use Node 20 and region `asia-southeast1`.

## 5. Admin

Admin authorization uses both:

- Firebase Auth custom claim: `admin: true`
- Firestore document: `adminUsers/{uid}`

Set the custom claim only from a trusted environment using Firebase Admin SDK. Never expose an Admin SDK credential in the browser.

## 6. App Check

Create a reCAPTCHA v3 provider for your web app, then set the public site key in your deployment before initializing App Check. App Check reduces abuse from unauthorized clients but does not replace Authentication or Rules.

## 7. Cloudflare Pages

Connect the Git repository to Cloudflare Pages.

For this static project:

- Framework preset: None
- Build command: none
- Output directory: `/`

After deployment, add the Cloudflare hostname to Firebase Authentication -> Settings -> Authorized domains.

## 8. Token economy

Change reward settings in Firestore `settings/app`, but only expose modification through an authenticated admin Cloud Function. Do not give normal users write access.

Suggested initial configuration:

- tokenPerAd: 40
- tokenPerBDT: 200
- minimumWithdrawal: 10000
- dailyAdLimit: 30
- adCooldownSeconds: 15
- referralReward: 100
- dailyBonusRewards: [20,25,30,40,50,60,100]
- wheelRewards: [0,10,20,40,50,80,100,150]

## 9. Rewarded ads

`js/ads.js` is an adapter. Select an approved ad network first. Implement its official client SDK and server-side verification callback/API. Then modify `verifyAdReward` to validate the provider's signed/verified event.

Do not reward from a frontend timer.

## 10. Withdrawals

Initial production workflow:

PENDING -> PROCESSING -> PAID

or

PENDING/PROCESSING -> REJECTED/CANCELLED -> token refund.

Only backend/admin operations can change these states.

## 11. Security checklist

- no client wallet writes
- no client transaction creation
- no client withdrawal status updates
- no client admin checks
- duplicate reward event protection
- server-side daily limits
- server-side wheel result
- server-side withdrawal validation
- App Check
- Auth
- Rules
- audit logs
- least privilege

## 12. Production declaration

Do not call the system fully production-ready until the selected ad provider's official server verification is implemented and tested, payment processing is operational, and the Firebase security/emulator test suite has passed.
