import { createWorker } from "tesseract.js";

let uid = 0;
const nid = () => `i${++uid}`;
const pad = (n) => String(n).padStart(2, "0");
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] || 10;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cx = (w) => (w.x0 + w.x1) / 2;
const cy = (w) => (w.y0 + w.y1) / 2;
const clean = (s) => s.replace(/[|_[\]{}~=]+/g, " ").replace(/\s+/g, " ").trim();

// Short code from a subject name: "Data Structures and Algorithms" -> "DSA", "Physics" -> "PHYS".
const STOP = new Set(["of", "and", "the", "to", "in", "for", "a", "an", "on", "with"]);
const abbreviate = (name = "") => {
  const words = String(name).replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const sig = words.filter((w) => !STOP.has(w.toLowerCase()));
  const use = sig.length ? sig : words;
  if (!use.length) return "";
  if (use.length === 1) return use[0].slice(0, 4).toUpperCase();
  return use
    .map((w) => (/^(\d+|[IVX]+)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase()))
    .join("")
    .slice(0, 8);
};

// Legend titles come out of OCR with stray bits: "D igital" and "ry: ee U H V-[I: Understanding Harmony".
const tidyTitle = (s) => {
  let t = clean(s).replace(/\b([A-Z]) ([a-z]{3,})/g, "$1$2");
  const toks = t.split(" ");
  while (toks.length > 1 && (toks[0].replace(/[^A-Za-z0-9]/g, "").length <= 2 || /^[a-z]{1,4}[.:,]?$/.test(toks[0]))) toks.shift();
  while (toks.length > 1 && toks[toks.length - 1].replace(/[^A-Za-z0-9]/g, "").length <= 1) toks.pop();
  return toks.join(" ");
};

/* ---------- OCR ---------- */

// Paint long horizontal / vertical table lines white so Tesseract only sees text.
// Works on the grayscale canvas made by prepare().
export function stripGrid(canvas) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const dark = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; i += 4, p++) dark[p] = d[i] < 150 ? 1 : 0;
  const kill = new Uint8Array(W * H);
  const minH = Math.max(40, Math.round(W * 0.06));
  const minV = Math.max(40, Math.round(H * 0.06));
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!dark[y * W + x]) { x++; continue; }
      let e = x;
      while (e < W && dark[y * W + e]) e++;
      if (e - x >= minH) for (let k = x; k < e; k++) kill[y * W + k] = 1;
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!dark[y * W + x]) { y++; continue; }
      let e = y;
      while (e < H && dark[e * W + x]) e++;
      if (e - y >= minV) for (let k = y; k < e; k++) kill[k * W + x] = 1;
      y = e;
    }
  }
  // grow the mask by 2px so the soft edges of a line go too
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (kill[y * W + x])
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < W) out[yy * W + xx] = 1;
          }
        }
  for (let p = 0, i = 0; p < W * H; p++, i += 4) if (out[p]) d[i] = d[i + 1] = d[i + 2] = 255;
  g.putImageData(img, 0, 0);
}

// Upscale small images, go grayscale + more contrast, remove table lines (helps Tesseract a lot).
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1800 ? 2400 / bmp.width : bmp.width > 3200 ? 3000 / bmp.width : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  // done by hand: ctx.filter is ignored on Safari / iOS
  const img = g.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, (v - 128) * 1.2 + 128));
  }
  g.putImageData(img, 0, 0);
  stripGrid(c);
  return c;
}

export async function ocr(file, { mode, onProgress }) {
  const worker = await createWorker("eng", 1, {
    logger: (m) => m.status === "recognizing text" && onProgress?.(m.progress),
  });
  try {
    // 11 = sparse text (keeps table cells apart), 6 = uniform block (good for lists)
    await worker.setParameters({ tessedit_pageseg_mode: mode === "table" ? "11" : "6" });
    const canvas = await prepare(file);
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const raw = data.words || data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) || [];
    const words = raw
      .map((w) => ({ t: String(w.text || "").trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }))
      .filter((w) => w.t);
    return { text: data.text || "", words, canvas };
  } finally {
    await worker.terminate();
  }
}

/* ---------- timetable ---------- */

const DAY_RE = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i;
const DAY_NUM = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SKIP_CELL = /^(free|break|lunch|recess|nil|na|n\/a|[-–—_.\s]*)$/i;
const TIME = /(\d{1,2})[:.](\d{2})/g;

