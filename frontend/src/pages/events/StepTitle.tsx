// A step heading that takes keyboard and screen-reader focus when a new step
// appears, so people using a screen reader hear where they are now instead of
// staying on a button that no longer exists.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface StepTitleProps {
  id: string;
  children: ReactNode;
  /** False on the very first screen: focus should not jump on page load. */
  focusOnMount: boolean;
}

export function StepTitle({ id, children, focusOnMount }: StepTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <h2 ref={ref} id={id} tabIndex={-1} className="ev-step-title">
      {children}
    </h2>
  );
}
