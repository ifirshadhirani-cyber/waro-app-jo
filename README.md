# Waro App Jo

A mobile-friendly web app for the Waro team to manage Jamati members who perform
Waros (announcements, Ginan/Qasida, Tasbih, etc.) and schedule them against the
Majlis and regular Jamatkhana calendar.

Built as a **static single-page web app** so it can be hosted free on
**GitHub Pages**, with **Firebase** providing authentication and a shared database.

---

## Features

- **Individual team accounts** — email + password sign-in, admin approval.
- **Member database** — first/last name, gender, email, phone, Jamatkhana, languages, performable Waro categories.
- **WhatsApp click-to-chat** on every member.
- **15 Jamatkhana filter** (Austin, Austin Downtown, Austin South, Beaumont, Clear Lake, College Station, Corpus Christi, Harvest Green, Houston HQ, Houston South, Ismaili Center, Katy, San Antonio, Spring, Sugar Land).
- **10 Waro categories** incl. "Other" with free-text description.
- **4 languages** (English, Urdu, Gujrati, Pharsi) selectable on each scheduled Waro.
- **Schedule calendar** — assign members to days, filter by Jamatkhana, mark as Performed / Missed, track totals.
- **Majlis calendar** — **pre-populated with the full 2026 Southwest US calendar**, fully editable.
- **Mobile-first UI** — bottom-tab navigation, safe-area aware, works great on iPhone/Android home-screen install.

---

## 1. Set up Firebase

1. Go to <https://console.firebase.google.com/> and create a **new project**.
   (Free "Spark" plan is fine.)
2. In **Project Overview**, click the **`</>` Web** icon to register a web app (any nickname, no hosting needed).
3. Copy the `firebaseConfig` object that appears. It looks like:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "waro-app.firebaseapp.com",
     projectId: "waro-app",
     storageBucket: "waro-app.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcd1234"
   };
   ```

4. Open `firebase-config.js` in this project and **replace the placeholder values** with your real config.
5. In the Firebase console sidebar, go to **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
6. Go to **Build → Firestore Database → Create database** → Start in **production mode** (any region).
7. Open the **Rules** tab and paste the rules below, then **Publish**.

### Firestore security rules (paste into Rules tab)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Any authenticated user can read/write their own user profile.
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid;
      // Only admins can change roles / approve team members.
      allow update: if request.auth != null && (
        request.auth.uid == uid && !("role" in request.resource.data.diff(resource.data).affectedKeys())
        || isAdmin()
      );
      allow delete: if isAdmin();
    }

    // Approved team members can manage the database.
    match /members/{id}      { allow read, write: if isTeam(); }
    match /schedules/{id}    { allow read, write: if isTeam(); }
    match /majlis/{id}       { allow read, write: if isTeam(); }

    function isTeam() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ["team", "admin"];
    }
    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
  }
}
```

---

## 2. Bootstrap the first admin

New sign-ups land in Firestore with `role: "pending"` — they **cannot log in** until an admin changes this.
For your very first admin:

1. Sign up through the app using the Sign Up tab (your email + password + Jamatkhana).
2. In the Firebase console, open **Firestore Database → Data → `users`**.
3. Find your user document and change the `role` field from `"pending"` to `"admin"`. Save.
4. Sign in again in the app.

To approve subsequent team members, repeat step 3 but set `role` to `"team"` (or `"admin"` if you want them to have admin powers too).

> The app **automatically seeds the 2026 Majlis calendar** the first time an admin signs in and the Majlis collection is empty.

---

## 3. Deploy to GitHub Pages

1. Create a new repo on GitHub, e.g. `waro-app`.
2. Commit and push all files in this folder to the repo's `main` branch.
3. In the repo, go to **Settings → Pages**.
4. Under **Source**, pick `main` branch and `/ (root)` folder. **Save**.
5. Wait ~1 minute. Your app will be at `https://<your-username>.github.io/waro-app/`.
6. Back in the Firebase console, open **Authentication → Settings → Authorized domains** and add that GitHub Pages domain (e.g. `your-username.github.io`).

That's it — share the URL with your Waro team.

---

## Data model (Firestore collections)

### `users/{uid}`
```
name, email, jamatkhana, role, createdAt
```
- `role`: `"pending"` (awaiting approval), `"team"` (regular), or `"admin"` (can approve others).

### `members/{id}`  — the people who perform waros
```
firstName, lastName, gender, email, phone, jamatkhana,
canPerform: [waro categories],
languages: [English | Urdu | Gujrati | Pharsi],
createdAt, createdBy, updatedAt
```

### `schedules/{id}`  — assignments
```
date: "YYYY-MM-DD",
jamatkhana, waroCategory, otherDescription, language,
memberId, notes,
status: "scheduled" | "performed" | "missed",
createdAt, createdBy, updatedAt
```

### `majlis/{id}`  — majlis calendar
```
date: "YYYY-MM-DD",
name,
type: "festival" | "students" | "chandraat" | "baitul-khayal" | "paanch-baar-saal" | "baitul-khayal-satada" | "jamati-mushkil-assan-satada" | "other",
marker: "K" | "C" | "",
description,
seeded, createdAt
```

---

## Using the app

**Members tab** — tap `+` to add a new member. Each row shows a WhatsApp icon (tap to open WhatsApp with that number). You can filter by Jamatkhana and search by name/email/phone.

**Schedule tab** — tap any day in the calendar to see what's on, then tap "+ Schedule Waro" to assign someone. The member dropdown is filtered to only people from the chosen Jamatkhana who can perform the chosen category. After the event, tap "Performed" or "Missed" — totals roll up on the Dashboard and on each member's row.

**Majlis tab** — pre-populated with the 2026 Southwest US calendar. You can add, edit, or delete any entry. Khushali (K) and Changeover (C) majlis are tagged.

**Dashboard** — counts + next 5 upcoming waros + next 5 upcoming majlis.

---

## Local development

This is plain HTML + CSS + ES modules — no build step. To try it locally:

```bash
cd waro-app
python3 -m http.server 8000
# open http://localhost:8000
```

(Or any other static file server. `file://` won't work because ES modules require an HTTP origin.)

---

## Troubleshooting

- **"Firebase is not configured"** console warning → you haven't filled in `firebase-config.js`.
- **Sign-in works but app immediately signs me out** → your user document's `role` is still `"pending"`. Promote yourself in the Firestore console.
- **Members/schedules don't save** → security rules probably haven't been published, or the role isn't `"team"`/`"admin"`.
- **Forgot password** doesn't arrive → check the Firebase Authentication → Templates settings for the sender domain, and check spam.
- **WhatsApp link opens web.whatsapp.com instead of the app** → expected on desktop; tap on a phone to open the WhatsApp app directly. Make sure phone numbers are saved **with country code** (e.g. `+17135550123`).

---

## License

Internal use by the Waro team.