const to24 = (h, m) => {
  h = Number(h);
  if (h < 7) h += 12; // "1:00" in a college timetable means 13:00
  return `${pad(h)}:${m}`;
};
const plusHour = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h >= 23 ? "23:59" : `${pad(h + 1)}:${pad(m)}`;
};

// "EC24205": 2 letters + 5 digits. Repairs the usual OCR mix-ups (O/0, I/1, S/5) in the digits.
const fixCode = (t) => {
  const s = String(t).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (s.length !== 7) return null;
  const f = s.slice(0, 2) + s.slice(2).replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5");
  return /^[A-Z]{2}\d{5}$/.test(f) ? f : null;
};

const edgesOf = (cs, fallback) => {
  const gap0 = cs.length > 1 ? cs[1] - cs[0] : fallback;
  const gapN = cs.length > 1 ? cs[cs.length - 1] - cs[cs.length - 2] : fallback;
  const e = [cs[0] - gap0 / 2];
  for (let i = 1; i < cs.length; i++) e.push((cs[i - 1] + cs[i]) / 2);
  e.push(cs[cs.length - 1] + gapN / 2);
  return e;
};
const bandOf = (edges, v) => {
  for (let i = 0; i < edges.length - 1; i++) if (v >= edges[i] && v < edges[i + 1]) return i;
  return -1;
};

// Row boundaries between the day labels. Snaps each one to a real horizontal table line in the
// image (checked in vertical strips, so a slightly tilted photo still works). Falls back to the
// midpoint between two day labels when no line is found.
function makeRows(canvas, ys, pitch) {
  const n = ys.length;
  const plain = [ys[0] - pitch / 2, ...ys.slice(1).map((y, i) => (ys[i] + y) / 2), ys[n - 1] + pitch / 2];
  const STRIPS = 10;
  let strips = null;
  let sw = 1;
  if (canvas) {
    const W = canvas.width, H = canvas.height;
    const d = canvas.getContext("2d").getImageData(0, 0, W, H).data;
    sw = Math.floor(W / STRIPS);
    const from = Math.max(0, Math.floor(plain[0] - pitch));
    const to = Math.min(H, Math.ceil(plain[n] + pitch));
    strips = [];
    for (let s = 0; s < STRIPS; s++) {
      const xa = s * sw;
      const hit = [];
      for (let y = from; y < to; y++) {
        let dark = 0;
        for (let x = xa; x < xa + sw; x++) {
          const i = (y * W + x) * 4;
          if (d[i] + d[i + 1] + d[i + 2] < 390) dark++;
        }
        if (dark > sw * 0.5) hit.push(y); // a table line: most of the strip is dark on this pixel row
      }
      const centers = [];
      let start = null, prev = null;
      hit.forEach((y) => {
        if (start !== null && y - prev <= 3) prev = y;
        else {
          if (start !== null) centers.push((start + prev) / 2);
          start = prev = y;
        }
      });
      if (start !== null) centers.push((start + prev) / 2);
      const pick = (t, tol) => centers.filter((c) => Math.abs(c - t) < tol).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
      strips.push(plain.map((t) => pick(t, pitch * 0.4) ?? t));
    }
  }
  const bounds = (x) => (strips ? strips[Math.min(STRIPS - 1, Math.max(0, Math.floor(x / sw)))] : plain);
  return {
    rowOf: (x, y) => {
      const b = bounds(x);
      if (y < b[0] || y >= b[n]) return -1;
      for (let i = 0; i < n; i++) if (y < b[i + 1]) return i;
      return -1;
    },
    below: (x, y) => y >= bounds(x)[n] - 2,
  };
}

