# MONEY COMING

Firebase-backed reward platform architecture using:

- HTML5 / CSS3 / Vanilla JavaScript
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions
- Firebase App Check
- Firestore Security Rules
- Cloudflare Pages

## Important production limitation

The project deliberately does **not** pretend that an ad provider is connected. `functions/index.js` rejects `verifyAdReward` until an approved rewarded-ad provider is integrated using that provider's official server-side verification mechanism.

Likewise, withdrawals initially use a manual admin workflow. The app never claims a payment is successful merely because an admin button was clicked.

## Quick setup

1. Create a Firebase project.
2. Enable Email/Password Authentication.
3. Create Firestore.
4. Add a Web App and copy its public config into `js/config.js`.
5. Install Firebase CLI.
6. Run `firebase login`.
7. Run `firebase use <project-id>`.
8. Run `firebase deploy --only firestore:rules,firestore:indexes,functions`.
9. Host the repository with Cloudflare Pages.
10. Add the Cloudflare production domain to Firebase Authentication > Authorized domains.
11. Configure App Check with a reCAPTCHA v3 public site key and set `window.MC_APPCHECK_SITE_KEY` before production.
12. Create the initial admin custom claim and `adminUsers/{uid}` document using a trusted server/admin script.

## Local development

Use a local HTTP server instead of opening `index.html` directly, because ES modules and `fetch()` of page fragments are restricted under `file://`.

Example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Firebase configuration

`js/config.js` contains public Firebase Web configuration only. Firebase Web config is not a secret; Firestore Rules, Auth and backend authorization provide the actual protection.

Never place these in frontend files:

- Firebase Admin private keys
- service-account JSON
- payment API secrets
- ad verification secrets
- third-party private credentials

## Database

- `users/{uid}`
- `wallets/{uid}`
- `transactions/{transactionId}`
- `adRewards/{rewardId}`
- `withdrawals/{withdrawalId}`
- `dailyBonuses/{uid}`
- `wheelSpins/{spinId}`
- `referrals/{referralId}`
- `notifications/{notificationId}`
- `supportTickets/{ticketId}`
- `settings/{document}`
- `adminUsers/{uid}`
- `auditLogs/{logId}`

## Cloudflare Pages

Build command: none for the static frontend.

Output directory: `/`

For a Git-connected Pages project, keep the repository root as the deployment directory. Firebase Functions remain deployed separately by Firebase CLI.

## Reward architecture

Browser -> Firebase Auth -> legitimate rewarded ad -> provider completion event -> Cloud Function verification -> anti-fraud/limit checks -> Firestore transaction -> wallet + ledger.

The browser never increments a balance.

## Safe testing

Before production:

- use a separate Firebase development project
- keep real ad provider disabled until verification is implemented
- test withdrawal lifecycle with test accounts
- use Firebase Emulator Suite where practical
- verify Firestore Rules with authenticated/non-authenticated test cases
- test duplicate event IDs and repeated requests
- verify rejected withdrawals refund pending tokens

## AdOperator SmartLink session integration

`js/ads.js` contains the supplied AdOperator SmartLink:
`https://wwp.giriuvpn.com/redirect-zone/ad92a6d0`

The current implementation uses a server-controlled 30-second session and a 40-token reward. The reward is created by Cloud Functions only after the server sees that the session duration has elapsed. This does **not** constitute AdOperator conversion verification. Use the reward flow only if your AdOperator publisher account/terms explicitly allow incentivized or rewarded traffic for this SmartLink model.

Cloud Functions added:
- `startSmartlinkSession`
- `completeSmartlinkSession`
- `cancelSmartlinkSession`

The client timer is only UX. Firestore wallet and ledger changes remain backend-only.
