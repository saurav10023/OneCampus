// codemod-dark.mjs
// Replaces hard-coded theme colours in Tailwind classes with CSS variables, so dark mode works everywhere.
//
//   node codemod-dark.mjs          -> dry run: shows what WOULD change, writes nothing
//   node codemod-dark.mjs --write  -> applies the changes
//   node codemod-dark.mjs --write path/to/folder   (default folder is ./src)

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const ROOT = args.find((a) => !a.startsWith("--")) || "src";
const EXT = new Set([".jsx", ".tsx", ".js", ".ts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

// hex (upper-case, no #) -> variable defined in index.css
const TOKENS = {
  "1B1F33": "ink",
  "161827": "ink",          // older ink value used in a few files
  "444A63": "body",
  "636A82": "muted",
  "6A6F85": "muted",        // older muted value
  "9AA0B5": "faint",
  F5F6FA: "inset",
  E4E7EF: "line",
  EEF0F6: "line-soft",
  CBD0DE: "line-strong",
  E9ECF3: "track",
};

// utilities that take a colour (border-t etc. included). Arbitrary colour needs the `color:` type hint.
const UTIL = "(?:bg|text|border|border-[trblxy]|divide|ring|outline|from|to|via|stroke|fill|accent|decoration|caret)";
const HEX_RE = new RegExp(`(?<![\\w-])(${UTIL})-\\[#([0-9A-Fa-f]{6})\\](?!/)`, "g");

// bg-white with an opacity, e.g. bg-white/70 (only 55 and up: lower values are overlays on coloured buttons)
const WHITE_ALPHA_RE = /(?<![\w-])bg-white\/(\d{2,3})(?![\w])/g;
// plain bg-white, but not when it is a whole quoted token like "bg-white" (those are conditional dots on indigo)
const WHITE_RE = /(?<![\w-])bg-white(?![\w/-])/g;

const stats = { files: 0, hex: 0, white: 0 };

function transform(src) {
  let hex = 0;
  let white = 0;

  let out = src.replace(HEX_RE, (m, util, h) => {
    const t = TOKENS[h.toUpperCase()];
    if (!t) return m;
    hex++;
    return `${util}-[color:var(--${t})]`;
  });

  out = out.replace(WHITE_ALPHA_RE, (m, a) => {
    if (Number(a) < 55) return m;
    white++;
    return `bg-[color-mix(in_srgb,var(--surface)_${a}%,transparent)]`;
  });

  out = out.replace(WHITE_RE, (m, offset, whole) => {
    const before = whole[offset - 1];
    const after = whole[offset + m.length];
    if ((before === '"' || before === "'" || before === "`") && (after === '"' || after === "'" || after === "`")) return m;
    white++;
    return "bg-[color:var(--surface)]";
  });

  return { out, hex, white };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(path.join(dir, e.name));
    return EXT.has(path.extname(e.name)) ? [path.join(dir, e.name)] : [];
  });
}

if (!fs.existsSync(ROOT)) {
  console.error(`Folder not found: ${ROOT}. Run this from your project root, or pass the folder path.`);
  process.exit(1);
}

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const { out, hex, white } = transform(src);
  if (out === src) continue;
  stats.files++;
  stats.hex += hex;
  stats.white += white;
  console.log(`${WRITE ? "updated " : "would update "} ${file}  (${hex} colours, ${white} white surfaces)`);
  if (WRITE) fs.writeFileSync(file, out);
}

console.log(
  `\n${WRITE ? "Done." : "Dry run only."} ${stats.files} file(s), ${stats.hex} colour swaps, ${stats.white} white-surface swaps.`
);
if (!WRITE) console.log("Run again with --write to apply.");