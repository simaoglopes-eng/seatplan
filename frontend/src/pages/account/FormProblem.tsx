// How the guest forms show problems (WCAG 3.3.1 and 4.1.3):
// - each problem sits next to its field (Field's `error`, tied with aria-describedby);
// - a box at the top lists them all, is announced (role="alert") and takes
//   focus, so a keyboard or screen-reader user lands on it after submitting.
import { useEffect, useRef } from "react";
import { ApiError } from "../../api/client";

/** Field name -> message. A missing or null entry means "no problem". */
export type FieldErrors = Record<string, string | null | undefined>;

interface ProblemBoxProps {
  /** Messages to list; nothing is shown when empty. */
  messages: string[];
  /** Goes up by one on every submit, so the box takes focus again even with the same text. */
  attempt: number;
}

export function ProblemBox({ messages, attempt }: ProblemBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = messages.length > 0;
  useEffect(() => {
    if (shown) ref.current?.focus();
  }, [shown, attempt]);
  if (!shown) return null;
  return (
    <div ref={ref} className="acc-problem" role="alert" tabIndex={-1}>
      <p className="acc-problem-title">{messages.length === 1 ? "There is a problem" : `There are ${messages.length} problems`}</p>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

/** The messages of every field that has one, in the order the fields are listed. */
export function listErrors(errors: FieldErrors): string[] {
  return Object.values(errors).filter((m): m is string => typeof m === "string" && m !== "");
}

/**
 * The server names the field at the start of a validation message, for
 * example "password: Use at least 10 characters." This splits it, so the
 * message can sit next to the right field. Unknown fields come back as null.
 */
export function splitFieldMessage(message: string, fields: readonly string[]): { field: string | null; text: string } {
  const match = /^([a-z_]+):\s*(.+)$/.exec(message);
  if (match && fields.includes(match[1])) return { field: match[1], text: match[2] };
  return { field: null, text: message };
}

/** Any thrown value as an ApiError, so pages only read `.code` and `.message`. */
export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "unknown", "Something unexpected happened. Please try again.");
}

/** A very small email check: the server does the real one. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
