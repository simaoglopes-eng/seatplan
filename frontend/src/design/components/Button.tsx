import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and blocks double submits while a request is running. */
  busy?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", busy = false, disabled, className = "", children, type = "button", onClick, ...rest }: ButtonProps) {
  // While busy we must NOT set the native `disabled`: browsers move focus off a
  // disabled button to <body>, which drops keyboard users out of dialogs.
  // aria-disabled says "unavailable" to screen readers and keeps focus here.
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (busy) {
      event.preventDefault(); // also stops a submit button from sending its form twice
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      className={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
    >
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      <span className="btn-label">{children}</span>
    </button>
  );
}
