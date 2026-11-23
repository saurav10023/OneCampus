/*
  Shared colour "tones" for the pages (Timetable, Setups, SetupDetail, Register).
  Place at src/styles/tones.js. Each page imports it with:  import "../styles/tones";

  This version has NO colours of its own. Every tone reads the theme tokens in index.css
  (--ok-bg, --ok-line, --ok-fg, --accent, ...), so light and dark mode always match the rest of the app
  and changing the palette in index.css updates every page at once.

  Tones: brand | ok | bad | info | warn | violet | mute
    "tn tn-ok tn-soft"   pale tinted pill or box: tinted background, border and text
    "tn tn-ok tn-text"   just the text colour
    "tn tn-ok tn-dot"    solid dot or bar
    "tn tn-ok tn-solid"  solid tile with a readable icon colour
  Accent helpers: ac-bg (solid indigo), ac-tx (indigo text or icon), ac-btn (primary button)
*/

const css = `
.ac-bg{background:var(--accent)}
.ac-tx{color:var(--accent-soft)}
.ac-btn{background:var(--accent);color:#fff}
.ac-btn:hover{background:var(--accent-hover)}

.tn-brand {--tn-bg:var(--brand-bg);  --tn-bd:var(--brand-line);  --tn-tx:var(--brand-fg);  --tn-solid:var(--accent);     --tn-on:#fff}
.tn-ok    {--tn-bg:var(--ok-bg);     --tn-bd:var(--ok-line);     --tn-tx:var(--ok-fg);     --tn-solid:var(--ok-solid);   --tn-on:#fff}
.tn-bad   {--tn-bg:var(--bad-bg);    --tn-bd:var(--bad-line);    --tn-tx:var(--bad-fg);    --tn-solid:var(--bad-solid);  --tn-on:#fff}
.tn-info  {--tn-bg:var(--info-bg);   --tn-bd:var(--info-line);   --tn-tx:var(--info-fg);   --tn-solid:var(--info-solid); --tn-on:#fff}
.tn-warn  {--tn-bg:var(--warn-bg);   --tn-bd:var(--warn-line);   --tn-tx:var(--warn-fg);   --tn-solid:var(--warn-solid); --tn-on:#fff}
.tn-violet{--tn-bg:var(--violet-bg); --tn-bd:var(--violet-line); --tn-tx:var(--violet-fg); --tn-solid:#8B5CF6;            --tn-on:#fff}
.tn-mute  {--tn-bg:var(--inset);     --tn-bd:var(--line);        --tn-tx:var(--muted);     --tn-solid:var(--faint);      --tn-on:#fff}

/* the dark solid colours are light, so text placed on them must be dark */
:root.dark .tn-ok  {--tn-on:#06231A}
:root.dark .tn-bad {--tn-on:#2A0710}
:root.dark .tn-info{--tn-on:#04141F}
:root.dark .tn-warn{--tn-on:#1C1300}

.tn-soft {background:var(--tn-bg);border:1px solid var(--tn-bd);color:var(--tn-tx)}
.tn-text {color:var(--tn-tx)}
.tn-dot  {background:var(--tn-solid)}
.tn-solid{background:var(--tn-solid);color:var(--tn-on)}
`;

if (typeof document !== "undefined") {
  let el = document.getElementById("app-tones");
  if (!el) {
    el = document.createElement("style");
    el.id = "app-tones";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default css;