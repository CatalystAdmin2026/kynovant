import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";

// ── Types ──────────────────────────────────────────────────────────────────

interface SendAgreementBody {
  clientName: string;
  clientEmail: string;
  packageName: string;
  monthlyRate: string;
  monthlyRateLabel: string;
  startDate: string;
  crmId?: string;
}

// ── JWT helpers ────────────────────────────────────────────────────────────

/** Encode a Buffer as base64url (URL-safe base64, no padding). */
function b64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a DocuSign JWT Grant token.
 * audience: account-d.docusign.com (sandbox) | account.docusign.com (production)
 */
function buildJWT(
  integrationKey: string,
  userId: string,
  audience: string,
  privateKeyPem: string,
): string {
  const header  = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url(Buffer.from(JSON.stringify({
    iss:   integrationKey,
    sub:   userId,
    aud:   audience,
    iat:   now,
    exp:   now + 3600,
    scope: "signature impersonation",
  })));
  const signingInput = `${header}.${payload}`;
  const signer       = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const sig = b64url(signer.sign({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING }));
  return `${signingInput}.${sig}`;
}

/**
 * Exchange a signed JWT for a DocuSign access token.
 * Throws a safe (no-secret) error on failure — caller catches and logs.
 */
async function fetchAccessToken(jwt: string, authBase: string): Promise<string> {
  const res = await fetch(`https://${authBase}/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    // Log details server-side only; never return raw DocuSign auth errors to client
    const detail = await res.text().catch(() => "(no body)");
    console.error("[DocuSign] Auth failed:", res.status, detail);
    throw new Error(
      "DocuSign authentication failed — ensure DOCUSIGN_USER_ID has granted consent in the DocuSign developer portal",
    );
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/**
 * Create a DocuSign envelope from the Catalyst Coaching Master Client Agreement template.
 *
 * Template role names must match EXACTLY what is configured in DocuSign:
 *   - "Client"  → signs first
 *   - "Coach"   → signs second (manually, no auto-sign)
 *
 * Text tab pre-fill: both tabLabel and dataLabel are set to the same value.
 * The classic DocuSign template editor exposes this as "Tab Label"; the newer
 * editor shows it as "Data Label". The API matches on either, so we send both
 * to ensure pre-fill works regardless of which editor was used to build the template.
 * DocuSign silently skips any tab whose identifiers don't match — no error is thrown.
 * Field identifiers are case-sensitive.
 */
async function sendEnvelope(
  accessToken: string,
  accountId: string,
  apiBase: string,
  templateId: string,
  body: SendAgreementBody,
): Promise<string> {
  const agreementId   = `AGR-${Date.now()}`;
  const generatedDate = new Date().toISOString().split("T")[0];

  // Helper so every tab carries both tabLabel and dataLabel with the same identifier.
  const tab = (label: string, value: string) => ({ tabLabel: label, dataLabel: label, value });

  const envelopeDefinition = {
    templateId,
    status: "sent",
    // prefillTabs populate fields that are not assigned to a signer role.
    // The new DocuSign template editor marks these fields as "Prefill" fields;
    // the classic editor calls them "Sender" fields. Either way, top-level
    // tabs.prefillTabs is the correct API location — NOT inside a templateRole.
    templateRoles: [
      {
        roleName: "Client",
        name:     body.clientName,
        email:    body.clientEmail,
        tabs: {
          textTabs: [
            tab("ClientName",        body.clientName),
            tab("ClientEmail",       body.clientEmail),
            tab("PackageName",       body.packageName),
            tab("MonthlyRate",       body.monthlyRate),
            tab("MonthlyRateLabel",  body.monthlyRateLabel),
            tab("StartDate",         body.startDate),
            tab("CRM_ID",            body.crmId || agreementId),
            tab("Agreement_ID",      agreementId),
            tab("Agreement_Version", "1.0"),
            tab("Generated_Date",    generatedDate),
          ],
        },
      },
      {
        // Coach signs second — Jermaine reviews and finalizes manually in DocuSign
        // Do NOT add clientUserId here — that would make it an embedded signer
        roleName: "Coach",
        name:     "Jermaine Jones",
        email:    "catalyst.coaching.headcoach@gmail.com",
      },
    ],
  };

  const res = await fetch(
    `https://${apiBase}/restapi/v2.1/accounts/${accountId}/envelopes`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelopeDefinition),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    console.error("[DocuSign] Envelope create failed:", res.status, detail);
    throw new Error(
      `Envelope create failed (${res.status}): ${detail}`
    );
  }

  const json = (await res.json()) as { envelopeId: string };
  return json.envelopeId;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Validate body
  let body: SendAgreementBody;
  try {
    body = (await req.json()) as SendAgreementBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Check all required env vars
  const {
    DOCUSIGN_INTEGRATION_KEY: integrationKey,
    DOCUSIGN_USER_ID:         userId,
    DOCUSIGN_ACCOUNT_ID:      accountId,
    DOCUSIGN_PRIVATE_KEY:     privateKeyRaw,
    DOCUSIGN_TEMPLATE_ID:     templateId,
    DOCUSIGN_BASE_PATH:       basePath,
  } = process.env;

  const configured = !!(integrationKey && userId && accountId && privateKeyRaw && templateId);
  if (!configured) {
    return NextResponse.json({
      ok:         false,
      configured: false,
      message:    "DocuSign is not configured yet. Add DocuSign environment variables to .env.local.",
    });
  }

  // Derive auth base from API base path
  // demo.docusign.net → account-d.docusign.com (sandbox)
  // www.docusign.net  → account.docusign.com  (production)
  const apiBase  = basePath ?? "demo.docusign.net";
  const authBase = apiBase === "www.docusign.net"
    ? "account.docusign.com"
    : "account-d.docusign.com";

  // Normalize private key — .env.local stores literal \n escape sequences
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n");

  try {
    const jwt         = buildJWT(integrationKey, userId, authBase, privateKeyPem);
    const accessToken = await fetchAccessToken(jwt, authBase);
    const envelopeId  = await sendEnvelope(accessToken, accountId, apiBase, templateId, body);

    return NextResponse.json({
      ok:         true,
      configured: true,
      mode:       "live",
      envelopeId,
      message:    "Agreement sent successfully",
    });
  } catch (err) {
    // Full error logged server-side only — client gets a safe message
    console.error("[DocuSign] send-agreement error:", err);
    return NextResponse.json(
      {
        ok:         false,
        configured: true,
        message:    err instanceof Error ? err.message : "DocuSign error — check server logs",
      },
      { status: 500 },
    );
  }
}
