// TEMPORARY DEBUG ROUTE — remove before production hardening.
// Returns every tab in the template — recipient tabs, top-level prefillTabs,
// and tabs on every recipient group — so field labels can be verified.

import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";

// ── JWT auth helpers (self-contained copy — do not import from send-agreement) ──

function b64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Auth failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DSTab {
  tabId?:        string;
  tabLabel?:     string;
  dataLabel?:    string;
  required?:     string | boolean;
  value?:        string;
  defaultValue?: string;
  locked?:       string | boolean;
  shared?:       string | boolean;
  [key: string]: unknown;
}

interface DSRecipient {
  roleName?:    string;
  recipientId?: string;
  name?:        string;
  email?:       string;
  tabs?:        Record<string, DSTab[]>;
}

interface DSTemplate {
  templateId?: string;
  name?:       string;
  // Top-level prefill tabs (new DocuSign template editor stores sender/prefill tabs here,
  // not under any recipient — this is separate from recipients.signers)
  prefillTabs?: Record<string, DSTab[]>;
  // All recipient groups DocuSign supports
  recipients?: {
    signers?:              DSRecipient[];
    editors?:              DSRecipient[];
    agents?:               DSRecipient[];
    certifiedDeliveries?:  DSRecipient[];
    inPersonSigners?:      DSRecipient[];
    intermediaries?:       DSRecipient[];
    witnesses?:            DSRecipient[];
    notaries?:             DSRecipient[];
    [key: string]: unknown;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TAB_ARRAY_KEYS = [
  "textTabs", "signHereTabs", "dateSignedTabs", "fullNameTabs",
  "emailTabs", "titleTabs", "noteTabs", "checkboxTabs",
  "radioGroupTabs", "listTabs", "numberTabs", "formulaTabs",
  "initialHereTabs", "declineTabs", "approveTabs", "prefillTabs",
];

function flattenTabs(tabs: Record<string, DSTab[]> | undefined, roleLabel: string): object[] {
  if (!tabs) return [];
  const out: object[] = [];
  for (const key of TAB_ARRAY_KEYS) {
    for (const t of (tabs[key] ?? [])) {
      out.push({
        tabType:       key,
        recipientRole: roleLabel,
        tabId:         t.tabId        ?? null,
        tabLabel:      t.tabLabel     ?? null,
        dataLabel:     t.dataLabel    ?? null,
        value:         t.value        ?? null,
        defaultValue:  t.defaultValue ?? null,
        locked:        t.locked       ?? null,
        required:      t.required     ?? null,
        shared:        t.shared       ?? null,
      });
    }
  }
  return out;
}

function flattenRecipientGroup(
  group: DSRecipient[] | undefined,
  groupName: string,
): object[] {
  if (!group?.length) return [];
  return group.flatMap((r) =>
    flattenTabs(r.tabs, r.roleName ?? groupName).map((t) => ({
      ...(t as Record<string, unknown>),
      recipientGroup: groupName,
      recipientId:    r.recipientId ?? null,
    })),
  );
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const {
    DOCUSIGN_INTEGRATION_KEY: integrationKey,
    DOCUSIGN_USER_ID:         userId,
    DOCUSIGN_ACCOUNT_ID:      accountId,
    DOCUSIGN_PRIVATE_KEY:     privateKeyRaw,
    DOCUSIGN_TEMPLATE_ID:     templateId,
    DOCUSIGN_BASE_PATH:       basePath,
  } = process.env;

  if (!integrationKey || !userId || !accountId || !privateKeyRaw || !templateId) {
    return NextResponse.json(
      { ok: false, error: "DocuSign env vars not fully configured" },
      { status: 500 },
    );
  }

  const apiBase  = basePath ?? "demo.docusign.net";
  const authBase = apiBase === "www.docusign.net"
    ? "account.docusign.com"
    : "account-d.docusign.com";

  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n");

  let accessToken: string;
  try {
    const jwt  = buildJWT(integrationKey, userId, authBase, privateKeyPem);
    accessToken = await fetchAccessToken(jwt, authBase);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  const baseUrl = `https://${apiBase}/restapi/v2.1/accounts/${accountId}/templates/${templateId}`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Fetch template and dedicated recipients endpoint in parallel.
  // The main template endpoint carries top-level prefillTabs and recipient tabs.
  // The recipients endpoint (include=tabs) can surface tabs omitted from the main payload.
  const [templateRes, recipientsRes] = await Promise.all([
    fetch(`${baseUrl}?include=tabs`, { headers }),
    fetch(`${baseUrl}/recipients?include=tabs`, { headers }),
  ]);

  if (!templateRes.ok) {
    const detail = await templateRes.text().catch(() => "(no body)");
    return NextResponse.json(
      { ok: false, error: `Template fetch failed (${templateRes.status})`, detail },
      { status: 500 },
    );
  }

  const template    = (await templateRes.json()) as DSTemplate;
  const recipientsPayload = recipientsRes.ok
    ? (await recipientsRes.json()) as DSTemplate["recipients"]
    : null;

  // ── 1. Top-level prefillTabs (new template editor sender / prefill fields) ──
  // These are NOT attached to any recipient — they live at the template root.
  const topLevelPrefillTabs = flattenTabs(template.prefillTabs, "sender/prefill").map((t) => ({
    ...(t as Record<string, unknown>),
    source: "template.prefillTabs",
  }));

  // ── 2. All recipient groups from the main template payload ─────────────────
  const r = template.recipients ?? {};
  const recipientGroupsFromTemplate = [
    ...flattenRecipientGroup(r.signers,             "signers"),
    ...flattenRecipientGroup(r.editors,             "editors"),
    ...flattenRecipientGroup(r.agents,              "agents"),
    ...flattenRecipientGroup(r.certifiedDeliveries, "certifiedDeliveries"),
    ...flattenRecipientGroup(r.inPersonSigners,     "inPersonSigners"),
    ...flattenRecipientGroup(r.intermediaries,      "intermediaries"),
    ...flattenRecipientGroup(r.witnesses,           "witnesses"),
    ...flattenRecipientGroup(r.notaries,            "notaries"),
  ].map((t) => ({ ...(t as Record<string, unknown>), source: "template.recipients" }));

  // ── 3. Recipient tabs from the dedicated /recipients endpoint ──────────────
  // Same groups, different source — may include tabs the main endpoint omits.
  const rr = recipientsPayload ?? {};
  const recipientGroupsFromEndpoint = recipientsPayload ? [
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.signers,             "signers"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.editors,             "editors"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.agents,              "agents"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.certifiedDeliveries, "certifiedDeliveries"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.inPersonSigners,     "inPersonSigners"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.intermediaries,      "intermediaries"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.witnesses,           "witnesses"),
    ...flattenRecipientGroup((rr as DSTemplate["recipients"])?.notaries,            "notaries"),
  ].map((t) => ({ ...(t as Record<string, unknown>), source: "GET /recipients" })) : [];

  return NextResponse.json({
    ok:         true,
    templateId: template.templateId,
    name:       template.name,
    // Tabs grouped by source so it's easy to see where each field lives
    prefillTabs:              topLevelPrefillTabs,
    recipientTabsFromTemplate: recipientGroupsFromTemplate,
    recipientTabsFromEndpoint: recipientGroupsFromEndpoint,
    // Convenience: raw recipient keys present in the template payload
    _recipientKeysInTemplate: Object.keys(template.recipients ?? {}),
    _recipientsEndpointStatus: recipientsRes.status,
  });
}
