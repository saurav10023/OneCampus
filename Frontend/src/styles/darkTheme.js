/*
  Global dark theme for the whole app. Import it ONCE, e.g. at the top of main.jsx:

      import "./styles/darkTheme";

  It injects one <style> tag. No page needs editing: it re-colours the CSS variables
  (--surface, --ink, ...) and every light-only Tailwind class used in the app
  (Timetable, Setups, SetupDetail, Register, Home, Dashboard, shared Ui components, ...).
  Light mode is not touched at all.

  Dark mode is detected from  .dark  /  data-theme="dark"  /  data-mode="dark"
  on <html> or <body>. If your app marks dark mode differently, change D below.

  Palette (contrast on the card colour #151A26)
    page    #0D1018   deep blue-black
    surface #151A26   cards
    inset   #1B2130   tiles, tab bars, chips
    line    #2B3347   borders
    ink     #F2F4FA   headings        ~16:1
    body    #CDD2E1   normal text     ~11:1
    muted   #9BA4BA   secondary text  ~6.8:1
    faint   #7F89A1   tertiary text   ~4.8:1
    accent  #A5ACFF   links / icons   ~8:1   (solid indigo buttons: #5B54EA + white text)
*/

const D = ':is(.dark,[data-theme="dark"],[data-mode="dark"])';
const ROOT = `html${D},body${D}`;

/* hue, "r,g,b" for tints, bright text colour */
const HUES = [
  ["indigo", "139,147,255", "#B4BAFF"],
  ["violet", "167,139,250", "#CDBFFF"],
  ["sky", "56,189,248", "#8ADBFF"],
  ["blue", "96,165,250", "#9CC8FF"],
  ["emerald", "52,211,153", "#5EE0A8"],
  ["green", "74,222,128", "#6EE79A"],
  ["amber", "251,191,36", "#FBBF58"],
  ["yellow", "250,204,21", "#FDE047"],
  ["orange", "251,146,60", "#FDBA74"],
  ["rose", "251,113,133", "#FF9DB0"],
  ["red", "248,113,113", "#FCA5A5"],
];

const hue = ([h, rgb, txt]) => `
${D} [class~="bg-${h}-50"],${D} [class*="bg-${h}-50/"]{background-color:rgba(${rgb},.13)!important}
${D} [class~="bg-${h}-100"],${D} [class*="bg-${h}-100/"]{background-color:rgba(${rgb},.18)!important}
${D} [class~="border-${h}-100"]{border-color:rgba(${rgb},.28)!important}
${D} [class~="border-${h}-200"],${D} [class~="!border-${h}-200"]{border-color:rgba(${rgb},.38)!important}
${D} [class~="border-${h}-300"]{border-color:rgba(${rgb},.50)!important}
${D} [class~="text-${h}-600"],${D} [class~="text-${h}-700"],${D} [class~="text-${h}-800"],${D} [class~="text-${h}-900"]{color:${txt}!important}
`;

const neutral = (n) => `
${D} [class~="bg-${n}-50"],${D} [class~="bg-${n}-100"]{background-color:var(--inset)!important}
${D} [class~="bg-${n}-200"]{background-color:var(--line)!important}
${D} [class~="text-${n}-900"],${D} [class~="text-${n}-800"]{color:var(--ink)!important}
${D} [class~="text-${n}-700"],${D} [class~="text-${n}-600"]{color:var(--body)!important}
${D} [class~="text-${n}-500"]{color:var(--muted)!important}
${D} [class~="text-${n}-400"]{color:var(--faint)!important}
${D} [class~="border-${n}-100"],${D} [class~="border-${n}-200"]{border-color:var(--line)!important}
${D} [class~="border-${n}-300"]{border-color:var(--line-strong)!important}
`;

const css = String.raw`
/* ---------- variables ---------- */
${ROOT}{
  color-scheme:dark;
  --pg:#0D1018;--surface:#151A26;--inset:#1B2130;--track:#2B3347;
  --line:#2B3347;--line-soft:#232A3B;--line-strong:#46526E;
  --ink:#F2F4FA;--body:#CDD2E1;--muted:#9BA4BA;--faint:#7F89A1;--accent:#8B93FF;
}
html${D} body,body${D}{background-color:var(--pg);color:var(--body)}

/* focus-ring gap on dark cards instead of a white one */
${D} *,${D} *::before,${D} *::after{--tw-ring-offset-color:#151A26}

/* ---------- generic ---------- */
${D} ::selection{background:rgba(139,147,255,.35);color:#fff}
${D} *{scrollbar-color:#3A4560 transparent}
${D} hr{border-color:var(--line)}
${D} input,${D} select,${D} textarea{color-scheme:dark}
${D} input::placeholder,${D} textarea::placeholder{color:var(--faint)}
${D} select option{background:#1B2130;color:#F2F4FA}
${D} input:-webkit-autofill,${D} input:-webkit-autofill:hover,${D} input:-webkit-autofill:focus{
  -webkit-box-shadow:0 0 0 1000px var(--inset) inset!important;
  -webkit-text-fill-color:var(--ink)!important;
  caret-color:var(--ink);
}

/* ---------- white / grey surfaces and text ---------- */
${D} [class~="bg-white"]{background-color:var(--surface)!important}
${D} [class*="bg-white/"]{background-color:color-mix(in srgb,var(--surface) 80%,transparent)!important}
${D} [class~="text-black"]{color:var(--ink)!important}
${neutral("slate")}${neutral("gray")}${neutral("zinc")}${neutral("neutral")}${neutral("stone")}

/* ---------- coloured tints, borders and text (indigo, emerald, rose, amber, sky, ...) ---------- */
${HUES.map(hue).join("")}

/* ---------- hard-coded hex colours used in the pages ---------- */
${D} .bg-\[\#EEF2FF\]{background-color:rgba(139,147,255,.16)!important}
${D} .text-\[\#4F46E5\]{color:#A5ACFF!important}
${D} .text-\[\#A32A42\]{color:#FF9DB0!important}
${D} .bg-\[\#4F46E5\]{background-color:#5B54EA!important}
${D} .border-\[\#4F46E5\]{border-color:#5B54EA!important}
${D} .hover\:bg-\[\#4338CA\]:hover{background-color:#6E68F2!important}
${D} .decoration-\[\#1B1F33\]\/30{text-decoration-color:rgba(242,244,250,.38)!important}
${D} .ring-indigo-300{--tw-ring-color:rgba(139,147,255,.65)!important}

/* solid status colours keep their hue but stay readable with white text */
${D} .bg-rose-600{background-color:#E11D48}
`;

/* inject once (updates in place when hot-reloaded) */
if (typeof document !== "undefined") {
  let el = document.getElementById("app-dark-theme");
  if (!el) {
    el = document.createElement("style");
    el.id = "app-dark-theme";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default css;