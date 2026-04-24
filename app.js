// ============================================================
// Waro App Jo — main application logic
// ============================================================
import { auth, db, firebaseConfig } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  getAuth as getAuthForSecondary,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  JAMATKHANAS, WARO_CATEGORIES, LANGUAGES, GENDERS, AGE_RANGES,
  WARO_STATUS, DEFAULT_MAJLIS_2026, MAJLIS_NOTES_2026,
} from "./data.js";

// ============================================================
// Global state
// ============================================================
const state = {
  user: null,           // Firebase auth user
  profile: null,        // Team member profile doc
  currentPage: "dashboard",
  members: [],
  schedules: [],
  majlis: [],
  users: [],            // populated only for Super Admin
  unsubs: [],           // Firestore snapshot unsubscribes
  calendarMonth: new Date(),   // Schedule calendar month
  majlisMonth: new Date(),     // Majlis calendar month
  filters: {
    jamatkhana: "",     // selected JK code from chips
    search: "",         // name / email / phone search
    jkSearch: "",       // narrows the JK chip row
    waroCategory: "",   // advanced: what member can perform
    gender: "",
    ageRange: "",
    language: "",
    advancedOpen: false,
    userSearch: "",     // Users page search
  },
};

// DOM caches for pages that need to preserve live inputs across
// Firestore-snapshot refreshes (so the search input doesn't lose focus).
const pageCache = {
  members: null,   // { root, refreshList }
};

// ============================================================
// Tiny DOM helpers
// ============================================================
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ============================================================
// Toast & modal
// ============================================================
function toast(message, variant = "success", ms = 3000) {
  const root = $("#toast-root");
  const node = el("div", { class: `toast ${variant}` }, message);
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .2s";
    setTimeout(() => node.remove(), 200);
  }, ms);
}

function showModal({ title, body, footer, onClose }) {
  const root = $("#modal-root");
  const overlay = el("div", { class: "modal-overlay" });
  const modal = el("div", { class: "modal" });
  const header = el("div", { class: "modal-header" },
    el("h3", {}, title),
    el("button", {
      class: "icon-btn", "aria-label": "Close", onclick: close,
      html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    }),
  );
  const bodyEl = el("div", { class: "modal-body" });
  if (typeof body === "string") bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  modal.appendChild(header);
  modal.appendChild(bodyEl);
  if (footer) {
    const footerEl = el("div", { class: "modal-footer" });
    footer.forEach(btn => footerEl.appendChild(btn));
    modal.appendChild(footerEl);
  }
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  root.appendChild(overlay);

  function close() {
    overlay.remove();
    onClose?.();
  }
  return { close, body: bodyEl, modal };
}

function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise(resolve => {
    const cancel = el("button", { class: "btn btn-secondary", onclick: () => { m.close(); resolve(false); } }, "Cancel");
    const ok = el("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onclick: () => { m.close(); resolve(true); } }, confirmLabel);
    const m = showModal({ title, body: el("p", {}, message), footer: [cancel, ok], onClose: () => resolve(false) });
  });
}

