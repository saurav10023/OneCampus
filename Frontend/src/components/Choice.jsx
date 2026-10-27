import { Field } from "./Ui";

// A dropdown that always starts on "Select ..." so nothing is chosen by accident.
const Choice = ({ label, value, options, onChange, error, disabled, hint }) => (
  <Field as="select" label={label} value={value} onChange={onChange} error={error} disabled={disabled} hint={hint}>
    <option value="">Select {label.toLowerCase()}</option>
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </Field>
);

export default Choice;