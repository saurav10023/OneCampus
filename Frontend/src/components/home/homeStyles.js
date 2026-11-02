/* All Home-page CSS in one place. Injected once by pages/Home.jsx via <style>. */
export const css = `
.hm { --g1: #5B52EE; --g2: #2B8DE0; --ink: #161827; }
@keyframes hm-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes hm-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes hm-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes hm-orb { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(18px,-14px,0) scale(1.08); } }
.hm-rise { animation: hm-rise .55s cubic-bezier(.22,1,.36,1) both; }
.hm-fade { animation: hm-fade .28s cubic-bezier(.22,1,.36,1) both; }
.hm-float { animation: hm-float 6s ease-in-out infinite; }
.hm button, .hm a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.hm-scroll::-webkit-scrollbar { display: none; } .hm-scroll { scrollbar-width: none; }

/* Brand gradient: one source of truth for every "selected" or "primary" surface. */
.hm-grad { background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 12px 24px -12px rgba(79,70,229,.7); }
.hm-grad-text { background: linear-gradient(120deg, #4F46E5 0%, #2B8DE0 55%, #0EA5E9 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }

/* Soft wash with drifting colour orbs for the glass to refract. */
.hm-wash { position: absolute; inset: 0 0 auto 0; height: 640px; pointer-events: none; z-index: -1; overflow: hidden;
  background:
    radial-gradient(520px 280px at 8% 0%, rgba(125,211,252,.30), transparent 70%),
    radial-gradient(480px 280px at 92% 4%, rgba(165,180,252,.30), transparent 70%),
    radial-gradient(440px 260px at 50% 34%, rgba(167,243,208,.20), transparent 70%),
    radial-gradient(360px 220px at 80% 60%, rgba(226,232,240,.40), transparent 70%); }
.hm-orb { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; animation: hm-orb 14s ease-in-out infinite; }

/* Frosted white cards (lower sections). */
.lg { background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.9); border-radius: 20px;
  -webkit-backdrop-filter: blur(20px) saturate(160%); backdrop-filter: blur(20px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 0 0 1px rgba(22,24,39,.045), 0 14px 34px -24px rgba(22,24,39,.28); }
.lg-in, .lg-pill { background: rgba(255,255,255,.66); border: 1px solid rgba(22,24,39,.06) !important; }
.lg-in { border-radius: 14px; }
.lg-pill { transition: background .15s, transform .15s; } .lg-pill:hover { background: #fff; } .lg-pill:active { transform: scale(.98); }
.lg-hot { background: rgba(255,255,255,.95) !important; border-color: rgba(91,82,238,.45) !important; box-shadow: 0 0 0 3px rgba(91,82,238,.10), 0 14px 30px -22px rgba(79,70,229,.45) !important; }
.lg-on { background: linear-gradient(135deg, var(--g1), var(--g2)) !important; border-color: transparent !important; color: #fff !important;
  box-shadow: 0 10px 20px -10px rgba(79,70,229,.6) !important; }

/* ---- Clear white liquid glass (hero, schedule, attendance) ---- */
.lq { background: linear-gradient(180deg, rgba(255,255,255,.70) 0%, rgba(255,255,255,.34) 100%);
  border: 1px solid rgba(255,255,255,.9); border-radius: 26px;
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: inset 0 1.5px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(22,24,39,.04), 0 0 0 1px rgba(22,24,39,.045), 0 26px 50px -32px rgba(22,24,39,.32); }
.lq-in { background: linear-gradient(160deg, rgba(255,255,255,.78), rgba(255,255,255,.40));
  border: 1px solid rgba(255,255,255,.95); border-radius: 18px;
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(22,24,39,.04), 0 10px 20px -16px rgba(22,24,39,.28); }
.lq-btn { background: linear-gradient(160deg, rgba(255,255,255,.88), rgba(255,255,255,.50));
  border: 1px solid rgba(255,255,255,.95);
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(22,24,39,.045), 0 6px 14px -10px rgba(22,24,39,.30);
  transition: transform .18s cubic-bezier(.3,1.5,.5,1), background .15s, box-shadow .15s; }
.lq-btn:hover { background: linear-gradient(160deg, #fff, rgba(255,255,255,.75)); }
.lq-btn:active { transform: scale(.96); }
.lq-glow { border-color: rgba(255,255,255,1) !important;
  box-shadow: inset 0 1.5px 0 #fff, 0 0 0 1px rgba(91,82,238,.14), 0 22px 44px -24px rgba(79,70,229,.40) !important; }
.lq-on { background: linear-gradient(135deg, var(--g1), var(--g2)) !important; color: #fff !important;
  border-color: rgba(255,255,255,.25) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 10px 20px -10px rgba(79,70,229,.6) !important; }
.lq-thumb { background: linear-gradient(180deg, #fff, rgba(255,255,255,.88)); border: 1px solid #fff;
  box-shadow: inset 0 1px 0 #fff, 0 6px 14px -8px rgba(79,70,229,.35); }

/* Range inputs: soft thumb, calm track, brand accent. */
.hm-range { -webkit-appearance: none; appearance: none; width: 100%; height: 40px; background: transparent; cursor: pointer; }
.hm-range::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: linear-gradient(90deg, rgba(91,82,238,.18), rgba(43,141,224,.18)); }
.hm-range::-moz-range-track { height: 8px; border-radius: 999px; background: linear-gradient(90deg, rgba(91,82,238,.18), rgba(43,141,224,.18)); }
.hm-range::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; margin-top: -9px; border-radius: 50%; background: #fff; border: 2px solid var(--g1); box-shadow: 0 4px 10px -2px rgba(79,70,229,.4); }
.hm-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid var(--g1); box-shadow: 0 4px 10px -2px rgba(79,70,229,.4); }
.hm-range:focus-visible { outline: none; } .hm-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(91,82,238,.22); }
.hm-range:disabled { opacity: .4; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .hm-rise, .hm-fade, .hm-float, .hm-orb, .animate-pulse { animation: none; } .lg-pill, .lq-btn { transition: none; } }

/* Responsive guardrails: prevent grid/flex children and long text from widening the page. */
.hm, .hm * { box-sizing: border-box; }
.hm { width: 100%; min-width: 0; }
.hm :where(section, header, footer, main, article, ul, li, div) { min-width: 0; }
.hm :where(h1, h2, h3, p, a, button, span) { overflow-wrap: anywhere; }
.hm svg, .hm img { max-width: 100%; }
.hm .lg, .hm .lg-in, .hm .lq, .hm .lq-in { min-width: 0; max-width: 100%; }
@media (max-width: 479px) { .hm .lg { border-radius: 18px; } .hm .lg-in { border-radius: 12px; } .hm .lq { border-radius: 22px; } .hm .lq-in { border-radius: 15px; } }
`;