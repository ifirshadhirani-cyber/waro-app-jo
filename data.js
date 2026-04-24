// ============================================================
// Static reference data
// ============================================================

export const JAMATKHANAS = [
  { name: "Austin",           code: "AUS" },
  { name: "Austin Downtown",  code: "AUSDT" },
  { name: "Austin South",     code: "AUSSTH" },
  { name: "Beaumont",         code: "BMT" },
  { name: "Clear Lake",       code: "CLJK" },
  { name: "College Station",  code: "CSJK" },
  { name: "Corpus Christi",   code: "CCJK" },
  { name: "Harvest Green",    code: "HGJK" },
  { name: "Houston HQ",       code: "HQJK" },
  { name: "Houston South",    code: "HSJK" },
  { name: "Ismaili Center",   code: "CENTER" },
  { name: "Katy",             code: "KATY" },
  { name: "San Antonio",      code: "SAJK" },
  { name: "Spring",           code: "SPRING" },
  { name: "Sugar Land",       code: "SLJK" },
];

export const WARO_CATEGORIES = [
  "Jamatkhana Announcements",
  "Ginan/Qasida",
  "Tasbih",
  "Article",
  "Farman",
  "Digital Announcements",
  "Eid Namaz",
  "Tilawat",
  "Event Master of Ceremonies",
  "Other",
];

export const LANGUAGES = ["English", "Urdu", "Gujrati", "Pharsi"];

export const GENDERS = ["Male", "Female", "Prefer not to say"];

// Age ranges for member demographics. Keep these stable — charts key by this list.
export const AGE_RANGES = [
  "Under 18",
  "18–30",
  "31–45",
  "46–60",
  "60+",
];

export const WARO_STATUS = {
  SCHEDULED: "scheduled",
  PERFORMED: "performed",
  MISSED: "missed",
};