export function parseTimetable(rawWords, canvas) {
  const empty = (warning) => ({ subjects: [], classes: [], warning });
  const th = median(rawWords.map((w) => w.y1 - w.y0)); // typical text height
  let words = rawWords;
  let cv = canvas;

  /* 1. day labels */
  const findDays = () => words.filter((w) => w.t.length >= 3 && DAY_RE.test(w.t));
  let dayWords = findDays();
  if (dayWords.length < 2) return empty("Could not find the day names (Mon, Tue…) in the timetable image.");
  const spread = (f) => Math.max(...dayWords.map(f)) - Math.min(...dayWords.map(f));
  if (spread(cx) > spread(cy)) {
    // days across the top: swap the axes and treat it the same way (grid lines are skipped then)
    words = words.map((w) => ({ ...w, x0: w.y0, x1: w.y1, y0: w.x0, y1: w.x1 }));
    dayWords = findDays();
    cv = null;
  }

  // 1b. straighten a tilted photo: the time headers should sit on one horizontal line
  if (cv) {
    const hdr = words
      .filter((w) => /\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}/.test(w.t))
      .map((w) => ({ x: cx(w), y: cy(w) }));
    if (hdr.length >= 3) {
      const mx = hdr.reduce((a, p) => a + p.x, 0) / hdr.length;
      const my = hdr.reduce((a, p) => a + p.y, 0) / hdr.length;
      const sxx = hdr.reduce((a, p) => a + (p.x - mx) ** 2, 0);
      const slope = sxx ? hdr.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
      if (Math.abs(slope) > 0.003 && Math.abs(slope) < 0.3) {
        const xRef = median(dayWords.map(cx));
        const moved = new Map();
        words = words.map((w) => {
          const dy = -slope * (cx(w) - xRef);
          const n = { ...w, y0: w.y0 + dy, y1: w.y1 + dy };
          moved.set(w, n);
          return n;
        });
        dayWords = dayWords.map((w) => moved.get(w));
        cv = null; // the grid-line snapping below only works on an unrotated image
      }
    }
  }
  const medX = median(dayWords.map(cx));
  const perDay = new Map();
  dayWords
    .filter((w) => Math.abs(cx(w) - medX) < th * 6)
    .forEach((w) => {
      const d = DAY_NUM[w.t.slice(0, 3).toLowerCase()];
      if (!perDay.has(d)) perDay.set(d, w);
    });
  const dayRows = [...perDay.entries()].map(([d, w]) => ({ d, w, y: cy(w) })).sort((a, b) => a.y - b.y);
  if (dayRows.length < 2) return empty("Could not read the day column clearly.");
  const pitch = median(dayRows.slice(1).map((r, i) => r.y - dayRows[i].y));

  /* 2. time columns from the header ("08:00-08:50" or "9:00 - 9:50" or just start times) */
  const headTop = dayRows[0].y - pitch / 2;
  const ranged = [];
  const singles = [];
  let dash = false;
  words.forEach((w) => {
    if (cy(w) >= headTop) return;
    if (/^[-–—~]$/.test(w.t)) dash = true;
    const ms = [...w.t.matchAll(TIME)].filter((m) => +m[1] < 24 && +m[2] < 60);
    if (ms.length >= 2) ranged.push({ s: to24(ms[0][1], ms[0][2]), e: to24(ms[1][1], ms[1][2]), x: cx(w) });
    else if (ms.length === 1) singles.push({ s: to24(ms[0][1], ms[0][2]), x: cx(w) });
  });
  let cols = [];
  if (ranged.length >= 2) cols = ranged.sort((a, b) => a.x - b.x);
  else if (singles.length >= 2) {
    singles.sort((a, b) => a.x - b.x);
    if (dash && singles.length % 2 === 0) {
      for (let i = 0; i < singles.length; i += 2) cols.push({ s: singles[i].s, e: singles[i + 1].s, x: (singles[i].x + singles[i + 1].x) / 2 });
    } else {
      singles.forEach((t, i) => cols.push({ s: t.s, e: singles[i + 1]?.s || plusHour(t.s), x: t.x }));
    }
  }
  if (cols.length < 2) return empty("Could not find the time slots (like 09:00-09:50) in the timetable image.");
  const colEdges = edgesOf(cols.map((c) => c.x), th * 12);

  /* 3. sort every word into its day row, or into the legend below the table */
  const { rowOf, below } = makeRows(cv, dayRows.map((r) => r.y), pitch);
  const dayWordSet = new Set(dayRows.map((r) => r.w));
  const rowWords = dayRows.map(() => []);
  const legendWords = [];
  words.forEach((w) => {
    if (dayWordSet.has(w)) return;
    if (!/[A-Za-z0-9]/.test(w.t)) return; // leftovers of table lines
    if (below(cx(w), cy(w))) return legendWords.push(w);
    if (cx(w) <= colEdges[0] || cx(w) >= colEdges[cols.length]) return;
    const r = rowOf(cx(w), cy(w));
    if (r >= 0) rowWords[r].push(w);
  });

  /* 4. legend: "EC24201  Electronic Devices  4  Dr. S.A. Prasad" -> code => title + teacher + credits */
  const legend = new Map();
  const lines = [];
  legendWords
    .sort((a, b) => cy(a) - cy(b))
    .forEach((w) => {
      const L = lines.find((l) => Math.abs(l.y - cy(w)) < th * 0.7);
      if (L) L.ws.push(w);
      else lines.push({ y: cy(w), ws: [w] });
    });
  lines.forEach(({ ws }) => {
    const t = ws.sort((a, b) => a.x0 - b.x0).map((w) => w.t);
    for (let k = 0; k < t.length - 1; k++) if (/^[DM]$/.test(t[k]) && /^(r|rs|s)\.?$/.test(t[k + 1])) t.splice(k, 2, t[k] + t[k + 1]); // "D r." -> "Dr."
    const i = t.findIndex((x) => fixCode(x));
    if (i < 0) return;
    let j = i + 1;
    while (j < t.length && !/^[1-6]$/.test(t[j]) && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(t[j])) j++;
    const rawTitle = clean(t.slice(i + 1, j).join(" ")).replace(/[\s/:-]+$/, "");
    const title = tidyTitle(rawTitle);
    const teacher = clean(t.slice(/^[1-6]$/.test(t[j] || "") ? j + 1 : j).join(" ")).slice(0, 80);
    const code = fixCode(t[i]);
    const credits = /^[1-6]$/.test(t[j] || "") ? t[j] : "";
    if (title && !legend.has(code)) legend.set(code, { title: title.slice(0, 80), teacher, credits, key: norm(rawTitle) });
  });

  /* 5. one class block = words that touch each other inside a row (also covers merged cells) */
  const describe = (raw) => {
    let code = null;
    let text = raw
      .split(" ")
      .filter((t) => {
        const c = fixCode(t);
        if (c && !code) { code = c; return false; }
        return true;
      })
      .join(" ");
    let room = "";
    const rm = text.match(/[/-]\s*(\d{2,4}[A-Z]?|online)\s*$/i); // "SK/237", "SK/online", "...-215"
    if (rm) { room = rm[1]; text = text.slice(0, rm.index).trim(); }
    const label = text.replace(/\s+[A-Z]{1,5}(?:\+[A-Z]{1,5})*$/, "").trim(); // drop trailing teacher initials
    let entry = code ? legend.get(code) : null;
    let matched = false;
    if (!code) {
      const base = norm(label);
      if (base.length >= 3) {
        const hit = (b) => { for (const [c, e] of legend) if (e.key.includes(b) || norm(e.title).startsWith(b)) return [c, e]; return null; };
        const m = hit(base) || (base.length >= 5 ? hit(base.slice(0, base.length - 2)) : null); // "UHV-II" read as "UHV-[I"
        if (m) { code = m[0]; entry = m[1]; matched = true; }
      }
    }
    // the short name printed in the cell: "ED/SAP" -> ED, "ED LAB/SAP+DG" -> ED LAB, "UHV-II" -> UHV-II
    let short = "";
    const sm = text.match(/^([A-Za-z][A-Za-z0-9 -]{0,11}?)\s*\/\s*[A-Z][A-Z+ .&]*$/);
    if (code && sm) short = sm[1].trim();
    else if (matched && label.length <= 12) short = label;
    const lab = /\blab\b|\bpractical\b/i.test(text) || /\blab\b/i.test(entry?.title || "");
    const tut = /\btut(orial)?\b/i.test(text);
    return {
      code: code || "",
      name: (entry?.title || code || label || raw).slice(0, 80),
      professor: entry?.teacher || "",
      short,
      credits: entry?.credits || "",
      room,
      classType: lab ? "lab" : tut ? "tutorial" : "lecture",
    };
  };

  const subjects = new Map();
  const classes = [];
  rowWords.forEach((ws, r) => {
    const parent = ws.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let a = 0; a < ws.length; a++)
      for (let b = a + 1; b < ws.length; b++) {
        const A = ws[a], B = ws[b];
        const gx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1));
        const gy = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1));
        if (gx <= th * 0.9 && gy <= th * 1.3) parent[find(a)] = find(b);
      }
    const groups = new Map();
    ws.forEach((w, i) => {
      const k = find(i);
      (groups.get(k) || groups.set(k, []).get(k)).push(w);
    });

    groups.forEach((g) => {
      g.sort((a, b) => (Math.abs(cy(a) - cy(b)) > th * 0.5 ? cy(a) - cy(b) : a.x0 - b.x0));
      const text = clean(g.map((w) => w.t).join(" "));
      if (SKIP_CELL.test(text) || text.replace(/[^A-Za-z0-9]/g, "").length < 3) return;

      // which time columns does this block cover? (a lab written across two periods covers two)
      const x0 = Math.min(...g.map((w) => w.x0));
      const x1 = Math.max(...g.map((w) => w.x1));
      const covered = [];
      cols.forEach((_, c) => {
        const ov = Math.min(x1, colEdges[c + 1]) - Math.max(x0, colEdges[c]);
        if (ov > 0.35 * (colEdges[c + 1] - colEdges[c])) covered.push(c);
      });
      if (!covered.length) {
        const c = bandOf(colEdges, (x0 + x1) / 2);
        if (c < 0) return;
        covered.push(c);
      }
      const a = Math.min(...covered), b = Math.max(...covered);

      const info = describe(text);
      const key = info.code || norm(info.name);
      if (!key) return;
      if (!subjects.has(key)) {
        // short abbreviation of the subject name (not the official course code);
        // if no real name was found (name is just the code), keep the code itself
        const short = info.short || (info.name === info.code ? info.code : abbreviate(info.name) || info.code);
        subjects.set(key, { id: nid(), name: info.name, code: short.slice(0, 20), credits: info.credits });
      }
      classes.push({
        id: nid(),
        subjectId: subjects.get(key).id,
        weekday: dayRows[r].d,
        startTime: cols[a].s,
        endTime: cols[b].e,
        classType: info.classType,
        room: info.room,
        professor: info.professor,
        on: true,
      });
    });
  });

  classes.sort((a, b) => ORDER.indexOf(a.weekday) - ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime));
  const warn = [];
  if (!classes.length) warn.push("Found the grid but no class names in it. Try a sharper, straighter image.");
  else if (!legend.size) warn.push("Could not read the course list at the bottom, so subjects show course codes. Rename them below.");
  return { subjects: [...subjects.values()].slice(0, 40), classes, warning: warn.join(" ") };
}

