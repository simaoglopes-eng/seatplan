# Restaurant owners

OwnerSignUpPage handles the emailed-code registration flow. The session is
stored only after verification succeeds. OwnerHomePage loads private cards
through api/owner.ts. Owner sign-in reuses Login with /owner as its default
destination. Existing event and staff login destinations retain their defaults.

The page uses the shared design tokens and components. Account endpoints reject
unknown fields and the server controls ownership, publication and setup progress.

Why separate owner and guest accounts? Owners use organiser sessions, which are
accepted by the existing staff tools. Guest account sessions have another format.

Can hiding another owner's card enforce privacy? The API filters by owner id
and applies the same 404 rule at resource endpoints. The UI only displays it.

When is a demo code shown? Only when the server's existing demo checks permit
it. The UI renders code_shown if present and always supports emailed codes.
