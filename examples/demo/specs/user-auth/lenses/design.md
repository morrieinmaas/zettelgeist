# Design lens — user-auth

## Sign-in screen

The login form is the single front door for both local and SSO users. We chose a
unified entry rather than an "SSO or local?" disambiguation page because:

- Most customers don't know which protocol their IDP speaks.
- The IT person setting up SSO knows; the end user shouldn't have to.

The form's primary input is **email**. On blur, the client looks up which auth
methods are configured for the email's domain and adapts:

- Local-only domain → password field appears, sign-in submits.
- SAML/OIDC domain → "Continue with $IDP_NAME" button appears, password field hides.
- New / unknown domain → "Continue" button leads to a sign-up flow (separate spec).

## Error states

We deliberately do not distinguish "wrong email" from "wrong password" in error
copy — that's an enumeration vector. The message is always "Email or password is
incorrect," regardless of which one was wrong.

For SSO failures, we surface the underlying IDP error code (e.g. `invalid_grant`)
only to authenticated admins, not to end users. End users see "We couldn't reach
your identity provider. Please try again in a few minutes, or contact your IT
administrator."

## Mobile

The screen is mobile-first: single-column, 16px base font, large tap targets.
The "Continue with $IDP" button uses the IDP's actual brand color (we ship a
small lookup table of the common providers).
