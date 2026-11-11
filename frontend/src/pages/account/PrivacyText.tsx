// The privacy text for guest accounts (docs/guest-accounts.md section 11.2).
// One copy, shown on the sign-up form and on the account page, so the two
// can never say different things.

/** The date of this text; the server stores it as consent_version. */
export const PRIVACY_VERSION = "2026-11-10";

export function PrivacyText() {
  return (
    <div className="acc-privacy">
      <p>
        <strong>What we store.</strong> Your name, your email address, your password in a scrambled form we cannot read, the events you join,
        your seat, the people you say you know, whether you need an accessible seat and whether you want to be shown as "Guest".
      </p>
      <p>
        The organiser of each event you join sees your name, email and seat. Other guests see your name only as the organiser's privacy
        setting allows, never your email.
      </p>
      <p>
        We email you only about your seat: a confirmation or a change comes with a picture of the room that shows no other guest's name; a
        reminder or a "seat released" email has no picture. We never send marketing. We keep the words of each email for 30 days.
      </p>
      <p>
        We keep your account until you delete it. For security we also keep, without your name or email, a log of changes to seats and
        short-lived counters that slow down password guessing.
      </p>
      <p>
        You can delete your account at any time on the My account page: we free your seats and wipe the emails we keep for you. If an
        organiser invited you, they keep their own record of that invitation. Copies already in your inbox stay there.
      </p>
    </div>
  );
}
