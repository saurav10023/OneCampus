import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { subjectsApi, errMsg } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner } from "../../components/Ui";

const SubjectsTab = ({ setupId, readOnly }) => {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null); // null | "new" | subject
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setSubjects(await subjectsApi.list(setupId));
    } catch (e) {
      setError(errMsg(e, "Could not load subjects"));
    } finally {
      setLoading(false);
    }
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (subject) => {
    setEditing(subject || "new");
    setName(subject?.name || "");
    setCode(subject?.code || "");
    setFormError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const body = { name: name.trim(), code: code.trim() };
    try {
      if (editing === "new") await subjectsApi.create(setupId, body);
      else await subjectsApi.update(setupId, editing._id, body);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the subject"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? Its classes will be affected.`)) return;
    try {
      await subjectsApi.remove(setupId, s._id);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not delete the subject"));
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{subjects.length} subject{subjects.length === 1 ? "" : "s"}</p>
        {!readOnly && (
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="w-4 h-4" />Add subject
          </Button>
        )}
      </div>

      <Alert type="error">{error}</Alert>

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          text="Add the subjects you study this semester. Weekly classes are built on top of them."
          action={!readOnly && <Button onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add subject</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {subjects.map((s) => (
            <Card key={s._id} className="p-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15.5px] font-semibold text-[#161827] truncate">{s.name}</p>
                {s.code && <div className="mt-1.5"><Badge tone="brand">{s.code}</Badge></div>}
              </div>
              {!readOnly && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openForm(s)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(s)} aria-label="Delete" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add subject" : "Edit subject"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          <Field label="Subject name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Data Structures" required />
          <Field label="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS301" hint="Must be unique within this setup." />
          <Button type="submit" loading={saving}>{editing === "new" ? "Add subject" : "Save changes"}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default SubjectsTab;