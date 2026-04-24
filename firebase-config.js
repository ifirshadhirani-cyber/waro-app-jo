// ============================================================
// Firebase configuration
// ============================================================
// HOW TO FILL THIS IN (see README.md for full walkthrough):
// 1. Go to https://console.firebase.google.com/ and create a project.
// 2. In Project Overview → click the web icon (</>) to register a web app.
// 3. Copy the `firebaseConfig` object into this file below.
// 4. In Build → Authentication, enable "Email/Password" sign-in.
// 5. In Build → Firestore Database, create a database in production mode.
// 6. Paste the Firestore security rules from README.md.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TODO: Replace with your Firebase project's config:
export const firebaseConfig = {
  apiKey: "AIzaSyCClRmuXiw66ZXrAfdFJ0ag4N9Mk2HrLao",
  authDomain: "waro-system.firebaseapp.com",
  projectId: "waro-system",
  storageBucket: "waro-system.firebasestorage.app",
  messagingSenderId: "1011457806247",
  appId: "1:1011457806247:web:16321cd3b3600117dcb082"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Log a helpful warning if the config hasn't been filled in
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  console.warn(
    "⚠️ Firebase is not configured yet. Edit firebase-config.js with your project's config. See README.md for instructions."
  );
}
