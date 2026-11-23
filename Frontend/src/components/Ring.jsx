// Circular progress, flat OneCampus style: 8px stroke, #E9ECF3 track, solid arc, no gradient, no inner circle.
// `target` draws a small ink tick on the ring (for example the 75% goal). Children are shown in the middle.

const TONES = {
  green: "#10B981",
  amber: "#F59E0B",
  red: "#F43F5E",
  brand: "#4F46E5",
  neutral: "#9AA0B5",
};

const Ring = ({ value = 0, size = 120, stroke = 8, tone = "brand", target, children }) => {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = TONES[tone] || TONES.brand;

  const r = (size - stroke) / 2;
  const mid = size / 2;
  const circ = 2 * Math.PI * r;

  let tick = null;
  if (target != null && Number(target) > 0 && Number(target) < 100) {
    const th = (Number(target) / 100) * 2 * Math.PI;
    const r1 = r - stroke / 2 - 2;
    const r2 = r + stroke / 2 + 2;
    tick = {
      x1: mid + r1 * Math.cos(th),
      y1: mid + r1 * Math.sin(th),
      x2: mid + r2 * Math.cos(th),
      y2: mid + r2 * Math.sin(th),
    };
  }

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="#E9ECF3" strokeWidth={stroke} />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
        {tick && <line {...tick} stroke="#1B1F33" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center tabular-nums px-3">{children}</div>
    </div>
  );
};

export default Ring;