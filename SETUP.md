# Waro App Jo — Step-by-Step Setup Guide

Total time: **~20 minutes**. No Firebase experience needed.
You'll need: a Google account, a GitHub account, and this `waro-app` folder.

Follow these in order. Don't skip steps.

---

## Part 1 — Create your Firebase project (5 min)

### Step 1.1 — Open Firebase Console

Go to **https://console.firebase.google.com/** and sign in with your Google account.

### Step 1.2 — Create a project

1. Click the big **"+ Create a project"** card (or **"Add project"**).
2. **Project name:** type `waro-app` (or any name you want). Accept the Firebase terms. Click **Continue**.
3. **Google Analytics:** you can turn this **off** (slider to the left) — you don't need it. Click **Continue** (or **Create project**).
4. Wait ~30 seconds for it to finish. Click **Continue** when ready.

You should land on the **Project Overview** page, which looks like a dashboard.

---

## Part 2 — Register the web app (3 min)

### Step 2.1 — Add a web app

On the Project Overview page, under "Get started by adding Firebase to your app," click the **`</>`** icon (it means "Web").

### Step 2.2 — Register the app

1. **App nickname:** type `Waro Web` (or anything).
2. **Do NOT** check "Also set up Firebase Hosting." Leave it unchecked.
3. Click **Register app**.

### Step 2.3 — Copy your config

You'll now see a code snippet like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "waro-app-xxxxx.firebaseapp.com",
  projectId: "waro-app-xxxxx",
  storageBucket: "waro-app-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

**Copy just the `firebaseConfig` object** (everything inside the `{ ... }` including the keys).

### Step 2.4 — Paste into `firebase-config.js`

Open `firebase-config.js` in the `waro-app` folder. You'll see:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

**Replace the placeholders** with the values you just copied. Keep the `export const` at the start. Save the file.

Back in the Firebase console, click **Continue to console** to finish the web-app setup.

---

## Part 3 — Enable Email/Password auth (2 min)

### Step 3.1 — Open Authentication

In the Firebase console left sidebar, click **Build → Authentication**.

### Step 3.2 — Get started

Click **"Get started"** in the middle of the page.

### Step 3.3 — Enable Email/Password

1. Under "Native providers," click **Email/Password**.
2. Flip the **first toggle** (Email/Password) to **Enabled**. Leave "Email link (passwordless)" **off**.
3. Click **Save**.

Done. You should now see "Email/Password — Enabled" in the sign-in providers list.

---

## Part 4 — Create Firestore database (3 min)

### Step 4.1 — Open Firestore

In the left sidebar, click **Build → Firestore Database**.

### Step 4.2 — Create the database