// ============================================================
// Utility: date / strings
// ============================================================
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}
function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function monthLabel(d) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}
function isoToFriendly(iso) {
  return parseISODate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function initials(first, last) {
  return `${(first || "?").charAt(0)}${(last || "").charAt(0)}`.toUpperCase();
}
function normalizePhone(phone) {
  return (phone || "").replace(/[^0-9+]/g, "");
}
function whatsappLink(phone, message = "") {
  const num = normalizePhone(phone).replace(/^\+/, "");
  const url = `https://wa.me/${num}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}
function jamatkhanaName(code) {
  return JAMATKHANAS.find(j => j.code === code)?.name || code || "—";
}

// ============================================================
// Role + scope helpers  (RBAC)
// ============================================================
// Roles:
//   "admin"    — Super Admin (full control, incl. user management)
//   "jk_admin" — JK Admin (sees all JKs, but can't manage users)
//   "team"     — Coordinator (sees only their assigned JK[s])
//   "pending"  — Awaiting approval (cannot sign in)
//
// Scope (for "team" role):
//   "all"       — sees every JK (implicit for admin / jk_admin)
//   "<JK code>" — sees only that JK
//   (later: array of codes for multi-JK coordinators)
//
// A `suspended: true` flag immediately blocks sign-in regardless of role.
function isSuperAdmin() { return state.profile?.role === "admin"; }
function isJKAdmin()    { return state.profile?.role === "jk_admin"; }
function isCoordinator(){ return state.profile?.role === "team"; }
function isAdmin()      { return isSuperAdmin() || isJKAdmin(); }   // back-compat: anyone with cross-JK visibility

function roleLabel(role) {
  switch (role) {
    case "admin":    return "Super Admin";
    case "jk_admin": return "JK Admin";
    case "team":     return "Coordinator";
    case "pending":  return "Pending";
    default:         return role || "—";
  }
}

function profileScope() {
  // Super Admin & JK Admin see everything.
  if (isSuperAdmin() || isJKAdmin()) return null;
  const s = state.profile?.scope;
  if (!s || s === "all") return null;
  return s;
}
function matchesScope(record) {
  const jk = profileScope();
  if (!jk) return true;
  return (record?.jamatkhana || "") === jk;
}
function visibleMembers()   { return state.members.filter(matchesScope); }
function visibleSchedules() { return state.schedules.filter(matchesScope); }

// ============================================================
// Auth
// ============================================================
function initAuthView() {
  // Tab switching
  $$(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".auth-tab").forEach(b => b.classList.toggle("active", b === btn));
      const tab = btn.dataset.tab;
      $("#login-form").classList.toggle("hidden", tab !== "login");
      $("#signup-form").classList.toggle("hidden", tab !== "signup");
    });
  });

  // Fill jamatkhana select on signup form
  const sel = $('select[name="jamatkhana"]', $("#signup-form"));
  JAMATKHANAS.forEach(j => {
    sel.appendChild(el("option", { value: j.code }, `${j.name} (${j.code})`));
  });

  // Login
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $("#login-error");
    err.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
    }
  });

  // Signup
  $("#signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $("#signup-error");
    err.textContent = "";
    try {
      const cred = await createUserWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: fd.get("name"),
        email: fd.get("email"),
        jamatkhana: fd.get("jamatkhana"),      // user-selected home JK (informational)
        scope: fd.get("jamatkhana"),           // default scope = their JK until admin promotes
        role: "pending",                       // Super Admin must promote: team / jk_admin / admin
        suspended: false,
        createdAt: serverTimestamp(),
      });
      toast("Account created. Awaiting admin approval.", "success", 4500);
    } catch (ex) {
      err.textContent = friendlyAuthError(ex);
    }
  });

  // Forgot password
  $("#forgot-password-btn").addEventListener("click", async () => {
    const email = $('input[name="email"]', $("#login-form")).value;
    if (!email) return toast("Enter your email first", "warning");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Password reset email sent", "success");
    } catch (ex) {
      toast(friendlyAuthError(ex), "error");
    }
  });
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found for that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already exists for that email.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
  };
  return map[code] || err?.message || "Something went wrong.";
}

onAuthStateChanged(auth, async (user) => {
  $("#loading").classList.add("hidden");
  if (!user) {
    showAuthView();
    return;
  }
  state.user = user;
  // Fetch profile
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    state.profile = snap.exists() ? snap.data() : null;

    // Gate: must be approved
    if (!state.profile || state.profile.role === "pending") {
      await signOut(auth);
      toast("Your account is awaiting admin approval.", "warning", 5000);
      return;
    }
    // Gate: suspended accounts can't sign in
    if (state.profile.suspended === true) {
      await signOut(auth);
      toast("Your account has been suspended. Contact an administrator.", "error", 6000);
      return;
    }
  } catch (ex) {
    console.error(ex);
    toast("Couldn't load your profile", "error");
    return;
  }
  showAppView();
});

function showAuthView() {
  $("#auth-view").classList.remove("hidden");
  $("#app-view").classList.add("hidden");
  // Tear down any Firestore listeners
  state.unsubs.forEach(u => { try { u(); } catch {} });
  state.unsubs = [];
}

function showAppView() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");

  // User chip reflects role + scope
  const chip = $("#user-chip");
  const scope = profileScope();
  const name = state.profile?.name || state.user.email;
  const label = roleLabel(state.profile?.role);
  chip.textContent = scope
    ? `${name} · ${scope}`
    : `${name} · ${label}`;
  const chipClass = isSuperAdmin() ? "admin"
                  : isJKAdmin()    ? "jkadmin"
                  : scope          ? "scope"
                  : "";
  chip.className = "user-chip " + chipClass;

  // Users tab — show only for Super Admin
  const usersBtn = $('.nav-btn[data-page="users"]');
  if (usersBtn) usersBtn.classList.toggle("hidden", !isSuperAdmin());

  // Wire nav buttons (idempotent)
  $$(".nav-btn").forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.page);
  });
  $("#logout-btn").onclick = () => signOut(auth);

  subscribeData();
  navigate("dashboard");
}

// ============================================================
// Firestore listeners
// ============================================================
function subscribeData() {
  // Members
  state.unsubs.push(onSnapshot(
    query(collection(db, "members"), orderBy("lastName")),
    (snap) => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderIfPage("members");
      renderIfPage("dashboard");
      renderIfPage("schedule");
    },
    (err) => console.error("members snapshot", err)
  ));

  // Schedules
  state.unsubs.push(onSnapshot(
    query(collection(db, "schedules"), orderBy("date")),
    (snap) => {
      state.schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderIfPage("schedule");
      renderIfPage("dashboard");
    },
    (err) => console.error("schedules snapshot", err)
  ));

  // Majlis
  state.unsubs.push(onSnapshot(
    query(collection(db, "majlis"), orderBy("date")),
    async (snap) => {
      state.majlis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Seed the default 2026 calendar on first run
      if (state.majlis.length === 0 && isSuperAdmin()) {
        await seedDefaultMajlis();
      }
      renderIfPage("majlis");
      renderIfPage("dashboard");
      renderIfPage("schedule");
    },
    (err) => console.error("majlis snapshot", err)
  ));

  // Users — only Super Admin can read the full users collection.
  if (isSuperAdmin()) {
    state.unsubs.push(onSnapshot(
      query(collection(db, "users"), orderBy("name")),
      (snap) => {
        state.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderIfPage("users");
      },
      (err) => console.error("users snapshot", err)
    ));
  }
}

async function seedDefaultMajlis() {
  try {
    const batch = writeBatch(db);
    DEFAULT_MAJLIS_2026.forEach(m => {
      const ref = doc(collection(db, "majlis"));
      batch.set(ref, { ...m, seeded: true, createdAt: serverTimestamp() });
    });
    await batch.commit();
    toast("Seeded 2026 Majlis calendar", "success");
  } catch (ex) {
    console.error(ex);
  }
}

// ============================================================
// Routing
// ============================================================
function navigate(page) {
  // Only Super Admin can see the Users page — hard-guard against deep links.
  if (page === "users" && !isSuperAdmin()) page = "dashboard";
  state.currentPage = page;
  // Bust any page caches so controls are rebuilt fresh on nav
  pageCache.members = null;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = {
    dashboard: "Dashboard", members: "Members", schedule: "Schedule",
    majlis: "Majlis Calendar", users: "Users",
  };
  $("#page-title").textContent = titles[page] || "Waro";
  render();
}

function renderIfPage(page) {
  if (state.currentPage !== page) return;
  // Members: preserve live controls (esp. search input focus) across
  // Firestore snapshots by only refreshing the list container.
  if (page === "members" && pageCache.members) {
    pageCache.members.refreshList();
    return;
  }
  render();
}

function render() {
  const root = $("#page-content");
  root.innerHTML = "";
  const page = state.currentPage;
  if (page === "dashboard") renderDashboard(root);
  else if (page === "members") renderMembers(root);
  else if (page === "schedule") renderSchedule(root);
  else if (page === "majlis") renderMajlis(root);
  else if (page === "users") renderUsers(root);
}

// ============================================================
// Dashboard
// ============================================================
function renderDashboard(root) {
  const today = toISODate(new Date());
  const members   = visibleMembers();
  const schedules = visibleSchedules();
  const scope     = profileScope();

  if (scope) {
    root.appendChild(el("div", { class: "scope-banner" },
      `Showing data for ${jamatkhanaName(scope)} only`
    ));
  }

  const upcomingSchedules = schedules
    .filter(s => s.date >= today && s.status === WARO_STATUS.SCHEDULED)
    .slice(0, 5);
  const upcomingMajlis = state.majlis
    .filter(m => m.date >= today)
    .slice(0, 5);

  const totalPerformed = schedules.filter(s => s.status === WARO_STATUS.PERFORMED).length;
  const totalMissed    = schedules.filter(s => s.status === WARO_STATUS.MISSED).length;

  root.appendChild(el("div", { class: "stats-grid" },
    stat("Members", members.length, scope ? `in ${scope}` : "in database"),
    stat("Upcoming", upcomingSchedules.length, "waros scheduled"),
    stat("Performed", totalPerformed, "all time"),
    stat("Missed", totalMissed, "all time"),
  ));

  // Demographics section
  root.appendChild(el("div", { class: "section-header" },
    el("h2", {}, "Demographics"),
    el("span", { class: "subtitle" }, `${members.length} member${members.length === 1 ? "" : "s"}`)
  ));
  if (members.length === 0) {
    root.appendChild(emptyState("📊", "No data yet", "Add members to see demographics."));
  } else {
    root.appendChild(renderDemographics(members, { includeJK: !scope }));
  }

  // Upcoming Waros
  root.appendChild(el("div", { class: "section-header" }, el("h2", {}, "Upcoming Waros")));
  if (upcomingSchedules.length === 0) {
    root.appendChild(emptyState("📅", "No upcoming waros", "Schedule a waro from the Schedule tab."));
  } else {
    upcomingSchedules.forEach(s => root.appendChild(scheduleCard(s, { compact: true })));
  }

  // Upcoming Majlis
  root.appendChild(el("div", { class: "section-header" }, el("h2", {}, "Upcoming Majlis")));
  if (upcomingMajlis.length === 0) {
    root.appendChild(emptyState("🕌", "No upcoming majlis", "Add or review majlis dates in the Majlis tab."));
  } else {
    upcomingMajlis.forEach(m => root.appendChild(majlisCard(m, { compact: true })));
  }
}

// ------------------------------------------------------------
// Demographics rendering (horizontal bar charts + donut)
// ------------------------------------------------------------
function renderDemographics(members, { includeJK = true } = {}) {
  const wrap = el("div", { class: "demographics-grid" });

  // Gender donut (stats card style, with big ring + legend)
  const byGender = countBy(members, m => m.gender || "—");
  wrap.appendChild(demoCard("Gender", `${members.length}`, donut(byGender, {
    Male: "var(--forest-600)",
    Female: "#b63f74",
    "Prefer not to say": "var(--ink-400)",
    "—": "var(--ink-300)",
  })));

  // Age range bars (fixed order)
  const byAge = orderedCount(members, m => m.ageRange, AGE_RANGES);
  const ageTotal = byAge.reduce((s, [, v]) => s + v, 0);
  wrap.appendChild(demoCard("Age range", `${ageTotal}`,
    barChart(byAge, { color: "gold" })));

  // Languages bars
  const langMap = new Map(LANGUAGES.map(l => [l, 0]));
  members.forEach(m => (m.languages || []).forEach(l => langMap.set(l, (langMap.get(l) || 0) + 1)));
  const langCounts = [...langMap.entries()];
  const langTotal = langCounts.reduce((s, [, v]) => s + v, 0);
  wrap.appendChild(demoCard("Languages", `${langTotal}`,
    barChart(langCounts, { color: "blue" })));

  // Waro capabilities — full-width card (more room for long labels)
  const capsMap = new Map(WARO_CATEGORIES.map(c => [c, 0]));
  members.forEach(m => (m.canPerform || []).forEach(c => capsMap.set(c, (capsMap.get(c) || 0) + 1)));
  const capsCounts = [...capsMap.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  wrap.appendChild(demoCard("Waros covered", `${capsCounts.length} / ${WARO_CATEGORIES.length}`,
    barChart(capsCounts, { color: "default" }), { full: true }));

  // Jamatkhana bars (only when showing multiple JKs)
  if (includeJK) {
    const jkMap = new Map();
    members.forEach(m => jkMap.set(m.jamatkhana, (jkMap.get(m.jamatkhana) || 0) + 1));
    const jkCounts = [...jkMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => [jamatkhanaName(code), n]);
    wrap.appendChild(demoCard("By Jamatkhana", `${jkCounts.length}`,
      barChart(jkCounts, { color: "default" }), { full: true }));
  }

  return wrap;
}

function demoCard(title, metric, bodyNode, { full = false } = {}) {
  const card = el("div", { class: "demo-card" + (full ? " full" : "") });
  card.appendChild(el("div", { class: "demo-card-head" },
    el("div", { class: "demo-eyebrow" }, title),
    metric ? el("div", { class: "demo-metric" }, String(metric)) : null,
  ));
  card.appendChild(bodyNode);
  return card;
}

function countBy(arr, keyFn) {
  const map = new Map();
  arr.forEach(x => {
    const k = keyFn(x) || "—";
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function orderedCount(arr, keyFn, order) {
  const map = new Map(order.map(k => [k, 0]));
  arr.forEach(x => {
    const k = keyFn(x);
    if (k && map.has(k)) map.set(k, map.get(k) + 1);
  });
  return [...map.entries()];
}

function barChart(entries, { color = "default" } = {}) {
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const wrap = el("div", { class: "bar-list" });
  if (entries.length === 0) {
    wrap.appendChild(el("div", { class: "bar-empty" }, "No data yet"));
    return wrap;
  }
  entries.forEach(([label, val]) => {
    const pct = Math.round((val / max) * 100);
    const share = total ? Math.round((val / total) * 100) : 0;
    const row = el("div", { class: "bar-row" },
      el("div", { class: "bar-header" },
        el("span", { class: "bar-label", title: label }, label),
        el("span", { class: "bar-value" },
          el("span", { class: "bar-count" }, String(val)),
          el("span", { class: "bar-pct" }, `${share}%`),
        ),
      ),
      el("div", { class: "bar-track" },
        el("div", { class: `bar-fill ${color !== "default" ? color : ""}`, style: `width:${pct}%` })
      ),
    );
    wrap.appendChild(row);
  });
  return wrap;
}

function donut(entries, colorMap = {}) {
  // Larger SVG donut, serif center total, vertical legend on the side.
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const size = 140, radius = 56, stroke = 20, circ = 2 * Math.PI * radius;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "donut-svg");
  // Background ring
  const bg = document.createElementNS(svgNS, "circle");
  bg.setAttribute("cx", size/2); bg.setAttribute("cy", size/2); bg.setAttribute("r", radius);
  bg.setAttribute("fill", "none"); bg.setAttribute("stroke", "var(--ivory-500)");
  bg.setAttribute("stroke-width", stroke);
  svg.appendChild(bg);
  // Slices
  let offset = 0;
  entries.forEach(([label, val]) => {
    const share = val / total;
    const dash = share * circ;
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", size/2); c.setAttribute("cy", size/2); c.setAttribute("r", radius);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", colorMap[label] || "var(--forest-600)");
    c.setAttribute("stroke-width", stroke);
    c.setAttribute("stroke-linecap", "butt");
    c.setAttribute("stroke-dasharray", `${dash} ${circ - dash}`);
    c.setAttribute("stroke-dashoffset", String(-offset));
    c.setAttribute("transform", `rotate(-90 ${size/2} ${size/2})`);
    svg.appendChild(c);
    offset += dash;
  });
  // Center number (serif)
  const t = document.createElementNS(svgNS, "text");
  t.setAttribute("x", size/2); t.setAttribute("y", size/2 - 2);
  t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "middle");
  t.setAttribute("font-family", "Playfair Display, Georgia, serif");
  t.setAttribute("font-size", "36"); t.setAttribute("font-weight", "700");
  t.setAttribute("fill", "var(--forest-900)");
  t.textContent = String(total);
  svg.appendChild(t);
  // Center caption
  const caption = document.createElementNS(svgNS, "text");
  caption.setAttribute("x", size/2); caption.setAttribute("y", size/2 + 22);
  caption.setAttribute("text-anchor", "middle");
  caption.setAttribute("font-family", "inherit");
  caption.setAttribute("font-size", "9"); caption.setAttribute("font-weight", "700");
  caption.setAttribute("letter-spacing", "1.4");
  caption.setAttribute("fill", "var(--gold-700)");
  caption.textContent = "TOTAL";
  svg.appendChild(caption);

  const legend = el("div", { class: "demo-donut-legend" },
    ...entries.map(([label, val]) => {
      const share = total ? Math.round((val / total) * 100) : 0;
      return el("div", { class: "legend-item" },
        el("div", { class: "legend-swatch", style: `background:${colorMap[label] || "var(--forest-600)"}` }),
        el("span", { class: "legend-label" }, label),
        el("span", { class: "legend-value" }, `${val}`),
        el("span", { class: "legend-pct" }, `${share}%`),
      );
    })
  );
  const wrap = el("div", { class: "demo-donut" });
  wrap.appendChild(svg);
  wrap.appendChild(legend);
  return wrap;
}

function stat(label, value, sub) {
  return el("div", { class: "stat-card" },
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value)),
    el("div", { class: "stat-sub" }, sub),
  );
}

function emptyState(icon, title, msg) {
  return el("div", { class: "empty-state" },
    el("div", { class: "icon" }, icon),
    el("h3", {}, title),
    el("p", {}, msg),
  );
}

// ============================================================
// Members
// ============================================================
// Important: the controls section (search, JK chips, advanced filters)
// is built ONCE per page visit. Typing into the search input and changing
// filters only re-renders the list container — the controls DOM is
// preserved, so the input keeps focus as the user types.
function renderMembers(root) {
  const scope = profileScope();

  if (scope) {
    root.appendChild(el("div", { class: "scope-banner" },
      `Showing ${jamatkhanaName(scope)} members only`
    ));
  }

  // ---------- Controls wrapper (persists across filter changes) ----------
  const controlsWrap = el("div", { class: "members-controls" });
  const listContainer = el("div", { class: "members-list" });

  // --- Main search input ---
  const searchInput = el("input", {
    type: "text",
    placeholder: "Search name, email, phone…",
    value: state.filters.search,
    autocomplete: "off",
  });
  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    refreshList();
  });
  controlsWrap.appendChild(el("div", { class: "search-bar" }, searchInput));

  // --- Jamatkhana search + chips (only when unscoped) ---
  let chipsContainer = null;
  let jkSearchInput = null;
  if (!scope) {
    jkSearchInput = el("input", {
      type: "text",
      placeholder: "Search Jamatkhanas…",
      value: state.filters.jkSearch || "",
      autocomplete: "off",
    });
    jkSearchInput.addEventListener("input", () => {
      state.filters.jkSearch = jkSearchInput.value;
      refreshChips();
    });
    controlsWrap.appendChild(el("div", { class: "search-bar search-bar-sm jk-search" }, jkSearchInput));

    chipsContainer = el("div", { class: "filter-chips" });
    controlsWrap.appendChild(chipsContainer);
    refreshChips();
  }

  function refreshChips() {
    if (!chipsContainer) return;
    chipsContainer.innerHTML = "";
    const q = (state.filters.jkSearch || "").trim().toLowerCase();
    const filteredJKs = JAMATKHANAS.filter(j =>
      !q || j.name.toLowerCase().includes(q) || j.code.toLowerCase().includes(q)
    );
    chipsContainer.appendChild(filterChip("All", !state.filters.jamatkhana, () => {
      state.filters.jamatkhana = "";
      refreshChips();
      refreshList();
    }));
    filteredJKs.forEach(j => {
      chipsContainer.appendChild(filterChip(j.name, state.filters.jamatkhana === j.code, () => {
        state.filters.jamatkhana = j.code;
        refreshChips();
        refreshList();
      }));
    });
    if (filteredJKs.length === 0) {
      chipsContainer.appendChild(el("span", { class: "no-match-hint" }, "No Jamatkhanas match"));
    }
  }

  // --- Advanced filters panel ---
  const toggleBtn = el("button", {
    class: "filters-toggle", type: "button",
    "aria-expanded": state.filters.advancedOpen ? "true" : "false",
  });
  const toggleLabel = el("span", { class: "ft-label" },
    el("span", { class: "ft-icon",
      html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`
    }),
    el("span", {}, "Advanced filters"),
  );
  const toggleBadge = el("span", { class: "filters-badge hidden" });
  const chevron = el("span", { class: "ft-chevron" },
    el("span", { html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>` })
  );
  toggleBtn.appendChild(toggleLabel);
  toggleBtn.appendChild(toggleBadge);
  toggleBtn.appendChild(chevron);

  const filtersPanel = el("div", { class: "filters-panel" + (state.filters.advancedOpen ? " open" : "") });

  const catSelect = el("select", {},
    el("option", { value: "" }, "Any waro"),
    ...WARO_CATEGORIES.map(c => el("option", { value: c, selected: state.filters.waroCategory === c }, c)),
  );
  catSelect.addEventListener("change", () => {
    state.filters.waroCategory = catSelect.value;
    refreshList(); updateBadge();
  });

  const genderSelect = el("select", {},
    el("option", { value: "" }, "Any gender"),
    ...GENDERS.map(g => el("option", { value: g, selected: state.filters.gender === g }, g)),
  );
  genderSelect.addEventListener("change", () => {
    state.filters.gender = genderSelect.value;
    refreshList(); updateBadge();
  });

  const ageSelect = el("select", {},
    el("option", { value: "" }, "Any age"),
    ...AGE_RANGES.map(a => el("option", { value: a, selected: state.filters.ageRange === a }, a)),
  );
  ageSelect.addEventListener("change", () => {
    state.filters.ageRange = ageSelect.value;
    refreshList(); updateBadge();
  });

  const langSelect = el("select", {},
    el("option", { value: "" }, "Any language"),
    ...LANGUAGES.map(l => el("option", { value: l, selected: state.filters.language === l }, l)),
  );
  langSelect.addEventListener("change", () => {
    state.filters.language = langSelect.value;
    refreshList(); updateBadge();
  });

  const clearBtn = el("button", { class: "btn btn-sm btn-ghost", type: "button" }, "Clear filters");
  clearBtn.onclick = () => {
    state.filters.waroCategory = "";
    state.filters.gender = "";
    state.filters.ageRange = "";
    state.filters.language = "";
    state.filters.search = "";
    state.filters.jamatkhana = "";
    state.filters.jkSearch = "";
    catSelect.value = "";
    genderSelect.value = "";
    ageSelect.value = "";
    langSelect.value = "";
    searchInput.value = "";
    if (jkSearchInput) jkSearchInput.value = "";
    refreshChips();
    refreshList();
    updateBadge();
  };

  filtersPanel.appendChild(el("div", { class: "filters-grid" },
    el("label", { class: "filter-field" }, el("span", {}, "Waro"), catSelect),
    el("label", { class: "filter-field" }, el("span", {}, "Gender"), genderSelect),
    el("label", { class: "filter-field" }, el("span", {}, "Age"), ageSelect),
    el("label", { class: "filter-field" }, el("span", {}, "Language"), langSelect),
  ));
  filtersPanel.appendChild(el("div", { class: "filters-actions" }, clearBtn));

  toggleBtn.addEventListener("click", () => {
    state.filters.advancedOpen = !state.filters.advancedOpen;
    const open = state.filters.advancedOpen;
    filtersPanel.classList.toggle("open", open);
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  controlsWrap.appendChild(el("div", { class: "filters-bar" }, toggleBtn));
  controlsWrap.appendChild(filtersPanel);

  function updateBadge() {
    const n = [
      state.filters.waroCategory, state.filters.gender,
      state.filters.ageRange, state.filters.language,
    ].filter(Boolean).length;
    if (n === 0) {
      toggleBadge.classList.add("hidden");
      toggleBadge.textContent = "";
    } else {
      toggleBadge.classList.remove("hidden");
      toggleBadge.textContent = String(n);
    }
  }
  updateBadge();

  // ---------- List ----------
  const resultCount = el("div", { class: "result-count" });

  function refreshList() {
    listContainer.innerHTML = "";
    const filtered = applyMemberFilters();
    resultCount.textContent = `${filtered.length} member${filtered.length === 1 ? "" : "s"}`;
    listContainer.appendChild(resultCount);
    if (filtered.length === 0) {
      const hasAnyFilter =
        state.filters.search ||
        state.filters.jamatkhana ||
        state.filters.waroCategory ||
        state.filters.gender ||
        state.filters.ageRange ||
        state.filters.language;
      listContainer.appendChild(hasAnyFilter
        ? emptyState("🔍", "No matches", "Adjust filters or clear them to see everyone.")
        : emptyState("👥", "No members yet", "Tap + to add your first member."));
    } else {
      filtered.forEach(m => listContainer.appendChild(memberRow(m)));
    }
  }

  root.appendChild(controlsWrap);
  root.appendChild(listContainer);
  refreshList();

  // Store handles so Firestore snapshots can refresh just the list
  pageCache.members = { root, refreshList };

  // FAB
  root.appendChild(el("button", {
    class: "fab", title: "Add member", "aria-label": "Add member",
    onclick: () => openMemberForm(),
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  }));
}

function applyMemberFilters() {
  const scope = profileScope();
  const q = (state.filters.search || "").trim().toLowerCase();
  const { jamatkhana, waroCategory, gender, ageRange, language } = state.filters;
  return visibleMembers().filter(m => {
    if (!scope && jamatkhana && m.jamatkhana !== jamatkhana) return false;
    if (waroCategory && !(m.canPerform || []).includes(waroCategory)) return false;
    if (gender && m.gender !== gender) return false;
    if (ageRange && m.ageRange !== ageRange) return false;
    if (language && !(m.languages || []).includes(language)) return false;
    if (q) {
      const hay = `${m.firstName || ""} ${m.lastName || ""} ${m.email || ""} ${m.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function filterChip(label, active, onClick) {
  return el("button", { class: `chip ${active ? "active" : ""}`, onclick: onClick }, label);
}

function memberRow(m) {
  const count = state.schedules.filter(s => s.memberId === m.id && s.status === WARO_STATUS.PERFORMED).length;
  const waLink = whatsappLink(m.phone);
  const isFemale = (m.gender || "").toLowerCase() === "female";
  const avatar = el("div", { class: `avatar ${isFemale ? "female" : ""}` }, initials(m.firstName, m.lastName));
  const subParts = [
    el("span", {}, jamatkhanaName(m.jamatkhana)),
    m.ageRange ? el("span", { class: "dot-sep" }, "•") : null,
    m.ageRange ? el("span", {}, m.ageRange) : null,
    el("span", { class: "dot-sep" }, "•"),
    el("span", {}, `${count} waros`),
  ].filter(Boolean);
  const row = el("div", { class: "member-row" },
    avatar,
    el("div", { class: "member-info" },
      el("div", { class: "member-name" }, `${m.firstName || ""} ${m.lastName || ""}`.trim()),
      el("div", { class: "member-sub" }, ...subParts),
    ),
    el("div", { class: "member-actions" },
      // WhatsApp
      m.phone ? el("a", {
        class: "whatsapp-icon", href: waLink, target: "_blank", rel: "noopener", title: "Open in WhatsApp",
        "aria-label": "WhatsApp",
        html: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11 11 0 0 0 3.6 17.3L2 22l4.8-1.6A11 11 0 1 0 20.5 3.5zm-8.5 17a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.9.9-2.7-.2-.3A9 9 0 1 1 12 20.5zm5.2-6.7c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1s-.7.9-.9 1.1c-.2.2-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.3 8.3 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.2-.5 0-.2 0-.4 0-.5s-.6-1.4-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.5 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/></svg>`
      }) : null,
      el("button", { class: "icon-btn", title: "Edit", onclick: () => openMemberForm(m),
        html: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
      }),
    ),
  );
  return row;
}

function openMemberForm(existing = null) {
  const isEdit = !!existing;
  const scope = profileScope();
  const lockedJk = scope || null;

  const firstName = el("input", { type: "text", required: true, value: existing?.firstName || "" });
  const lastName  = el("input", { type: "text", required: true, value: existing?.lastName || "" });
  const gender    = el("select", { required: true }, ...[
    el("option", { value: "" }, "Select gender…"),
    ...GENDERS.map(g => el("option", { value: g, selected: existing?.gender === g }, g))
  ]);
  const ageRange  = el("select", { required: true }, ...[
    el("option", { value: "" }, "Select age range…"),
    ...AGE_RANGES.map(a => el("option", { value: a, selected: existing?.ageRange === a }, a))
  ]);
  const email     = el("input", { type: "email", value: existing?.email || "" });
  const phone     = el("input", { type: "tel", placeholder: "+1 555 123 4567", value: existing?.phone || "" });
  const jkSelectedValue = existing?.jamatkhana || lockedJk || "";
  const jkSelect  = el("select", { required: true, ...(lockedJk ? { disabled: "" } : {}) }, ...[
    el("option", { value: "" }, "Select Jamatkhana…"),
    ...JAMATKHANAS.map(j => el("option", { value: j.code, selected: jkSelectedValue === j.code }, `${j.name} (${j.code})`))
  ]);

  // Waro categories (checkboxes)
  const caps = new Set(existing?.canPerform || []);
  const capsGrid = el("div", { class: "checkbox-grid" });
  WARO_CATEGORIES.forEach(cat => {
    const pill = el("label", { class: `checkbox-pill ${caps.has(cat) ? "checked" : ""}` });
    const cb = el("input", { type: "checkbox", value: cat, ...(caps.has(cat) ? { checked: "" } : {}) });
    cb.addEventListener("change", () => pill.classList.toggle("checked", cb.checked));
    pill.appendChild(cb);
    pill.appendChild(el("span", {}, cat));
    capsGrid.appendChild(pill);
  });

  // Languages (checkboxes)
  const langs = new Set(existing?.languages || []);
  const langGrid = el("div", { class: "checkbox-grid" });
  LANGUAGES.forEach(lang => {
    const pill = el("label", { class: `checkbox-pill ${langs.has(lang) ? "checked" : ""}` });
    const cb = el("input", { type: "checkbox", value: lang, ...(langs.has(lang) ? { checked: "" } : {}) });
    cb.addEventListener("change", () => pill.classList.toggle("checked", cb.checked));
    pill.appendChild(cb);
    pill.appendChild(el("span", {}, lang));
    langGrid.appendChild(pill);
  });

  const form = el("form", { class: "form-grid" },
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" }, el("label", {}, "First name *"), firstName),
      el("div", { class: "form-row" }, el("label", {}, "Last name *"), lastName),
    ),
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" }, el("label", {}, "Gender *"), gender),
      el("div", { class: "form-row" }, el("label", {}, "Age range *"), ageRange),
    ),
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" },
        el("label", {}, lockedJk ? "Jamatkhana (locked to your scope)" : "Jamatkhana *"),
        jkSelect,
      ),
      el("div", { class: "form-row" }, el("label", {}, "Email"), email),
    ),
    el("div", { class: "form-row" },
      el("label", {}, "Phone (with country code for WhatsApp)"), phone),
    el("div", { class: "form-row" },
      el("label", {}, "Waro categories (what they can perform)"),
      capsGrid,
    ),
    el("div", { class: "form-row" },
      el("label", {}, "Languages"),
      langGrid,
    ),
  );

  const cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
  const save = el("button", { class: "btn btn-primary", type: "button" }, isEdit ? "Save" : "Add Member");
  const delBtn = isEdit ? el("button", {
    class: "btn btn-danger", type: "button", style: "margin-right:auto",
  }, "Delete") : null;

  const modal = showModal({
    title: isEdit ? "Edit member" : "Add member",
    body: form,
    footer: [delBtn, cancel, save].filter(Boolean),
  });
  cancel.onclick = () => modal.close();
  save.onclick = async () => {
    // jkSelect may be disabled when scoped; use locked value instead
    const jkValue = lockedJk || jkSelect.value;
    if (!firstName.value.trim() || !lastName.value.trim() || !gender.value || !ageRange.value || !jkValue) {
      return toast("Please fill the required fields", "warning");
    }
    const payload = {
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      gender: gender.value,
      ageRange: ageRange.value,
      email: email.value.trim(),
      phone: phone.value.trim(),
      jamatkhana: jkValue,
      canPerform: [...capsGrid.querySelectorAll("input:checked")].map(i => i.value),
      languages: [...langGrid.querySelectorAll("input:checked")].map(i => i.value),
      updatedAt: serverTimestamp(),
    };
    try {
      if (isEdit) {
        await updateDoc(doc(db, "members", existing.id), payload);
        toast("Member updated");
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = state.user.uid;
        await addDoc(collection(db, "members"), payload);
        toast("Member added");
      }
      modal.close();
    } catch (ex) {
      console.error(ex);
      toast(ex.message || "Couldn't save", "error");
    }
  };
  if (delBtn) delBtn.onclick = async () => {
    const ok = await confirmDialog({
      title: "Delete member?",
      message: `Are you sure you want to delete ${existing.firstName} ${existing.lastName}? This cannot be undone.`,
      confirmLabel: "Delete", danger: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "members", existing.id));
      toast("Member deleted");
      modal.close();
    } catch (ex) {
      toast(ex.message || "Couldn't delete", "error");
    }
  };
}

// ============================================================
// Schedule page (calendar + tracking)
// ============================================================
function renderSchedule(root) {
  const month = state.calendarMonth;
  const scope = profileScope();

  if (scope) {
    root.appendChild(el("div", { class: "scope-banner" },
      `Showing ${jamatkhanaName(scope)} schedule only`
    ));
  } else {
    // Jamatkhana filter row (only if unscoped)
    const chips = el("div", { class: "filter-chips" });
    chips.appendChild(filterChip("All JKs", !state.filters.jamatkhana, () => {
      state.filters.jamatkhana = ""; render();
    }));
    JAMATKHANAS.forEach(j => {
      chips.appendChild(filterChip(j.code, state.filters.jamatkhana === j.code, () => {
        state.filters.jamatkhana = j.code; render();
      }));
    });
    root.appendChild(chips);
  }

  // Calendar header
  root.appendChild(el("div", { class: "calendar-header" },
    el("h2", {}, monthLabel(month)),
    el("div", { class: "calendar-nav" },
      el("button", { class: "icon-btn", onclick: () => { shiftMonth("calendarMonth", -1); render(); },
        html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
      }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => { state.calendarMonth = new Date(); render(); } }, "Today"),
      el("button", { class: "icon-btn", onclick: () => { shiftMonth("calendarMonth", 1); render(); },
        html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
      }),
    ),
  ));

  // Calendar grid
  const grid = el("div", { class: "calendar-grid" });
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
    grid.appendChild(el("div", { class: "calendar-weekday" }, d));
  });

  const selected = state.selectedDate || toISODate(new Date());
  const days = buildMonthDays(month);
  const filterJk = scope || state.filters.jamatkhana;
  days.forEach(({ date, iso, inMonth, isToday }) => {
    const schedulesHere = state.schedules.filter(s =>
      s.date === iso && (!filterJk || s.jamatkhana === filterJk)
    );
    const majlisHere = state.majlis.filter(m => m.date === iso);
    const dots = el("div", { class: "dots" });
    schedulesHere.forEach(s => {
      const cls = s.status === WARO_STATUS.PERFORMED ? "performed" :
                  s.status === WARO_STATUS.MISSED ? "missed" : "scheduled";
      const majCls = s.ceremony === "majlis" ? " majlis-waro" : "";
      dots.appendChild(el("div", { class: `dot ${cls}${majCls}` }));
    });
    majlisHere.forEach(() => dots.appendChild(el("div", { class: "dot majlis" })));

    const cell = el("button", {
      class: `calendar-day ${inMonth ? "" : "other-month"} ${isToday ? "today" : ""} ${iso === selected ? "selected" : ""}`,
      onclick: () => { state.selectedDate = iso; render(); }
    },
      el("div", { class: "day-num" }, String(date.getDate())),
      dots,
    );
    grid.appendChild(cell);
  });
  root.appendChild(grid);

  // Selected day details
  root.appendChild(el("div", { class: "section-header" },
    el("h2", {}, isoToFriendly(selected)),
  ));

  const dayMajlis = state.majlis.filter(m => m.date === selected);
  dayMajlis.forEach(m => root.appendChild(majlisCard(m)));

  const daySchedules = state.schedules.filter(s => s.date === selected && (!filterJk || s.jamatkhana === filterJk));
  const regularSchedules = daySchedules.filter(s => (s.ceremony || "regular") === "regular");
  const majlisSchedules = daySchedules.filter(s => s.ceremony === "majlis");
  const hasMajlisToday = dayMajlis.length > 0;

  // --- Regular Jamatkhana ceremony waros ---
  root.appendChild(el("div", { class: "ceremony-header" },
    el("h3", {}, "Jamatkhana Ceremony"),
    el("button", {
      class: "btn btn-sm btn-primary",
      onclick: () => openScheduleForm({ date: selected, ceremony: "regular" })
    }, "+ Waro"),
  ));
  if (regularSchedules.length === 0) {
    root.appendChild(emptyState("✨", "No ceremony waros yet", "Tap + Waro to assign one."));
  } else {
    regularSchedules.forEach(s => root.appendChild(scheduleCard(s)));
  }

  // --- Majlis waros (only if a majlis is scheduled that day) ---
  if (hasMajlisToday) {
    root.appendChild(el("div", { class: "ceremony-header majlis" },
      el("h3", {}, "Majlis Waros"),
      el("button", {
        class: "btn btn-sm btn-gold",
        onclick: () => openScheduleForm({ date: selected, ceremony: "majlis" })
      }, "+ Waro"),
    ));
    if (majlisSchedules.length === 0) {
      root.appendChild(emptyState("🕌", "No majlis waros yet", "Tap + Waro to assign one."));
    } else {
      majlisSchedules.forEach(s => root.appendChild(scheduleCard(s)));
    }
  }
}

function buildMonthDays(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = first.getDay();      // 0 = Sunday
  const days = [];
  // previous month fill
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(y, m, -i);
    days.push({ date: d, iso: toISODate(d), inMonth: false, isToday: isSameDay(d, new Date()) });
  }
  // this month
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(y, m, i);
    days.push({ date: d, iso: toISODate(d), inMonth: true, isToday: isSameDay(d, new Date()) });
  }
  // fill to complete 6 rows = 42 cells
  while (days.length % 7 !== 0 || days.length < 42) {
    const last = days[days.length - 1].date;
    const d = new Date(last); d.setDate(last.getDate() + 1);
    days.push({ date: d, iso: toISODate(d), inMonth: false, isToday: isSameDay(d, new Date()) });
  }
  return days;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shiftMonth(key, delta) {
  const d = new Date(state[key]);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  state[key] = d;
}

function scheduleCard(s, { compact = false } = {}) {
  const member = state.members.find(m => m.id === s.memberId);
  const name = member ? `${member.firstName} ${member.lastName}` : "(unknown member)";
  const isMajlis = s.ceremony === "majlis";
  const statusTag =
    s.status === WARO_STATUS.PERFORMED ? el("span", { class: "tag tag-blue" }, "Performed") :
    s.status === WARO_STATUS.MISSED ? el("span", { class: "tag tag-red" }, "Missed") :
    el("span", { class: "tag tag-green" }, "Scheduled");
  const majlisTag = isMajlis ? el("span", { class: "tag tag-gold" }, "Majlis") : null;

  const title = s.waroCategory === "Other" ? `Other: ${s.otherDescription || ""}` : s.waroCategory;

  const actions = el("div", { class: "event-actions" });
  if (!compact) {
    if (s.status === WARO_STATUS.SCHEDULED) {
      actions.appendChild(el("button", { class: "btn btn-sm btn-primary", onclick: () => updateSchedule(s.id, { status: WARO_STATUS.PERFORMED }) }, "Performed"));
      actions.appendChild(el("button", { class: "btn btn-sm btn-secondary", onclick: () => updateSchedule(s.id, { status: WARO_STATUS.MISSED }) }, "Missed"));
    } else {
      actions.appendChild(el("button", { class: "btn btn-sm btn-ghost", onclick: () => updateSchedule(s.id, { status: WARO_STATUS.SCHEDULED }) }, "Reset"));
    }
    actions.appendChild(el("button", {
      class: "icon-btn danger", title: "Delete", onclick: async () => {
        const ok = await confirmDialog({ title: "Delete scheduled waro?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        await deleteDoc(doc(db, "schedules", s.id));
        toast("Deleted");
      },
      html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`
    }));
  } else {
    actions.appendChild(el("button", {
      class: "btn btn-sm btn-ghost", onclick: () => { state.calendarMonth = parseISODate(s.date); state.selectedDate = s.date; navigate("schedule"); }
    }, "Open"));
  }

  return el("div", { class: `event-card${isMajlis ? " majlis-ceremony" : ""}` },
    el("div", { class: `event-stripe${isMajlis ? " majlis" : ""}` }),
    el("div", { class: "event-body" },
      el("div", { class: "event-title" }, title),
      el("div", { class: "event-sub" },
        el("span", {}, name),
        el("span", {}, `• ${jamatkhanaName(s.jamatkhana)}`),
        s.language ? el("span", {}, `• ${s.language}`) : null,
        compact ? el("span", {}, `• ${isoToFriendly(s.date)}`) : null,
        majlisTag,
        statusTag,
      ),
      s.notes ? el("div", { class: "event-sub", style: "margin-top:4px" }, s.notes) : null,
    ),
    actions,
  );
}

async function updateSchedule(id, patch) {
  try {
    await updateDoc(doc(db, "schedules", id), { ...patch, updatedAt: serverTimestamp() });
    toast("Updated", "success", 1500);
  } catch (ex) { toast(ex.message || "Failed", "error"); }
}

function openScheduleForm(initial = {}) {
  const scope = profileScope();
  const lockedJk = scope || null;

  const dateInput = el("input", { type: "date", required: true, value: initial.date || toISODate(new Date()) });

  // ----- Ceremony (Regular / Majlis) segmented picker -----
  const regBtn = el("button", { type: "button", class: "seg-btn active" }, "Jamatkhana Ceremony");
  const majBtn = el("button", { type: "button", class: "seg-btn" }, "Majlis");
  const segmented = el("div", { class: "segmented-control" }, regBtn, majBtn);
  const ceremonyHint = el("div", { class: "form-hint" });

  const majlisSelect = el("select", {}, el("option", { value: "" }, "Select majlis…"));
  const majlisSelectWrap = el("div", { class: "form-row", style: "display:none" },
    el("label", {}, "Which majlis?"),
    majlisSelect,
  );

  let currentCeremony = initial.ceremony === "majlis" ? "majlis" : "regular";
  let currentMajlisId = initial.majlisId || "";

  const availableMajlisOnDate = () => state.majlis.filter(m => m.date === dateInput.value);

  function refreshCeremonyUI() {
    const available = availableMajlisOnDate();

    // Majlis button availability
    if (available.length === 0) {
      majBtn.disabled = true;
      majBtn.title = "No majlis scheduled on this date";
      if (currentCeremony === "majlis") currentCeremony = "regular";
    } else {
      majBtn.disabled = false;
      majBtn.title = "";
    }

    regBtn.classList.toggle("active", currentCeremony === "regular");
    majBtn.classList.toggle("active", currentCeremony === "majlis");

    // Majlis selector visibility & contents
    majlisSelect.innerHTML = "";
    if (currentCeremony === "majlis" && available.length > 1) {
      majlisSelectWrap.style.display = "flex";
      majlisSelect.appendChild(el("option", { value: "" }, "Select majlis…"));
      available.forEach(m => majlisSelect.appendChild(
        el("option", { value: m.id, selected: m.id === currentMajlisId }, m.name)
      ));
    } else {
      majlisSelectWrap.style.display = "none";
      if (currentCeremony === "majlis" && available.length === 1) {
        currentMajlisId = available[0].id;
      } else if (currentCeremony === "regular") {
        currentMajlisId = "";
      }
    }

    // Contextual hint
    if (available.length === 0) {
      ceremonyHint.textContent = "No Majlis on this date — waro will be in the regular Jamatkhana ceremony.";
    } else if (currentCeremony === "majlis") {
      const mj = available.find(m => m.id === currentMajlisId) || available[0];
      ceremonyHint.textContent = `Assigning during the Majlis (${mj.name}).`;
    } else {
      ceremonyHint.textContent = `A Majlis is scheduled this day — switch to "Majlis" to assign a Majlis waro.`;
    }
  }

  regBtn.addEventListener("click", () => {
    currentCeremony = "regular";
    refreshCeremonyUI();
  });
  majBtn.addEventListener("click", () => {
    if (majBtn.disabled) return;
    currentCeremony = "majlis";
    refreshCeremonyUI();
  });
  majlisSelect.addEventListener("change", () => {
    currentMajlisId = majlisSelect.value;
    refreshCeremonyUI();
  });
  dateInput.addEventListener("change", refreshCeremonyUI);

  // ----- Remaining fields -----
  const jkSelect = el("select", { required: true, ...(lockedJk ? { disabled: "" } : {}) },
    el("option", { value: "" }, "Select Jamatkhana…"),
    ...JAMATKHANAS.map(j => el("option", { value: j.code, selected: lockedJk === j.code }, `${j.name} (${j.code})`))
  );
  const catSelect = el("select", { required: true },
    el("option", { value: "" }, "Select category…"),
    ...WARO_CATEGORIES.map(c => el("option", { value: c }, c))
  );
  const otherInput = el("input", { type: "text", placeholder: "Describe 'Other' category" });
  const otherWrap = el("div", { class: "form-row", style: "display:none" }, el("label", {}, "Other — description *"), otherInput);
  catSelect.addEventListener("change", () => {
    otherWrap.style.display = catSelect.value === "Other" ? "flex" : "none";
  });

  const langSelect = el("select", {},
    el("option", { value: "" }, "Select language (optional)"),
    ...LANGUAGES.map(l => el("option", { value: l }, l))
  );

  // Member dropdown — filtered by selected Jamatkhana + category
  const memberSelect = el("select", { required: true }, el("option", { value: "" }, "Select member…"));
  function refreshMembers() {
    const jk = lockedJk || jkSelect.value;
    const cat = catSelect.value;
    memberSelect.innerHTML = "";
    memberSelect.appendChild(el("option", { value: "" }, "Select member…"));
    const filtered = visibleMembers().filter(m => {
      if (jk && m.jamatkhana !== jk) return false;
      if (cat && cat !== "Other" && m.canPerform && m.canPerform.length > 0 && !m.canPerform.includes(cat)) return false;
      return true;
    });
    filtered.forEach(m => {
      memberSelect.appendChild(el("option", { value: m.id }, `${m.firstName} ${m.lastName} (${m.jamatkhana})`));
    });
    if (filtered.length === 0) {
      memberSelect.appendChild(el("option", { value: "", disabled: "" }, "No matching members"));
    }
  }
  jkSelect.addEventListener("change", refreshMembers);
  catSelect.addEventListener("change", refreshMembers);
  refreshMembers();

  const notesInput = el("textarea", { placeholder: "Optional notes" });

  const form = el("form", { class: "form-grid" },
    el("div", { class: "form-row" },
      el("label", {}, "Ceremony *"),
      segmented,
      ceremonyHint,
    ),
    majlisSelectWrap,
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" }, el("label", {}, "Date *"), dateInput),
      el("div", { class: "form-row" }, el("label", {}, "Jamatkhana *"), jkSelect),
    ),
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" }, el("label", {}, "Waro category *"), catSelect),
      el("div", { class: "form-row" }, el("label", {}, "Language"), langSelect),
    ),
    otherWrap,
    el("div", { class: "form-row" }, el("label", {}, "Member *"), memberSelect),
    el("div", { class: "form-row" }, el("label", {}, "Notes"), notesInput),
  );

  refreshCeremonyUI();   // initial evaluation

  const cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
  const save = el("button", { class: "btn btn-primary", type: "button" }, "Schedule");
  const modal = showModal({ title: "Schedule a waro", body: form, footer: [cancel, save] });
  cancel.onclick = () => modal.close();
  save.onclick = async () => {
    const jkValue = lockedJk || jkSelect.value;
    if (!dateInput.value || !jkValue || !catSelect.value || !memberSelect.value) {
      return toast("Fill required fields", "warning");
    }
    if (catSelect.value === "Other" && !otherInput.value.trim()) {
      return toast("Describe the 'Other' category", "warning");
    }
    if (currentCeremony === "majlis" && availableMajlisOnDate().length > 1 && !currentMajlisId) {
      return toast("Pick which majlis this waro is for", "warning");
    }
    try {
      await addDoc(collection(db, "schedules"), {
        date: dateInput.value,
        jamatkhana: jkValue,
        waroCategory: catSelect.value,
        otherDescription: catSelect.value === "Other" ? otherInput.value.trim() : "",
        language: langSelect.value || "",
        memberId: memberSelect.value,
        notes: notesInput.value.trim(),
        status: WARO_STATUS.SCHEDULED,
        ceremony: currentCeremony,
        majlisId: currentCeremony === "majlis" ? (currentMajlisId || null) : null,
        createdAt: serverTimestamp(),
        createdBy: state.user.uid,
      });
      toast("Scheduled");
      modal.close();
    } catch (ex) {
      console.error(ex);
      toast(ex.message || "Couldn't save", "error");
    }
  };
}

// ============================================================
// Majlis page
// ============================================================
function renderMajlis(root) {
  const month = state.majlisMonth;

  // Calendar header
  root.appendChild(el("div", { class: "calendar-header" },
    el("h2", {}, monthLabel(month)),
    el("div", { class: "calendar-nav" },
      el("button", { class: "icon-btn", onclick: () => { shiftMonth("majlisMonth", -1); render(); },
        html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
      }),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => { state.majlisMonth = new Date(); render(); } }, "Today"),
      el("button", { class: "icon-btn", onclick: () => { shiftMonth("majlisMonth", 1); render(); },
        html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
      }),
    ),
  ));

  // List all majlis in current month
  const y = month.getFullYear(), m = month.getMonth();
  const monthMajlis = state.majlis.filter(mj => {
    const d = parseISODate(mj.date);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  if (monthMajlis.length === 0) {
    root.appendChild(emptyState("🕌", "No majlis this month", "Add one using the + button."));
  } else {
    monthMajlis.forEach(mj => root.appendChild(majlisCard(mj)));
  }

  // Notes
  root.appendChild(el("div", { class: "card", style: "margin-top:16px" },
    el("div", { class: "card-title" }, "2026 Notes"),
    el("ul", { style: "margin:0;padding-left:20px;font-size:14px;color:var(--gray-700);line-height:1.5" },
      ...MAJLIS_NOTES_2026.map(n => el("li", {}, n))
    )
  ));

  // FAB
  root.appendChild(el("button", {
    class: "fab", title: "Add majlis", "aria-label": "Add majlis",
    onclick: () => openMajlisForm(),
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  }));
}

function majlisCard(m, { compact = false } = {}) {
  const typeTag = m.marker === "K" ? el("span", { class: "tag tag-gold" }, "Khushali") :
                  m.marker === "C" ? el("span", { class: "tag tag-gold" }, "Changeover") :
                  el("span", { class: "tag tag-green" }, (m.type || "majlis").replace(/-/g, " "));

  const actions = el("div", { class: "event-actions" });
  if (!compact) {
    actions.appendChild(el("button", {
      class: "icon-btn", title: "Edit", onclick: () => openMajlisForm(m),
      html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
    }));
    actions.appendChild(el("button", {
      class: "icon-btn danger", title: "Delete", onclick: async () => {
        const ok = await confirmDialog({ title: "Delete majlis?", message: `Delete "${m.name}" on ${isoToFriendly(m.date)}?`, confirmLabel: "Delete", danger: true });
        if (!ok) return;
        await deleteDoc(doc(db, "majlis", m.id));
        toast("Deleted");
      },
      html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`
    }));
  }

  return el("div", { class: "event-card majlis-event" },
    el("div", { class: "event-stripe majlis" }),
    el("div", { class: "event-body" },
      el("div", { class: "event-title" }, m.name),
      el("div", { class: "event-sub" },
        el("span", {}, isoToFriendly(m.date)),
        typeTag,
      ),
      m.description ? el("div", { class: "event-sub", style: "margin-top:4px" }, m.description) : null,
    ),
    actions,
  );
}

function openMajlisForm(existing = null) {
  const isEdit = !!existing;
  const name = el("input", { type: "text", required: true, value: existing?.name || "" });
  const date = el("input", { type: "date", required: true, value: existing?.date || toISODate(new Date()) });
  const type = el("select", {},
    ...["festival","students","chandraat","baitul-khayal","paanch-baar-saal","baitul-khayal-satada","jamati-mushkil-assan-satada","other"]
      .map(t => el("option", { value: t, selected: existing?.type === t }, t.replace(/-/g, " ")))
  );
  const marker = el("select", {},
    el("option", { value: "", selected: !existing?.marker }, "— none —"),
    el("option", { value: "K", selected: existing?.marker === "K" }, "K — Khushali Majlis"),
    el("option", { value: "C", selected: existing?.marker === "C" }, "C — Changeover Majlis"),
  );
  const description = el("textarea", { placeholder: "Optional" }, existing?.description || "");
  description.value = existing?.description || "";

  const form = el("form", { class: "form-grid" },
    el("div", { class: "form-row" }, el("label", {}, "Name *"), name),
    el("div", { class: "form-two-col" },
      el("div", { class: "form-row" }, el("label", {}, "Date *"), date),
      el("div", { class: "form-row" }, el("label", {}, "Type"), type),
    ),
    el("div", { class: "form-row" }, el("label", {}, "Marker"), marker),
    el("div", { class: "form-row" }, el("label", {}, "Description"), description),
  );

  const cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
  const save = el("button", { class: "btn btn-primary", type: "button" }, isEdit ? "Save" : "Add");
  const modal = showModal({ title: isEdit ? "Edit majlis" : "Add majlis", body: form, footer: [cancel, save] });
  cancel.onclick = () => modal.close();
  save.onclick = async () => {
    if (!name.value.trim() || !date.value) return toast("Fill required fields", "warning");
    const payload = {
      name: name.value.trim(),
      date: date.value,
      type: type.value,
      marker: marker.value,
      description: description.value.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (isEdit) {
        await updateDoc(doc(db, "majlis", existing.id), payload);
        toast("Updated");
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = state.user.uid;
        await addDoc(collection(db, "majlis"), payload);
        toast("Added");
      }
      modal.close();
    } catch (ex) {
      console.error(ex);
      toast(ex.message || "Couldn't save", "error");
    }
  };
}

// ============================================================
// Users management (Super Admin only)
// ============================================================
function renderUsers(root) {
  if (!isSuperAdmin()) {
    root.appendChild(emptyState("🔒", "Access denied", "Only Super Admins can manage users."));
    return;
  }

  const users = [...state.users].sort((a, b) => {
    // Pending first, then active, then suspended
    const tier = (u) => u.suspended ? 2 : (u.role === "pending" ? 0 : 1);
    const t = tier(a) - tier(b);
    if (t !== 0) return t;
    return (a.name || a.email || "").localeCompare(b.name || b.email || "");
  });

  // Counts
  const total = users.length;
  const pending = users.filter(u => u.role === "pending").length;
  const suspended = users.filter(u => u.suspended).length;
  const admins = users.filter(u => u.role === "admin").length;

  root.appendChild(el("div", { class: "users-summary" },
    el("div", { class: "users-stat" }, el("strong", {}, total), " total"),
    el("div", { class: "users-stat pending" }, el("strong", {}, pending), " pending"),
    el("div", { class: "users-stat admin" }, el("strong", {}, admins), " super admin"),
    el("div", { class: "users-stat suspended" }, el("strong", {}, suspended), " suspended"),
  ));

  // Search
  const searchInput = el("input", {
    type: "search", class: "search-input", placeholder: "Search name, email, or JK…",
    value: state.filters.userSearch || "",
    oninput: (e) => {
      state.filters.userSearch = e.target.value;
      listContainer.innerHTML = "";
      renderList();
    }
  });
  root.appendChild(el("div", { class: "search-bar" },
    el("span", { class: "search-icon", html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>` }),
    searchInput,
  ));

  const listContainer = el("div", { class: "users-list" });
  root.appendChild(listContainer);

  // FAB — invite a new user
  root.appendChild(el("button", {
    class: "fab", title: "Invite user", "aria-label": "Invite user",
    onclick: () => openInviteUser(),
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  }));

  function renderList() {
    const q = (state.filters.userSearch || "").trim().toLowerCase();
    const filtered = !q ? users : users.filter(u => {
      const hay = `${u.name || ""} ${u.email || ""} ${u.jamatkhana || ""} ${u.scope || ""} ${u.role || ""}`.toLowerCase();
      return hay.includes(q);
    });
    if (filtered.length === 0) {
      listContainer.appendChild(emptyState("👥", "No users match", "Try a different search."));
      return;
    }
    filtered.forEach(u => listContainer.appendChild(userCard(u)));
  }
  renderList();
}

function userCard(u) {
  const isSelf = u.id === state.user.uid;
  const role = u.role || "pending";
  const roleClass = role === "admin" ? "role-admin"
                  : role === "jk_admin" ? "role-jkadmin"
                  : role === "team"     ? "role-team"
                  : "role-pending";

  const scopeText = (role === "admin" || role === "jk_admin")
    ? "All Jamatkhanas"
    : (u.scope && u.scope !== "all")
      ? jamatkhanaName(u.scope)
      : (u.jamatkhana ? `${jamatkhanaName(u.jamatkhana)} (from signup)` : "All Jamatkhanas");

  const statusTags = [];
  if (role === "pending") statusTags.push(el("span", { class: "tag tag-gold" }, "Pending approval"));
  if (u.suspended)        statusTags.push(el("span", { class: "tag tag-red" }, "Suspended"));
  if (isSelf)             statusTags.push(el("span", { class: "tag tag-green" }, "You"));

  const manageBtn = el("button", {
    class: "btn btn-primary btn-sm",
    onclick: () => openUserManage(u),
  }, "Manage");

  return el("div", { class: `user-card${u.suspended ? " suspended" : ""}` },
    el("div", { class: "user-card-main" },
      el("div", { class: "user-avatar" }, initials((u.name || u.email || "?").split(" ")[0], (u.name || "").split(" ")[1] || "")),
      el("div", { class: "user-card-body" },
        el("div", { class: "user-name-row" },
          el("div", { class: "user-name" }, u.name || "—"),
          el("span", { class: `role-badge ${roleClass}` }, roleLabel(role)),
        ),
        el("div", { class: "user-email" }, u.email || "—"),
        el("div", { class: "user-scope" }, scopeText),
        statusTags.length ? el("div", { class: "user-tags" }, ...statusTags) : null,
      ),
    ),
    el("div", { class: "user-card-actions" }, manageBtn),
  );
}

function openUserManage(u) {
  const isSelf = u.id === state.user.uid;

  const roleSelect = el("select", {},
    el("option", { value: "pending",  selected: u.role === "pending"  }, "Pending (no access)"),
    el("option", { value: "team",     selected: u.role === "team"     }, "Coordinator"),
    el("option", { value: "jk_admin", selected: u.role === "jk_admin" }, "JK Admin"),
    el("option", { value: "admin",    selected: u.role === "admin"    }, "Super Admin"),
  );

  const scopeSelect = el("select", {},
    el("option", { value: "all", selected: !u.scope || u.scope === "all" }, "All Jamatkhanas"),
    ...JAMATKHANAS.map(j => el("option", { value: j.code, selected: u.scope === j.code }, `${j.name} (${j.code})`)),
  );

  function refreshScopeEnabled() {
    // Admins and JK Admins see everything; scope only matters for Coordinator.
    const r = roleSelect.value;
    const locked = r === "admin" || r === "jk_admin";
    scopeSelect.disabled = locked;
    if (locked) scopeSelect.value = "all";
  }
  roleSelect.addEventListener("change", refreshScopeEnabled);
  refreshScopeEnabled();

  const selfWarning = isSelf
    ? el("p", { class: "form-hint", style: "color:var(--gold-700)" },
        "You can't change your own role, suspend yourself, or delete your own account.")
    : null;

  const form = el("form", { class: "form-grid" },
    el("div", { class: "form-row" },
      el("label", {}, "Name"),
      el("input", { type: "text", value: u.name || "", readonly: true, disabled: true }),
    ),
    el("div", { class: "form-row" },
      el("label", {}, "Email"),
      el("input", { type: "email", value: u.email || "", readonly: true, disabled: true }),
    ),
    el("div", { class: "form-row" },
      el("label", {}, "Role"),
      roleSelect,
    ),
    el("div", { class: "form-row" },
      el("label", {}, "Jamatkhana scope"),
      scopeSelect,
      el("small", { class: "form-hint" }, "Coordinators see only their assigned JK. Admins always see all."),
    ),
    selfWarning,
  );

  // Secondary action buttons (reset password / suspend / delete)
  const resetBtn = el("button", { class: "btn btn-secondary", type: "button" }, "Send password reset email");
  resetBtn.onclick = async () => {
    if (!u.email) return toast("No email on file", "warning");
    try {
      await sendPasswordResetEmail(auth, u.email);
      toast(`Reset email sent to ${u.email}`, "success");
    } catch (ex) {
      toast(friendlyAuthError(ex), "error");
    }
  };

  const suspendBtn = el("button", {
    class: `btn ${u.suspended ? "btn-primary" : "btn-secondary"}`, type: "button",
    disabled: isSelf,
  }, u.suspended ? "Unsuspend account" : "Suspend account");
  suspendBtn.onclick = async () => {
    if (isSelf) return;
    const next = !u.suspended;
    const ok = await confirmDialog({
      title: next ? "Suspend user?" : "Unsuspend user?",
      message: next
        ? `Suspend ${u.name || u.email}? They will be signed out and unable to sign back in until unsuspended.`
        : `Restore access for ${u.name || u.email}?`,
      confirmLabel: next ? "Suspend" : "Unsuspend",
      danger: next,
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, "users", u.id), {
        suspended: next,
        suspendedAt: next ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
      toast(next ? "User suspended" : "User unsuspended", "success");
      m.close();
    } catch (ex) {
      toast(ex.message || "Couldn't update", "error");
    }
  };

  const deleteBtn = el("button", {
    class: "btn btn-danger", type: "button", disabled: isSelf,
  }, "Delete user record");
  deleteBtn.onclick = async () => {
    if (isSelf) return;
    const ok = await confirmDialog({
      title: "Delete user record?",
      message: `Remove ${u.name || u.email} from the app? This deletes their profile and access. Their Firebase Auth login is not deleted (an admin must remove it in the Firebase console if desired).`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "users", u.id));
      toast("User record deleted", "success");
      m.close();
    } catch (ex) {
      toast(ex.message || "Couldn't delete", "error");
    }
  };

  const secondary = el("div", { class: "user-action-stack" },
    resetBtn,
    suspendBtn,
    deleteBtn,
  );

  // Primary footer buttons
  const cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
  const save = el("button", { class: "btn btn-primary", type: "button" }, "Save changes");
  if (isSelf) {
    // Freeze role + scope editing for self to prevent lockout.
    roleSelect.disabled = true;
    scopeSelect.disabled = true;
  }
  save.onclick = async () => {
    if (isSelf) return m.close();
    const newRole = roleSelect.value;
    const newScope = (newRole === "admin" || newRole === "jk_admin") ? "all" : scopeSelect.value;
    try {
      await updateDoc(doc(db, "users", u.id), {
        role: newRole,
        scope: newScope,
        updatedAt: serverTimestamp(),
      });
      toast("User updated", "success");
      m.close();
    } catch (ex) {
      toast(ex.message || "Couldn't save", "error");
    }
  };
  cancel.onclick = () => m.close();

  const body = el("div", {},
    form,
    el("div", { class: "form-section-label" }, "Account actions"),
    secondary,
  );

  const m = showModal({
    title: `Manage: ${u.name || u.email}`,
    body,
    footer: [cancel, save],
  });
}

// ----------------------------------------------------------------
// Invite a new user (Super Admin only)
// ----------------------------------------------------------------
// Uses a *secondary* Firebase app so createUserWithEmailAndPassword
// does not sign out the current admin.  The invitee receives a
// password-reset email they use to set their own password.
// ----------------------------------------------------------------
function openInviteUser() {
  const nameInput  = el("input", { type: "text",  required: true,  placeholder: "Full name" });
  const emailInput = el("input", { type: "email", required: true,  placeholder: "name@example.com", autocomplete: "email" });
  const roleSelect = el("select", {},
    el("option", { value: "team",     selected: true }, "Coordinator"),
    el("option", { value: "jk_admin" },                "JK Admin"),
    el("option", { value: "admin" },                   "Super Admin"),
  );
  const scopeSelect = el("select", {},
    el("option", { value: "all" }, "All Jamatkhanas"),
    ...JAMATKHANAS.map(j => el("option", { value: j.code }, `${j.name} (${j.code})`)),
  );

  function refreshScopeEnabled() {
    const r = roleSelect.value;
    const locked = r === "admin" || r === "jk_admin";
    scopeSelect.disabled = locked;
    if (locked) scopeSelect.value = "all";
  }
  roleSelect.addEventListener("change", refreshScopeEnabled);
  refreshScopeEnabled();

  const form = el("form", { class: "form-grid" },
    el("div", { class: "form-row" }, el("label", {}, "Full name *"),   nameInput),
    el("div", { class: "form-row" }, el("label", {}, "Email *"),       emailInput),
    el("div", { class: "form-row" }, el("label", {}, "Role"),          roleSelect),
    el("div", { class: "form-row" }, el("label", {}, "Jamatkhana scope"), scopeSelect,
      el("small", { class: "form-hint" }, "Coordinators see only their JK. Admins always see all.")),
    el("p", { class: "form-hint", style: "margin-top:8px" },
      "The invitee will receive a password-setup email. Once they set a password, they can sign in with the role you selected — no further approval needed."),
  );

  const cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
  const send   = el("button", { class: "btn btn-primary",   type: "button" }, "Send invite");

  const modal = showModal({ title: "Invite new user", body: form, footer: [cancel, send] });
  cancel.onclick = () => modal.close();

  send.onclick = async () => {
    const name  = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const role  = roleSelect.value;
    const scope = (role === "admin" || role === "jk_admin") ? "all" : scopeSelect.value;

    if (!name)  return toast("Enter a name", "warning");
    if (!email) return toast("Enter an email", "warning");

    // Disable the button while we work.
    send.disabled = true;
    send.textContent = "Sending…";

    // Spin up a secondary auth instance so we don't touch state.user.
    const secondaryName = `invite-${Date.now()}`;
    const secondaryApp  = initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuthForSecondary(secondaryApp);

    try {
      // Random 20-char password — the invitee will reset it via email.
      const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(36)).join("").slice(0, 20) + "!A1";

      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      const newUid = cred.user.uid;

      // Create the Firestore profile from the admin's auth (so write rules pass).
      await setDoc(doc(db, "users", newUid), {
        uid: newUid,
        name,
        email,
        role,
        scope,
        jamatkhana: scope !== "all" ? scope : "",
        suspended: false,
        invitedBy: state.user.uid,
        createdAt: serverTimestamp(),
      });

      // Send the password-setup email (uses the main auth).
      await sendPasswordResetEmail(auth, email);

      // Sign out the secondary and delete the secondary app.
      try { await signOut(secondaryAuth); } catch {}
      try { await deleteApp(secondaryApp); } catch {}

      toast(`Invite sent to ${email}`, "success", 4000);
      modal.close();
    } catch (ex) {
      console.error("invite failed", ex);
      // Best-effort cleanup even on failure.
      try { await deleteApp(secondaryApp); } catch {}
      toast(friendlyAuthError(ex), "error", 5000);
      send.disabled = false;
      send.textContent = "Send invite";
    }
  };
}

// ============================================================
// Bootstrap
// ============================================================
initAuthView();
