// Shows where the person is in a multi-step flow, such as
// "Date and party > Time > Table > Details". The current step is announced
// with aria-current; finished steps get a tick, not just a colour.
interface StepperProps {
  steps: string[];
  /** Index of the current step, starting at 0. */
  current: number;
  label?: string;
}

type StepStatus = "done" | "current" | "todo";

function stepStatus(index: number, current: number): StepStatus {
  if (index < current) return "done";
  if (index === current) return "current";
  return "todo";
}

export function Stepper({ steps, current, label = "Progress" }: StepperProps) {
  return (
    <nav aria-label={label}>
      <ol className="stepper">
        {steps.map((step, index) => {
          const status = stepStatus(index, current);
          return (
            <li key={step} className={`stepper-step stepper-${status}`} aria-current={status === "current" ? "step" : undefined}>
              <span className="stepper-dot" aria-hidden="true">
                {status === "done" ? (
                  <svg viewBox="0 0 16 16">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="stepper-label">
                {step}
                {status === "done" && <span className="visually-hidden"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