/* ---------- holidays ---------- */

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b";
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const WD = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
const WD_SRC = "\\b(mon|tues?|wednes|thurs?|fri|satur|sun)(?:d(?:a(?:y)?)?)?\\b";
const D = "(\\d{1,2})(?:st|nd|rd|th)?";
const DASH = "\\s*(?:-|–|—|to)\\s*";
const Y = "[\\s,]*(\\d{4})?";
const RX = {
  R2: new RegExp(`${D}\\s*(${MONTH})\\.?${Y}${DASH}${D}\\s*(${MONTH})\\.?${Y}`, "i"), // 28 Dec - 2 Jan
  R1: new RegExp(`${D}${DASH}${D}\\s*(${MONTH})\\.?${Y}`, "i"), // 12-13 January
  S1: new RegExp(`${D}[\\s-]*(${MONTH})\\.?${Y}`, "i"), // 1-Jan, 15 Feb
  S2: new RegExp(`(${MONTH})\\.?\\s*${D}${Y}`, "i"), // Jan 15
};

// "Good Friday 1" / "! Makar Sankranti" / "Eid-ul-Zoha Bl 1" -> clean festival name
const tidyHoliday = (s) => {
  const toks = clean(s).split(" ").filter(Boolean);
  const bad = (t) => t.replace(/[^A-Za-z]/g, "").length < 2; // "1", "|", "!", "Bl"-like scraps are caught below
  while (toks.length > 1 && (bad(toks[toks.length - 1]) || /^[A-Za-z]{1,2}$/.test(toks[toks.length - 1]))) toks.pop(); // "1", "BR", "oo"
  while (toks.length > 1 && bad(toks[0])) toks.shift();
  return toks.join(" ").replace(/^[^A-Za-z0-9]+|[\s\-–—:,.]+$/g, "");
};

