/*
  Shared colour "tones" for light AND dark mode. Pages use these class names instead of
  hard-coded Tailwind colours, so every page looks right in both themes with no overrides.

  Put this file at src/styles/tones.js. The pages import it themselves:  import "../styles/tones";

  How to use a tone (name = brand | ok | bad | info | warn | violet | mute):
    "tn tn-ok tn-soft"   pale tinted pill / box: tinted background, border and text
    "tn tn-ok tn-text"   just the text colour
    "tn tn-ok tn-dot"    solid dot or bar in the tone colour
    "tn tn-ok tn-solid"  solid tile with a readable icon colour

  Accent helpers (the one indigo used across the app):
    ac-bg   solid indigo background        ac-tx   indigo text / icon (lighter in dark)
    ac-btn  solid indigo button (hover, white text)

  Dark mode is detected from .dark / data-theme="dark" / data-mode="dark" on <html> or <body>.
  If your app marks dark mode differently, change D below.
*/

const D = ':is(.dark,[data-theme="dark"],[data-mode="dark"])';

const css = `
:root{--acc:#4F46E5;--acc-solid:#4F46E5;--acc-hover:#4338CA}
html${D},body${D}{--acc:#A5ACFF;--acc-solid:#5B54EA;--acc-hover:#6E68F2}

.ac-bg{background:var(--acc-solid)}
.ac-tx{color:var(--acc)}
.ac-btn{background:var(--acc-solid);color:#fff}
.ac-btn:hover{background:var(--acc-hover)}

/* ---------- light ---------- */
.tn-brand {--tn-bg:#EEF2FF;--tn-bd:#E0E7FF;--tn-tx:#4338CA;--tn-solid:#4F46E5;--tn-on:#fff}
.tn-ok    {--tn-bg:#ECFDF5;--tn-bd:#A7F3D0;--tn-tx:#047857;--tn-solid:#10B981;--tn-on:#fff}
.tn-bad   {--tn-bg:#FFF1F2;--tn-bd:#FECDD3;--tn-tx:#A32A42;--tn-solid:#F43F5E;--tn-on:#fff}
.tn-info  {--tn-bg:#F0F9FF;--tn-bd:#BAE6FD;--tn-tx:#0369A1;--tn-solid:#0EA5E9;--tn-on:#fff}
.tn-warn  {--tn-bg:#FFFBEB;--tn-bd:#FDE68A;--tn-tx:#92400E;--tn-solid:#F59E0B;--tn-on:#fff}
.tn-violet{--tn-bg:#F5F3FF;--tn-bd:#DDD6FE;--tn-tx:#5B21B6;--tn-solid:#8B5CF6;--tn-on:#fff}
.tn-mute  {--tn-bg:var(--inset);--tn-bd:var(--line);--tn-tx:var(--muted);--tn-solid:var(--faint);--tn-on:#fff}

/* ---------- dark ---------- */
${D} .tn-brand {--tn-bg:rgba(139,147,255,.16);--tn-bd:rgba(139,147,255,.34);--tn-tx:#B8BEFF;--tn-solid:#5B54EA;--tn-on:#fff}
${D} .tn-ok    {--tn-bg:rgba(52,211,153,.14);--tn-bd:rgba(52,211,153,.36);--tn-tx:#5EE0A8;--tn-solid:#10B981;--tn-on:#04150E}
${D} .tn-bad   {--tn-bg:rgba(251,113,133,.15);--tn-bd:rgba(251,113,133,.40);--tn-tx:#FF9DB0;--tn-solid:#F43F5E;--tn-on:#fff}
${D} .tn-info  {--tn-bg:rgba(56,189,248,.14);--tn-bd:rgba(56,189,248,.38);--tn-tx:#8ADBFF;--tn-solid:#0EA5E9;--tn-on:#04141F}
${D} .tn-warn  {--tn-bg:rgba(251,191,36,.14);--tn-bd:rgba(251,191,36,.38);--tn-tx:#FBBF58;--tn-solid:#F59E0B;--tn-on:#1C1300}
${D} .tn-violet{--tn-bg:rgba(167,139,250,.16);--tn-bd:rgba(167,139,250,.40);--tn-tx:#CDBFFF;--tn-solid:#8B5CF6;--tn-on:#fff}

/* ---------- what a tone can paint ---------- */
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