// "Show password" next to a password field. A real button that says what it
// will do, with aria-pressed for its on/off state. It never moves focus.

interface PasswordToggleProps {
  shown: boolean;
  /** The id of the password input it controls. */
  controls: string;
  onToggle: () => void;
}

export function PasswordToggle({ shown, controls, onToggle }: PasswordToggleProps) {
  return (
    <button type="button" className="acc-toggle" aria-pressed={shown} aria-controls={controls} onClick={onToggle}>
      {shown ? "Hide password" : "Show password"}
    </button>
  );
}
