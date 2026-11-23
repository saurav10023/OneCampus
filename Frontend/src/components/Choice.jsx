import { Field } from "./Ui";

// Soft grey chevron drawn as a background image, so the native arrow can be hidden and the select matches the other inputs.
// In dark mode index.css swaps it for a lighter one (`.dark select.appearance-none`), because a data-URI can't read theme tokens.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23636A82' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

// A dropdown that always starts on "Select ..." so nothing is chosen by accident.
// The placeholder state is muted; a chosen value reads in full ink.
const Choice = ({ label, value, options, onChange, error, disabled, hint }) => (
  <Field
    as="select"
    label={label}
    value={value}
    onChange={onChange}
    error={error}
    disabled={disabled}
    hint={hint}
    className={`appearance-none pr-10 cursor-pointer disabled:cursor-not-allowed ${value ? "" : "!text-[color:var(--muted)]"}`}
    style={{ backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", backgroundSize: "16px" }}
  >
    <option value="">Select {label.toLowerCase()}</option>
    {options.map((o) => (
      <option key={o} value={o} className="text-[color:var(--ink)]">
        {o}
      </option>
    ))}
  </Field>
);

export default Choice;