1. Click **"Create database"**.
2. **Location:** pick the region closest to your team (e.g., `nam5 (us-central)` for the US). **This cannot be changed later.** Click **Next**.
3. **Security rules:** select **"Start in production mode"** (locked down by default — we'll paste our own rules in the next step). Click **Create** (or **Enable**).
4. Wait ~30 seconds.

### Step 4.3 — Paste the security rules

1. In the Firestore page, click the **Rules** tab at the top.
2. You'll see a code editor with default rules. **Delete everything** in it.
3. Open `firestore.rules` in the `waro-app` folder. Copy the entire contents.
4. Paste into the Firebase editor.
5. Click **Publish**. You should see "Rules successfully published."

---

## Part 5 — Test locally (2 min)

### Step 5.1 — Start a local server

In your terminal:

```bash
cd path/to/waro-app
python3 -m http.server 8000
```

(If you don't have Python, use `npx serve` instead.)

### Step 5.2 — Open the app

Visit **http://localhost:8000** in your browser. You should see the green login screen.

> If you see "Firebase is not configured" in the browser console (F12 → Console), your `firebase-config.js` still has placeholders. Re-check Step 2.4.

### Step 5.3 — Create your admin account

1. Click the **Sign Up** tab.
2. Fill in your name, email, password (6+ chars), and pick your Jamatkhana.
3. Click **Create Account**.
4. You'll see a toast: _"Account created. Awaiting admin approval."_ — that's expected. You are currently `role: "pending"`.

### Step 5.4 — Promote yourself to Super Admin

Back in the Firebase console:

1. Go to **Build → Firestore Database → Data** tab.
2. You'll see a collection called **`users`** with one document inside it. Click the document.
3. You'll see fields: `name`, `email`, `jamatkhana`, `role: "pending"`, `createdAt`.
4. Find the **`role`** field. Click the ✏️ pencil icon next to it (or click the value).
5. Change the value from `pending` to `admin`. Click **Update**.

> You only have to do this manual Firestore edit **once**, for yourself. After that, every other teammate is approved and managed from inside the app itself via the **Users** tab (see Part 7).

### Step 5.5 — Sign in

Go back to your browser (http://localhost:8000).

1. Click the **Sign In** tab.
2. Enter your email and password.
3. You should land on the Dashboard.
4. Tap the **Majlis** tab at the bottom — the 2026 calendar will auto-seed the first time (takes ~2 seconds) and fill up with entries.

If you got this far: **the app works locally**. Now deploy it.

---

## Part 6 — Deploy to GitHub Pages (5 min)

### Step 6.1 — Create a new GitHub repo

1. Go to **https://github.com/new**.
2. **Repository name:** `waro-app` (or whatever you like).
3. **Public or Private:** either works for GitHub Pages on a free account. Public is simpler.
4. Do **NOT** check "Add a README" / ".gitignore" / "license" — your folder already has them.
5. Click **Create repository**.

### Step 6.2 — Push your code

GitHub will show you commands. Use the "push an existing repository" block. In your terminal:

```bash
cd path/to/waro-app
git init
git add .
git commit -m "Initial Waro app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/waro-app.git
git push -u origin main
```

> ⚠️ **Heads up:** Your `firebase-config.js` contains your Firebase `apiKey`. This is OK — Firebase API keys are _not_ secrets; they identify your project, not authenticate access. Access is controlled entirely by your Firestore rules + Authentication settings. (This is explicit in Firebase docs.) If your repo is private, no concern either way.

### Step 6.3 — Enable GitHub Pages

1. In your repo on GitHub, click **Settings** (top right tabs).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment → Source**, pick **"Deploy from a branch."**
4. Under **Branch**, pick `main` and folder `/ (root)`. Click **Save**.
5. Wait 30–90 seconds. Refresh the page. You should see a box that says:
   **"Your site is live at https://YOUR_USERNAME.github.io/waro-app/"**

### Step 6.4 — Authorize the GitHub Pages domain in Firebase

Firebase blocks sign-ins from unknown domains by default, so you have to whitelist yours.

1. Back in the Firebase console → **Build → Authentication**.
2. Click the **Settings** tab (top right).
3. Click **Authorized domains**.
4. Click **Add domain**.
5. Enter `YOUR_USERNAME.github.io` (just the domain, no `https://`, no path).
6. Click **Add**.

### Step 6.5 — Try the live app

Visit `https://YOUR_USERNAME.github.io/waro-app/` on your phone and your laptop. Sign in with your admin account. Add a member. Test the WhatsApp icon on your phone.

---

## Part 7 — Onboard your Waro team (ongoing)

Waro App Jo has three roles (RBAC):

| Role | What they can do |
|------|------------------|
| **Super Admin** (`admin`) | Full access to every Jamatkhana. **Only** role that can manage users (promote, suspend, delete, set scope). |
| **JK Admin** (`jk_admin`) | Cross-JK visibility and edit rights on members / schedules / majlis. Cannot manage other users. Good for regional leads. |
| **Coordinator** (`team`) | Sees and edits only their assigned Jamatkhana (the `scope` field). Cannot see other JKs. |
| _Pending_ (`pending`) | Just signed up — cannot sign in until a Super Admin promotes them. |

A user with **`suspended: true`** cannot sign in at all, regardless of role — an instant off-switch.

### Approving new teammates (the easy way, in-app)

When a new teammate signs up they'll see _"Account created. Awaiting admin approval."_ and can't log in yet. As Super Admin:

1. Sign in to the app and tap the **Users** tab in the bottom nav (only Super Admins see it).
2. Find the new user — pending users are sorted to the top with a gold "Pending approval" tag.
3. Tap **Manage**.
4. Set **Role** to `Coordinator`, `JK Admin`, or `Super Admin`.
5. If Coordinator, set **Jamatkhana scope** to their home JK. (Admins auto-lock to "All Jamatkhanas".)
6. Tap **Save changes**.

That's it — the teammate can now sign in.

### Other actions available from the Users tab

- **Send password reset email** — sends a Firebase reset link to the user's email.
- **Suspend / Unsuspend account** — flips the `suspended` flag. Suspended users are immediately blocked from signing in on their next attempt.
- **Delete user record** — removes their Firestore profile so they lose access. This does **not** delete the underlying Firebase Auth account; to fully remove the login, go to **Firebase Console → Authentication → Users** and delete them there too.

You cannot change your own role, suspend yourself, or delete yourself — this prevents lockouts. If you need to demote or remove the last Super Admin, promote a different user to Super Admin first, then have them do it.

### Manual override (Firebase console)

You can still edit the `users` collection directly in Firestore if needed. Valid values:

- **`role`** — `"admin"` (Super Admin), `"jk_admin"` (JK Admin), `"team"` (Coordinator), or `"pending"`.
- **`scope`** — `"all"` or a JK code. Ignored for admin / jk_admin.
- **`suspended`** — `true` or `false`.

JK codes (case-sensitive): `AUS`, `AUSDT`, `AUSSTH`, `BMT`, `CLJK`, `CSJK`, `CCJK`, `HGJK`, `HQJK`, `HSJK`, `CENTER`, `KATY`, `SAJK`, `SPRING`, `SLJK`.

> ⚠️ **Re-publish `firestore.rules`** after this update — the new rules protect `scope` so users can't change their own scope. Copy the current `firestore.rules` file into the Firebase Console → Firestore → Rules → Publish.

---

## Common gotchas

**"Missing or insufficient permissions" on save**
Your Firestore rules weren't published, or your role is still `pending`. Re-check Part 4.3 and Part 5.4.

**Signup works but login fails silently / kicks me out**
Your role is `pending`. Promote yourself in Firestore. See Step 5.4.

**App shows spinner forever on GitHub Pages**
You probably forgot to add your Pages domain to Authorized domains. See Step 6.4.
Also: check the browser console (F12). If you see `auth/unauthorized-domain`, that confirms it.

**WhatsApp icon opens web.whatsapp.com instead of the app**
Expected on desktop. On mobile (real phone), it opens the WhatsApp app directly. Make sure phone numbers are stored **with country code**: `+17135550123`, not `7135550123`.

**The Majlis calendar didn't auto-populate**
Seed only triggers for admins (Step 5.4). If you're promoted and still see an empty majlis list, sign out and sign back in, then visit the Majlis tab.

**How do I reset my password?**
On the sign-in screen, tap "Forgot password?" You'll get a reset email.

---

## Updating the app later

When you change a file, just:

```bash
git add .
git commit -m "Update X"
git push
```

GitHub Pages redeploys automatically within ~60 seconds.

---

That's it. You're live.
