// Shared editor for lab batches / elective groups (used when creating and editing a schedule).
// Layout follows the width of the dialog it sits in (container queries), not the screen, so fields never overlap.
import { Plus, Trash2 } from "lucide-react";
import { GROUP_KINDS, emptyGroup, updateRow, removeRow } from "../lib/groups";
import { Button, Field } from "./Ui";

const Caption = ({ children }) => <span className="block text-[12px] text-[color:var(--muted)] mb-1 px-1">{children}</span>;

const GroupsEditor = ({ groups, setGroups, lockExisting = false }) => (
  <div className="@container min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3 px-1">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[13px] font-medium text-[color:var(--body)]">Lab batches and groups</p>
        <p className="text-[12.5px] text-[color:var(--muted)] mt-0.5">Optional. Add these if some classes are only for certain batches.</p>
      </div>
      <Button type="button" variant="glass" size="sm" className="shrink-0" onClick={() => setGroups((g) => [...g, emptyGroup()])}>
        <Plus className="w-4 h-4" />
        Add group
      </Button>
    </div>

    <div className="space-y-2.5">
      {groups.map((g, i) => (
        <div
          key={i}
          className="rounded-xl bg-[color:var(--inset)] p-3 grid gap-2.5 min-w-0 grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_auto] @lg:items-end"
        >
          <div className="min-w-0">
            <Caption>Key</Caption>
            <Field
              aria-label={`Group ${i + 1} key`}
              value={g.key}
              onChange={(e) => setGroups((a) => updateRow(a, i, "key", e.target.value))}
              placeholder="lab-b1 (optional)"
              disabled={lockExisting && g.existing}
            />
          </div>
          <div className="min-w-0">
            <Caption>Name students see</Caption>
            <Field
              aria-label={`Group ${i + 1} name`}
              value={g.label}
              onChange={(e) => setGroups((a) => updateRow(a, i, "label", e.target.value))}
              placeholder="Lab Batch B1"
            />
          </div>
          <div className="min-w-0">
            <Caption>Type</Caption>
            <Field as="select" aria-label={`Group ${i + 1} type`} value={g.kind} onChange={(e) => setGroups((a) => updateRow(a, i, "kind", e.target.value))}>
              {GROUP_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setGroups((a) => removeRow(a, i))}
            aria-label={`Remove group ${i + 1}`}
            className="h-11 @lg:w-11 rounded-xl flex items-center justify-center gap-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
          >
            <Trash2 className="w-4 h-4" />
            <span className="@lg:hidden">Remove group</span>
          </button>
        </div>
      ))}

      {groups.length === 0 && (
        <p className="rounded-xl bg-[color:var(--inset)] px-4 py-3.5 text-[13px] text-[color:var(--muted)]">
          No groups yet. Every class will apply to the whole section.
        </p>
      )}
    </div>

    <p className="text-[12px] leading-relaxed text-[color:var(--muted)] mt-2.5 px-1">
      Leave the key empty to create it from the name.
      {lockExisting && " Keys of existing groups can't be renamed because weekly classes may use them, and removing a group that classes already use may be rejected."}
    </p>
  </div>
);

export default GroupsEditor;