// The heading of each booking step. When a new step appears, keyboard and
// screen-reader focus moves to its heading, so people hear where they are
// instead of being left on a button that no longer exists.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface StepHeadingProps {
  children: ReactNode;
  /** False on the very first screen: we do not steal focus when the page opens. */
  focusOnMount?: boolean;
}

export function StepHeading({ children, focusOnMount = true }: StepHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <h2 ref={ref} tabIndex={-1} className="rb-step-title">
      {children}
    </h2>
  );
}
