# Marvel Rankings

A drag-to-reorder Marvel movie ranking tool, synced across devices via Firebase Firestore.

Firebase's free Spark plan was chosen deliberately over alternatives like Supabase:
it has generous daily quotas that simply reset, with **no inactivity pause or
deletion** — a good fit for an app you might only open a few times a year.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com → **Add project** (free, no credit card).
2. Once created, click the **Web (</>)** icon to register a web app. You don't need
   Hosting or Analytics for this.
3. Firebase will show you a config object — you'll need these six values in step 3.
4. In the left sidebar, go to **Build → Firestore Database → Create database**.
   Choose **Production mode** (we'll set our own rules next) and any region.

## 2. Set Firestore security rules

In Firestore → **Rules**, replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /marvelRankings/{docId} {
      allow read, write: if true;
    }
  }
}
```

Click **Publish**.

**Note on security:** this makes the one document backing this app open to anyone
who has your Firebase config values (which live in the deployed site's JS bundle —
technically visible to anyone who looks). That's an acceptable trade-off for a
personal movie ranking with no sensitive data, but don't reuse this open-rules
pattern for anything private.

## 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the six values from your Firebase config
(step 1.3):

```bash
cp .env.example .env
```

## 4. Run it locally (optional, to test)

```bash
npm install
npm run dev
```

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/marvel-rankings.git
git push -u origin main
```

(Create the empty `marvel-rankings` repo on GitHub first, under your account —
don't initialize it with a README, to avoid a merge conflict.)

## 6. Deploy to Vercel (free)

1. Go to vercel.com → **Add New Project** → import the `marvel-rankings` GitHub repo.
2. Vercel auto-detects Vite — no config changes needed.
3. Under **Environment Variables**, add all six `VITE_FIREBASE_*` values from step 3.
4. Deploy. You'll get a `marvel-rankings-xxxx.vercel.app` URL that works identically
   on your phone and laptop, staying in sync through Firestore — and it'll still be
   there whenever you next open it, no matter how long the gap.

Bookmark the URL / add it to your phone's home screen for quick access.
