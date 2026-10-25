// Shared editor for lab batches / elective groups (used when creating and editing a schedule).
// On phones each group is a small stacked card; from sm up it is a single row.
import { Plus, Trash2 } from "lucide-react";
import { GROUP_KINDS, emptyGroup, updateRow, removeRow } from "../lib/groups";
import { Button, Field } from "./Ui";

const Caption = ({ children }) => <span className="block text-[11.5px] text-[#6A6F85] mb-1 px-1">{children}</span>;

const GroupsEditor = ({ groups, setGroups, lockExisting = false }) => (
  <div>
    <div className="flex items-start justify-between gap-3 mb-3 px-1">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]">Lab batches / groups</p>
        <p className="text-[12.5px] text-[#6A6F85] mt-0.5">Optional. Add these if some classes are only for certain batches.</p>
      </div>
      <Button type="button" variant="glass" size="sm" className="shrink-0" onClick={() => setGroups((g) => [...g, emptyGroup()])}>
        <Plus className="w-4 h-4" />
        Add group
      </Button>
    </div>

    <div className="space-y-2.5">
      {groups.map((g, i) => (
        <div key={i} className="rounded-2xl bg-white/50 border border-white/80 p-3 grid gap-2.5 sm:grid-cols-[1fr_1fr_130px_auto] sm:items-end">
          <div>
            <Caption>Key</Caption>
            <Field
              aria-label={`Group ${i + 1} key`}
              value={g.key}
              onChange={(e) => setGroups((a) => updateRow(a, i, "key", e.target.value))}
              placeholder="lab-b1 (optional)"
              disabled={lockExisting && g.existing}
            />
          </div>
          <div>
            <Caption>Name students see</Caption>
            <Field
              aria-label={`Group ${i + 1} name`}
              value={g.label}
              onChange={(e) => setGroups((a) => updateRow(a, i, "label", e.target.value))}
              placeholder="Lab Batch B1"
            />
          </div>
          <div>
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
            className="h-11 sm:w-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <Trash2 className="w-4 h-4" />
            <span className="sm:hidden">Remove group</span>
          </button>
        </div>
      ))}

      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#161827]/15 px-4 py-3.5 text-[13px] text-[#6A6F85]">
          No groups yet. Every class will apply to the whole section.
        </p>
      )}
    </div>

    <p className="text-[12px] leading-relaxed text-[#6A6F85] mt-2.5 px-1">
      Leave the key empty to create it from the name.
      {lockExisting && " Keys of existing groups can't be renamed because weekly classes may use them, and removing a group that classes already use may be rejected."}
    </p>
  </div>
);

export default GroupsEditor;