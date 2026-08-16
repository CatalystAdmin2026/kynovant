// ─────────────────────────────────────────────────────────────
// Kynovant — CredentialVerifier Interface (design-only, not wired up)
//
// SERVER-ONLY (types only today — no runtime code).
//
// NOT IMPLEMENTED. NOT INTEGRATED. NOT REGISTERED ANYWHERE. This file
// exists to pin the contract a future automated RD/RDN verification
// provider must satisfy, so that when one is built it slots into
// coach-credential-service.ts's existing review/history pipeline
// without a rewrite of coach_credentials, coach_credential_reviews, or
// isVerifiedRd(). See docs/ARCHITECTURE_DECISIONS.md ADR-015.
//
// PROVIDER-NEUTRAL BY DESIGN — same philosophy as Kynovant's planned
// K-OS model-router: this interface names no vendor, no specific
// state licensing board, no specific registry API. A future
// implementation (e.g. "verify against the Commission on Dietetic
// Registration's public lookup") lives in its OWN file implementing
// this interface; this file never imports or references it.
//
// THE AUTHORIZATION BOUNDARY DOES NOT MOVE. isVerifiedRd()
// (lib/auth/rd-credential.ts) will continue to read ONLY
// coach_credentials.status + expirationDate, exactly as it does today.
// A CredentialVerifier's job is narrower than "decide access" — it
// produces a VerificationOutcome; something else (a future
// runAutomatedVerification()-shaped function, not written yet) is
// responsible for turning a 'verified' outcome into the SAME
// reviewCredential()-shaped write coach-credential-service.ts already
// performs for a manual approval: set status/verificationMethod/
// lastVerifiedAt on coachCredentials, and log the event to
// coachCredentialReviews with performedByType: 'automated'. A
// verifier NEVER writes to the database directly, and NEVER sets
// coachCredentials.status itself — see "WHAT A VERIFIER MUST NOT DO"
// below.
//
// K-OS MAY OPERATE THIS PIPELINE LATER (deciding when to invoke a
// verifier, retrying, routing exceptions) BUT MUST NOT BECOME THE
// VERIFIER OR THE AUTHORIZATION BOUNDARY ITSELF. K-OS orchestrating
// "call the verifier, then call the same deterministic write path a
// human reviewer uses" is fine; K-OS (or any LLM) independently
// deciding "this looks like a valid license" and that decision alone
// setting status='approved' is exactly what this architecture must
// never allow — see VerificationOutcome's doc comment.
//
// WHAT A VERIFIER MUST NOT DO (binding constraints on any future
// implementation of this interface, not just guidance):
//   - Must not persist raw response payloads from an external
//     verification source. VerificationOutcome's evidence field is
//     capped to a small, structured summary specifically to make that
//     mistake hard to make by accident.
//   - Must not report 'verified' from an LLM's textual judgment that
//     a document "looks legitimate." 'verified' means the credential
//     was matched against an authoritative external source (a real
//     registry/licensing-board lookup) — a confidence score or
//     free-text assessment is, at most, evidence that ROUTES a
//     submission toward 'needs_manual_review', never a basis for
//     'verified' on its own.
//   - Must not throw for an ordinary "not found" or "mismatch" result
//     — those are BusinessOutcomes ('not_found' / 'mismatch'), not
//     exceptions. A verifier may throw/reject only for genuine
//     infrastructure failure (network error, malformed provider
//     response) — the caller is expected to treat a thrown error the
//     same as 'source_unavailable': route to manual review, never to
//     'verified'.
// ─────────────────────────────────────────────────────────────

import "server-only";

// What Kynovant already has on file for this coach, passed to a
// verifier so it never needs its own copy of coach_credentials'
// shape. Deliberately narrow — no proof-document bytes, no internal
// database IDs, nothing beyond what an external lookup would actually
// need to attempt a match.
export interface CredentialVerificationRequest {
  credentialType: "rd" | "rdn";
  licenseNumber: string;
  issuingState: string;
  expirationDate: string; // "YYYY-MM-DD", as submitted
  // The coach's name as Kynovant has it on file, for a verifier that
  // matches on name + license number (many registry lookups do both).
  // Nothing more identity-shaped than this is passed.
  coachDisplayName: string | null;
}

// A verifier's result. Discriminated on `outcome` so a caller cannot
// forget to handle a case — there is deliberately no single boolean
// "verified: true/false"; "we don't know" and "we tried and it didn't
// match" and "we couldn't check" are different situations that must
// route differently (all three land in the exception queue today —
// manual_review_required stays/becomes true for all of them — but
// they are not the same fact, and reasonCode should say which).
export type VerificationOutcome =
  | {
      outcome: "verified";
      // Freeform but short — which authority/registry was consulted.
      // Provider-neutral: no vendor name is hardcoded anywhere in
      // this file; a real implementation supplies its own value here.
      source: string;
      // Opaque reference into the source system (e.g. a lookup/
      // transaction id) for later audit — never the full response.
      externalReference: string | null;
      // Small, structured, non-sensitive summary ONLY — e.g.
      // { matchedName: true, matchedLicenseNumber: true,
      //   registryStatus: "active" }. NEVER the raw provider response
      // body, NEVER anything containing more PII than Kynovant already
      // collected in CredentialVerificationRequest. Capped in size and
      // shape by convention, not by a hard schema here — a real
      // implementation's own tests must prove it upholds this.
      evidence?: Record<string, string | boolean | number>;
    }
  | {
      outcome: "not_found" | "mismatch" | "source_unavailable" | "needs_manual_review";
      // Short, structured — e.g. "license_not_found",
      // "name_mismatch", "registry_unreachable", "ambiguous_match".
      // Not a paragraph; see coach_credential_reviews.reasonCode.
      reasonCode: string;
      source: string | null;
    };

// A future automated verifier implements this. Pure input → output;
// no database access, no Storage access, no knowledge of
// coach_credentials' schema. Keeping the interface this narrow is what
// makes it swappable per-provider and testable in isolation.
export interface CredentialVerifier {
  readonly name: string; // provider-neutral identifier, e.g. "cdr-lookup" — not a display label
  verify(request: CredentialVerificationRequest): Promise<VerificationOutcome>;
}
