// The three non-happy states every data screen needs: loading, empty, error.
// Having them as components keeps every page honest about all three.
import type { ReactNode } from "react";
import { Button } from "./Button";

/** Grey placeholder blocks shaped like the content that is loading. */
export function Skeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}...</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" aria-hidden="true" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="state-box state-empty">
      <svg className="state-icon" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="9" />
        <circle cx="24" cy="8" r="3.5" />
        <circle cx="40" cy="24" r="3.5" />
        <circle cx="24" cy="40" r="3.5" />
        <circle cx="8" cy="24" r="3.5" />
      </svg>
      <h2 className="state-title">{title}</h2>
      {children && <div className="state-body">{children}</div>}
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  /** 1 when the error is all the page shows, so the page still has a main heading. */
  headingLevel?: 1 | 2;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ErrorState({ title = "Something went wrong", headingLevel = 2, message, onRetry, children }: ErrorStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="state-box state-error" role="alert">
      <svg className="state-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 6L44 40H4Z" />
        <path d="M24 19v10M24 34v1" />
      </svg>
      <Heading className="state-title">{title}</Heading>
      <p className="state-body">{message}</p>
      {children}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
