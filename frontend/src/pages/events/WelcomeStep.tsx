// Step 1: a warm hello and one question with two big answers.
// Telling people how long the rest takes lowers the fear of starting.
import { Button } from "../../design/components";
import { StepTitle } from "./StepTitle";

interface WelcomeStepProps {
  firstName: string;
  busy: boolean;
  onAnswer: (answer: "yes" | "no") => void;
}

export function WelcomeStep({ firstName, busy, onAnswer }: WelcomeStepProps) {
  return (
    <section className="ev-card" aria-labelledby="ev-welcome">
      <StepTitle id="ev-welcome" focusOnMount={false}>
        Hi {firstName}, will you be there?
      </StepTitle>
      <p>
        If you are coming, you can tell us who you know and then pick your own seat on the map. It takes about two minutes, and you can
        change your seat later.
      </p>
      <div className="ev-actions">
        <Button busy={busy} onClick={() => onAnswer("yes")}>
          Yes, I will be there
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onAnswer("no")}>
          No, I cannot come
        </Button>
      </div>
    </section>
  );
}
