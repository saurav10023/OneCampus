import { useId } from "react";

const TONES = {
  green: ["#34D399", "#10B981"],
  amber: ["#FBBF24", "#F59E0B"],
  red: ["#FB7185", "#E11D48"],
  brand: ["#5B52EE", "#2B8DE0"],
  neutral: ["#CBD5E1", "#94A3B8"],
};

// Circular progress. `target` draws a small tick on the ring (for example the 75% goal).
// Children are shown in the middle.
const Ring = ({ value = 0, size = 120, stroke = 10, tone = "brand", target, children }) => {
  const gid = useId().replace(/:/g, "");
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const [c1, c2] = TONES[tone] || TONES.brand;

  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;

  let tick = null;
  if (target != null && Number(target) > 0 && Number(target) < 100) {
    const th = (Number(target) / 100) * 2 * Math.PI;
    const r1 = r - stroke / 2 - 2;
    const r2 = r + stroke / 2 + 2;
    tick = {
      x1: cx + r1 * Math.cos(th),
      y1: cx + r1 * Math.sin(th),
      x2: cx + r2 * Math.cos(th),
      y2: cx + r2 * Math.sin(th),
    };
  }

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(22,24,39,0.08)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
        {tick && <line {...tick} stroke="#161827" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

export default Ring;