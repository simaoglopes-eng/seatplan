// Add one guest by hand. The answer contains their personal link, which is
// shown straight away because the server cannot show it again later.
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import * as eventsApi from "../../api/events";
import { Button, Field } from "../../design/components";
import type { OrganiserState } from "./useOrganiser";

// A light check for typing mistakes only; the server does the real validation.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddGuestForm({ org }: { org: OrganiserState }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = {
      name: name.trim() === "" ? "Please enter the guest's name." : undefined,
      email: LOOKS_LIKE_EMAIL.test(email.trim()) ? undefined : "Please enter an email address such as ana@example.com.",
    };
    setErrors(found);
    if (found.name || found.email) return;
    const ok = await org.run("add", `${name.trim()} was added. Their personal link is ready to copy.`, async () => {
      const created = await eventsApi.addGuest(org.eventId, { name: name.trim(), email: email.trim() });
      org.rememberLink(created.id, created.link);
    });
    if (ok) {
      setName("");
      setEmail("");
      // Ready for the next guest. Focus also never falls back to the top of the page.
      formRef.current?.querySelector("input")?.focus();
    }
  };

  return (
    <form ref={formRef} className="ev-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <h3 className="ev-subtitle">Add a guest</h3>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" />
      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="off" />
      <Button type="submit" busy={org.busy === "add"}>
        Add guest
      </Button>
    </form>
  );
}