// ------------------------------------------------------------
// Pre-populated 2026 Majlis & Festivals calendar
// (Southwest United States — from official image)
// type: festival | students | chandraat | baitul-khayal | paanch-baar-saal | baitul-khayal-satada
//       | jamati-mushkil-assan-satada
// marker: K = Khushali Majlis, C = Changeover Majlis
// ------------------------------------------------------------
export const DEFAULT_MAJLIS_2026 = [
  // January
  { date: "2026-01-01", name: "Yawm-e Ali", type: "festival" },
  { date: "2026-01-15", name: "Shab-e Miraj", type: "festival" },
  { date: "2026-01-16", name: "Students", type: "students" },
  { date: "2026-01-19", name: "Chandraat", type: "chandraat" },
  { date: "2026-01-25", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-01-27", name: "Paanch Baar Saal", type: "paanch-baar-saal" },

  // February
  { date: "2026-02-04", name: "Imamat Day", type: "festival" },
  { date: "2026-02-17", name: "Chandraat", type: "chandraat", marker: "K" },
  { date: "2026-02-20", name: "Students", type: "students", marker: "K" },
  { date: "2026-02-22", name: "Baitul-Khayal", type: "baitul-khayal", marker: "K" },
  { date: "2026-02-25", name: "Paanch Baar Saal", type: "paanch-baar-saal", marker: "K" },

  // March
  { date: "2026-03-11", name: "Laylat-al Qadr", type: "festival" },
  { date: "2026-03-13", name: "Students", type: "students" },
  { date: "2026-03-19", name: "Chandraat", type: "chandraat" },
  { date: "2026-03-20", name: "Eid-al Fitr (Tentative)", type: "festival" },
  { date: "2026-03-21", name: "Navroz", type: "festival" },
  { date: "2026-03-22", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-03-27", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-03-30", name: "Baitul-Khayal Satada", type: "baitul-khayal-satada" },

  // April
  { date: "2026-04-15", name: "Students", type: "students" },
  { date: "2026-04-17", name: "Chandraat Bej", type: "chandraat" },
  { date: "2026-04-19", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-04-25", name: "Paanch Baar Saal", type: "paanch-baar-saal" },

  // May
  { date: "2026-05-02", name: "Jamati Mushkil Assan Satada", type: "jamati-mushkil-assan-satada" },
  { date: "2026-05-15", name: "Students", type: "students" },
  { date: "2026-05-17", name: "Chandraat", type: "chandraat" },
  { date: "2026-05-24", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-05-25", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-05-27", name: "Eid-al Adha (Tentative)", type: "festival" },

  // June
  { date: "2026-06-03", name: "Eid-e-Ghadir", type: "festival" },
  { date: "2026-06-08", name: "Baitul-Khayal Satada", type: "baitul-khayal-satada" },
  { date: "2026-06-15", name: "Chandraat", type: "chandraat" },
  { date: "2026-06-19", name: "Students", type: "students" },
  { date: "2026-06-21", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-06-23", name: "Paanch Baar Saal", type: "paanch-baar-saal" },

  // July
  { date: "2026-07-14", name: "Chandraat", type: "chandraat" },
  { date: "2026-07-17", name: "Students", type: "students" },
  { date: "2026-07-19", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-07-22", name: "Paanch Baar Saal", type: "paanch-baar-saal" },

  // August
  { date: "2026-08-13", name: "Chandraat", type: "chandraat" },
  { date: "2026-08-14", name: "Students", type: "students" },
  { date: "2026-08-16", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-08-21", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-08-24", name: "Milad-an Nabi", type: "festival" },
  { date: "2026-08-31", name: "Baitul-Khayal Satada", type: "baitul-khayal-satada" },

  // September
  { date: "2026-09-11", name: "Chandraat Bej", type: "chandraat" },
  { date: "2026-09-13", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-09-19", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-09-25", name: "Students", type: "students" },

  // October
  { date: "2026-10-11", name: "Chandraat", type: "chandraat", marker: "K" },
  { date: "2026-10-12", name: "Salgirah", type: "festival" },
  { date: "2026-10-16", name: "Students", type: "students", marker: "K" },
  { date: "2026-10-18", name: "Baitul-Khayal", type: "baitul-khayal", marker: "K" },
  { date: "2026-10-19", name: "Paanch Baar Saal", type: "paanch-baar-saal", marker: "K" },
  { date: "2026-10-24", name: "Jamati Mushkil Assan Satada", type: "jamati-mushkil-assan-satada" },

  // November
  { date: "2026-11-10", name: "Chandraat", type: "chandraat" },
  { date: "2026-11-15", name: "Students", type: "students" },
  { date: "2026-11-18", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-11-20", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-11-23", name: "Baitul-Khayal Satada", type: "baitul-khayal-satada" },

  // December
  { date: "2026-12-09", name: "Chandraat", type: "chandraat" },
  { date: "2026-12-13", name: "Students", type: "students" },
  { date: "2026-12-17", name: "Paanch Baar Saal", type: "paanch-baar-saal" },
  { date: "2026-12-18", name: "Baitul-Khayal", type: "baitul-khayal" },
  { date: "2026-12-21", name: "Yawm-e Ali", type: "festival" },
];

export const MAJLIS_NOTES_2026 = [
  "Ramadan 1447 AH anticipated to commence on Tuesday, February 17 after sunset and end on Thursday, March 19 at sunset.",
  "Muharram 1448 AH to commence on Monday, June 15 after sunset and end on Tuesday, July 14 at sunset.",
  "Eid-al-Fitr and Eid-al-Adha to be confirmed closer to the time.",
  "No daytime meals should be organized during the month of Ramadan.",
  "Please observe simplicity and avoid festive occasions/celebrations during the month of Muharram.",
  "Changeover for Bait-ul Khayal Majlis to take place during morning Jamatkhana on November 5th.",
  "(K) = Khushali Majlis   (C) = Changeover Majlis",
];
