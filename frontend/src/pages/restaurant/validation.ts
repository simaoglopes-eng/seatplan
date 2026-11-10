// Inline checks for the contact form. The server checks again (it is the
// one that decides); these only save the diner a round trip and say exactly
// what to fix, next to the field.
import type { ContactDetails } from "../../api/restaurant";

export type ContactErrors = Partial<Record<keyof ContactDetails, string>>;

// Deliberately simple: something@something.something. The server uses
// email-validator for the real check, so we only catch obvious typos here.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits, spaces, plus, brackets and dashes; at least 6 digits in total.
const PHONE_CHARS = /^[0-9+()\-\s]*$/;

export function nameError(name: string): string | undefined {
  if (name.trim() === "") return "Please enter the name for the booking.";
  if (name.trim().length > 80) return "Please keep the name under 80 characters.";
  return undefined;
}

export function emailError(email: string): string | undefined {
  if (email.trim() === "") return "Please enter your email, so we can send the confirmation.";
  if (!EMAIL_SHAPE.test(email.trim())) return "This email looks incomplete. It should look like name@example.com.";
  return undefined;
}

export function phoneError(phone: string): string | undefined {
  if (phone.trim() === "") return undefined; // optional
  const digits = phone.replace(/\D/g, "");
  if (!PHONE_CHARS.test(phone) || digits.length < 6) return "Use digits only, for example +351 912 345 678. Or leave it empty.";
  return undefined;
}

export function notesError(notes: string): string | undefined {
  return notes.length > 500 ? "Please keep notes under 500 characters." : undefined;
}

/** All problems at once, keyed by field. An empty object means the form is fine. */
export function validateContact(contact: ContactDetails): ContactErrors {
  const errors: ContactErrors = {
    name: nameError(contact.name),
    email: emailError(contact.email),
    phone: phoneError(contact.phone),
    notes: notesError(contact.notes),
  };
  // Drop the fields without a problem, so Object.keys(errors).length counts real errors.
  for (const key of Object.keys(errors) as (keyof ContactDetails)[]) {
    if (errors[key] === undefined) delete errors[key];
  }
  return errors;
}
