// The personal "appear anonymously" choice, with one line that says exactly
// who sees what. A native checkbox: it already works with keyboard and
// screen readers, and the shared Checkbox gives it a 44 px target.
import { Checkbox } from "../../design/components";

interface AnonymousSwitchProps {
  value: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}

export function AnonymousSwitch({ value, busy, onChange }: AnonymousSwitchProps) {
  return (
    <div className="ev-anon">
      <Checkbox
        label="Appear anonymously to other guests"
        hint='Other guests will see "Guest" instead of your name. The organiser always sees your name.'
        checked={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
