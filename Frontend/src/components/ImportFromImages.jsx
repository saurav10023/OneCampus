import { useState } from "react";
import { officialSchedulesApi, errMsg, toDateInput } from "../api/endpoints";
import { WEEKDAYS } from "../lib/dates";
import { isWithdrawn } from "../lib/prompt";
import { Alert } from "./Ui";
import { FormModal } from "./FormKit";
import DraftSections from "./DraftSections";
import { ocr, parseTimetable, parseHolidays } from "../lib/imageImport";

const MAX_SCHEDULE_SUBJECTS = 20; // same as the backend constant
const MAX_FILE_MB = 15;
const idOf = (x) => x?._id || x?.id;
const keyOf = (s) => s.key || idOf(s);

const fileCls =
  "block mt-1.5 w-full min-w-0 text-[13px] text-[color:var(--body)] " +
  "file:mr-3 file:h-10 file:px-4 file:rounded-xl file:border file:border-[color:var(--line)] file:bg-[color:var(--surface)] " +
  "file:text-[13px] file:font-medium file:text-[color:var(--ink)] hover:file:bg-[color:var(--inset)] file:cursor-pointer";

const ImportFromImages = ({ open, onClose, schedule, scheduleId, onDone }) => {
  const [ttFile, setTtFile] = useState(null);
  const [holFile, setHolFile] = useState(null);
  const [draft, setDraft] = useState(null); // { subjects, classes, holidays }
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const semStart = toDateInput(schedule?.semesterStart);
  const semEnd = toDateInput(schedule?.semesterEnd);

  const close = () => {
    setTtFile(null);
    setHolFile(null);
    setDraft(null);
    setNotes([]);
    setError("");
    onClose();
  };

  /* ---- file picker with checks ---- */
  const pick = (setter) => (e) => {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return setter(null);
    const reject = (msg) => {
      setError(msg);
      input.value = "";
      setter(null);
    };
    if (/heic|heif/i.test(`${f.type} ${f.name}`)) return reject("This photo is in HEIC format. Please take a screenshot of it, or convert it to JPG, and try again.");
    if (!f.type.startsWith("image/")) return reject("Please choose an image (JPG, PNG or WebP). PDFs are not supported.");
    if (f.size > MAX_FILE_MB * 1024 * 1024) return reject(`That image is larger than ${MAX_FILE_MB} MB. Please choose a smaller one.`);
    setError("");
    setter(f);
  };

  /* ---- step 1: read the images ---- */
  const read = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!ttFile && !holFile) return setError("Choose at least one image.");
    setBusy(true);
    setError("");
    try {
      const next = { subjects: [], classes: [], holidays: [] };
      const warn = [];
      if (ttFile) {
        setStatus("Reading timetable");
        const { words, canvas } = await ocr(ttFile, { mode: "table", onProgress: setProgress });
        const r = parseTimetable(words, canvas);
        next.subjects = r.subjects;
        next.classes = r.classes;
        if (r.warning) warn.push(r.warning);
      }
      if (holFile) {
        setStatus("Reading holiday list");
        const { text } = await ocr(holFile, { mode: "list", onProgress: setProgress });
        next.holidays = parseHolidays(text, semStart, semEnd);
        if (!next.holidays.length) warn.push("No holidays were found in the holiday image.");
      }
      setDraft(next);
      setNotes(warn);
    } catch (err) {
      setError(errMsg(err, "Could not read the image. Try a clearer one."));
    } finally {
      setBusy(false);
      setStatus("");
      setProgress(0);
    }
  };

  /* ---- step 2: edit the draft ---- */
  const upd = (key, id, patch) => setDraft((d) => ({ ...d, [key]: d[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const del = (key, id) => setDraft((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) }));
  const delSubject = (id) =>
    setDraft((d) => ({ ...d, subjects: d.subjects.filter((s) => s.id !== id), classes: d.classes.filter((c) => c.subjectId !== id) }));
  const nameOf = (id) => draft.subjects.find((s) => s.id === id)?.name || "?";

  const validate = () => {
    const names = new Set();
    for (const s of draft.subjects) {
      const n = s.name.trim();
      if (!n) return "A subject has no name.";
      if (n.length > 80) return `"${n.slice(0, 20)}…" is longer than 80 characters.`;
      if (names.has(n.toLowerCase())) return `Two subjects are named "${n}". Rename or remove one.`;
      names.add(n.toLowerCase());
    }
    const on = draft.classes.filter((c) => c.on);
    for (const c of on) {
      if (!c.startTime || !c.endTime || c.endTime <= c.startTime) return `${nameOf(c.subjectId)} on ${WEEKDAYS[c.weekday]}: the end time must be after the start time.`;
    }
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i], b = on[j];
        if (a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) {
          return `${WEEKDAYS[a.weekday]}: ${nameOf(a.subjectId)} and ${nameOf(b.subjectId)} overlap.`;
        }
      }
    for (const h of draft.holidays.filter((x) => x.on)) {
      if (!h.title.trim() || !h.startDate || !h.endDate || h.endDate < h.startDate) return `Check the holiday "${h.title || "untitled"}".`;
    }
    return "";
  };

  /* ---- step 3: save through the existing endpoints ---- */
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) return setError(problem);

    setBusy(true);
    setError("");
    const failed = [];
    try {
      const existing = (await officialSchedulesApi.subjects.list(scheduleId)).filter((s) => !isWithdrawn(s));
      const known = new Set(existing.map((s) => s.name.toLowerCase()));
      const fresh = draft.subjects.filter((s) => !known.has(s.name.trim().toLowerCase()));
      if (existing.length + fresh.length > MAX_SCHEDULE_SUBJECTS) {
        return setError(`A schedule can have ${MAX_SCHEDULE_SUBJECTS} subjects. You have ${existing.length} and this adds ${fresh.length}. Remove a few subjects below.`);
      }

      for (const s of fresh) {
        try {
          const code = s.code.trim();
          await officialSchedulesApi.subjects.create(scheduleId, { name: s.name.trim(), ...(code ? { code } : {}) });
        } catch (err) {
          failed.push(`${s.name}: ${errMsg(err, "failed")}`);
        }
      }
      const all = (await officialSchedulesApi.subjects.list(scheduleId)).filter((s) => !isWithdrawn(s));
      const keyByName = new Map(all.map((s) => [s.name.toLowerCase(), keyOf(s)]));

      const doneC = new Set();
      for (const c of draft.classes.filter((x) => x.on)) {
        const subjectKey = keyByName.get(nameOf(c.subjectId).trim().toLowerCase());
        if (!subjectKey) {
          failed.push(`${nameOf(c.subjectId)} ${WEEKDAYS[c.weekday]}: subject was not created`);
          continue;
        }
        try {
          await officialSchedulesApi.rules.create(scheduleId, {
            subjectKey,
            entryType: "weekly",
            weekday: Number(c.weekday),
            startTime: c.startTime,
            endTime: c.endTime,
            classType: c.classType,
            group: null,
            room: (c.room || "").trim(),
            professor: (c.professor || "").trim(),
            attendanceUnits: 1,
          });
          doneC.add(c.id);
        } catch (err) {
          failed.push(`${nameOf(c.subjectId)} ${WEEKDAYS[c.weekday]} ${c.startTime}: ${errMsg(err, "failed")}`);
        }
      }

      const items = await officialSchedulesApi.items.list(scheduleId).catch(() => []);
      const have = new Set(items.filter((i) => i.kind === "holiday").map((i) => `${toDateInput(i.startDate)}|${(i.title || "").toLowerCase()}`));
      const doneH = new Set();
      for (const h of draft.holidays.filter((x) => x.on)) {
        if (have.has(`${h.startDate}|${h.title.trim().toLowerCase()}`)) {
          doneH.add(h.id);
          continue;
        }
        try {
          await officialSchedulesApi.items.create(scheduleId, { kind: "holiday", title: h.title.trim(), startDate: h.startDate, endDate: h.endDate });
          doneH.add(h.id);
        } catch (err) {
          failed.push(`${h.title}: ${errMsg(err, "failed")}`);
        }
      }

      onDone?.();
      if (!failed.length) return close();
      // keep only what failed so a retry does not create duplicates
      setDraft((d) => ({ ...d, classes: d.classes.filter((c) => !doneC.has(c.id)), holidays: d.holidays.filter((h) => !doneH.has(h.id)) }));
      setError(`Saved what worked. These need attention: ${failed.join(" | ")}`);
    } catch (err) {
      setError(errMsg(err, "Could not save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const nClasses = draft?.classes.filter((c) => c.on).length || 0;
  const nHolidays = draft?.holidays.filter((h) => h.on).length || 0;

  return (
    <FormModal
      open={open}
      onClose={close}
      title={draft ? "Review before saving" : "Import from images"}
      size="xl"
      onSubmit={draft ? save : read}
      submitLabel={draft ? `Save ${draft.subjects.length} subjects, ${nClasses} classes, ${nHolidays} holidays` : "Read images"}
      saving={busy}
      dirty={Boolean(ttFile || holFile || draft)}
      error={error}
    >
      {!draft ? (
        <>
          <label className="block text-[13px] font-medium text-[color:var(--body)]">
            Class timetable image
            <input type="file" accept="image/*" onChange={pick(setTtFile)} className={fileCls} />
          </label>
          <label className="block text-[13px] font-medium text-[color:var(--body)]">
            Academic holiday list image
            <input type="file" accept="image/*" onChange={pick(setHolFile)} className={fileCls} />
          </label>
          {busy && (
            <Alert type="info">
              <span className="tabular-nums">{status}… {Math.round(progress * 100)}%</span>
            </Alert>
          )}
          <Alert type="info">
            Nothing is saved yet. The text is read on your device, then you check and fix it on the next screen. A straight, sharp image (JPG, PNG or WebP) with visible day names and time slots works best.
          </Alert>
        </>
      ) : (
        <>
          {notes.map((n) => (
            <Alert key={n} type="warning">{n}</Alert>
          ))}
          <DraftSections
            draft={draft}
            upd={upd}
            del={del}
            delSubject={delSubject}
            semStart={semStart}
            semEnd={semEnd}
          />
        </>
      )}
    </FormModal>
  );
};

export default ImportFromImages;