export function parseHolidays(text, semStart, semEnd) {
  const y0 = Number((semStart || "").slice(0, 4)) || new Date().getFullYear();
  const y1 = Number((semEnd || "").slice(0, 4)) || y0;
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const valid = (y, m, d) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  };
  // The list has no year, so use its weekday column: "Thursday 1-Jan" can only be one nearby year.
  const pickYear = (m, d, wd) => {
    if (wd !== undefined) for (const y of [y0, y1, y0 - 1, y1 + 1]) if (valid(y, m, d) && new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) return y;
    for (let y = y0; y <= y1; y++) if (valid(y, m, d) && iso(y, m, d) >= semStart && iso(y, m, d) <= semEnd) return y;
    return y0;
  };
  const mk = (d, m, y, wd) => {
    d = Number(d);
    m = typeof m === "string" ? MON[m.slice(0, 3).toLowerCase()] : Number(m);
    y = y ? (String(y).length === 2 ? 2000 + Number(y) : Number(y)) : pickYear(m, d, wd);
    return valid(y, m, d) ? iso(y, m, d) : null;
  };
  const mkEnd = (start, d, m, y) => {
    let e = mk(d, m, y || start.slice(0, 4));
    if (e && e < start && !y) e = mk(d, m, Number(start.slice(0, 4)) + 1); // wraps past New Year
    return e;
  };

  function findDates(line, wd) {
    let m;
    const nums = [...line.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)];
    if (nums.length) {
      const l = nums[nums.length > 1 ? 1 : 0];
      const a = mk(nums[0][1], nums[0][2], nums[0][3]);
      const b = mk(l[1], l[2], l[3]);
      if (a) return { start: a, end: b && b >= a ? b : a, from: nums[0].index, to: l.index + l[0].length };
    }
    if ((m = line.match(RX.R2))) {
      const a = mk(m[1], m[2], m[3], wd);
      const b = a && mkEnd(a, m[4], m[5], m[6]);
      if (a && b) return { start: a, end: b, from: m.index, to: m.index + m[0].length };
    }
    if ((m = line.match(RX.R1))) {
      const a = mk(m[1], m[3], m[4], wd);
      const b = a && mkEnd(a, m[2], m[3], m[4]);
      if (a && b) return { start: a, end: b, from: m.index, to: m.index + m[0].length };
    }
    if ((m = line.match(RX.S1))) {
      const a = mk(m[1], m[2], m[3], wd);
      if (a) return { start: a, end: a, from: m.index, to: m.index + m[0].length };
    }
    if ((m = line.match(RX.S2))) {
      const a = mk(m[2], m[1], m[3], wd);
      if (a) return { start: a, end: a, from: m.index, to: m.index + m[0].length };
    }
    return null;
  }

  const wdAll = new RegExp(WD_SRC, "gi");
  const wdTail = new RegExp(`(?:\\s*[-–—]?\\s*${WD_SRC})+(?:[\\s|:,.!-]+[A-Za-z0-9]{1,2})*[\\s|:,.!-]*$`, "i"); // "... 1 Thursday" or "... 2 Monday-Tuesday"
  const serial = new RegExp(`^\\d{1,2}[.)]?\\s+(?!${MONTH})`, "i"); // "12 Sohrai": drop the serial number

  return text
    .split("\n")
    .map((l) => l.replace(/^[|_\s]+/, "").replace(serial, "").trim())
    .filter((l) => l.length > 5)
    .map((line) => {
      let f = findDates(line);
      if (!f) return null;
      const pre0 = clean(line.slice(0, f.from));
      const tail = pre0.match(wdTail);
      // the weekday column (just before the date) tells which year the date is in
      const first = tail ? [...tail[0].matchAll(wdAll)][0] : null;
      const wd = first ? WD[first[1].slice(0, 3).toLowerCase()] : undefined;
      if (wd !== undefined) f = findDates(line, wd) || f;
      const pre = pre0.replace(wdTail, "");
      const title = (tidyHoliday(pre) || tidyHoliday(clean(line.slice(f.to)))).slice(0, 100);
      const inside = (!semStart || f.start >= semStart) && (!semEnd || f.end <= semEnd);
      return { id: nid(), title: title || "Holiday", startDate: f.start, endDate: f.end, on: inside };
    })
    .filter(Boolean);
}