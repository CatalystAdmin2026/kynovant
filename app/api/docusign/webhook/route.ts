import crypto from "crypto";
import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { PACKAGE_ENROLL_PATHS } from "@/lib/enrollment";

// ── DocuSign Connect payload types (JSON format) ───────────────────────────
//
// DocuSign Connect can deliver events as JSON or XML depending on configuration.
// JSON format (preferred) uses "event" at the top level; XML uses DocuSignEnvelopeInformation.
// We parse JSON when the Content-Type includes application/json; otherwise log raw XML.

interface DSTab {
  tabLabel?: string;
  value?: string;
}

interface DSConnectSigner {
  name?: string;
  email?: string;
  roleName?: string;
  status?: string;
  recipientId?: string;
  tabs?: {
    textTabs?: DSTab[];
  };
}

interface DSConnectPayload {
  event?: string;
  apiVersion?: string;
  generatedDateTime?: string;
  data?: {
    envelopeId?: string;
    accountId?: string;
    envelopeSummary?: {
      status?: string;
      envelopeId?: string;
      recipients?: {
        signers?: DSConnectSigner[];
      };
    };
  };
}

// ── Event → Catalyst status mapping ───────────────────────────────────────

const ENVELOPE_EVENT_STATUS: Record<string, string> = {
  "envelope-sent":      "Agreement Sent",
  "envelope-delivered": "Agreement Delivered",
  "envelope-completed": "Fully Executed",
  "envelope-declined":  "Declined",
  "envelope-voided":    "Voided",
};

function classifyRecipientCompleted(signers: DSConnectSigner[]): string {
  const justCompleted = signers.find(s => s.status === "completed");
  if (!justCompleted) return "Client Signed / Awaiting Coach Finalization";
  const role = (justCompleted.roleName ?? "").toLowerCase();
  if (role === "coach") return "Awaiting Coach Finalization";
  return "Client Signed / Awaiting Coach Finalization";
}

// ── Log helper — structured, no secrets ────────────────────────────────────

function logEvent(
  event: string | undefined,
  envelopeId: string | undefined,
  catalystStatus: string | undefined,
  extra?: Record<string, unknown>,
) {
  console.log(
    "[DocuSign Webhook]",
    JSON.stringify({ event, envelopeId, catalystStatus, ...extra }),
  );
}

// ── HMAC verification ──────────────────────────────────────────────────────
//
// DocuSign Connect HMAC-SHA256:
//   - Secret:  the HMAC secret key configured in DocuSign Connect settings
//   - Input:   exact raw request body bytes (must be read before JSON parsing)
//   - Digest:  base64-encoded HMAC-SHA256
//   - Header:  X-DocuSign-Signature-1 (DocuSign may send multiple numbered headers
//              if multiple HMAC keys are configured; we check the first one)
//
// Reference: https://developers.docusign.com/platform/webhooks/connect/hmac/

function verifyHmac(rawBody: string, secret: string, receivedSig: string): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const computedBuf = Buffer.from(computed);
  const receivedBuf = Buffer.from(receivedSig);

  // timingSafeEqual requires equal-length buffers — unequal length means no match
  if (computedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}

// ── Activate Coaching email (Sprint 3A) ────────────────────────────────────
//
// Sent once, on envelope-completed only, to the Client signer.
// PackageName is read from the Client's textTabs in the webhook payload —
// requires DocuSign Connect to have "Include Document Fields" enabled so
// recipient tab values are present in the envelope-completed JSON body.
//
// Non-fatal: a Resend failure logs an error but never blocks the { ok: true }
// ack back to DocuSign.

const SITE_ORIGIN = "https://www.kynovant.com";

async function sendActivateCoachingEmail(
  clientName: string,
  clientEmail: string,
  packageName: string,
  enrollPath: string,
): Promise<void> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn("[DocuSign Webhook] RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping activate email");
    return;
  }

  const enrollUrl = `${SITE_ORIGIN}${enrollPath}`;
  const firstName = clientName.split(" ")[0] || clientName;

  const resend = new Resend(apiKey);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Activate Your Kynovant Membership</title>
</head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Gold top rule -->
          <tr>
            <td style="height:2px;background:#C9A24D;"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:#0d0e0f;padding:36px 40px 28px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.45em;text-transform:uppercase;color:#C9A24D;font-weight:600;">
                Kynovant
              </p>
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.02em;line-height:1.1;">
                Agreement Complete.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0d0e0f;padding:0 40px 36px;">
              <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">
                Your Kynovant agreement is fully executed. The final step is activating your
                <strong style="color:#ffffff;">${packageName}</strong> coaching membership.
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#d1d5db;line-height:1.6;">
                Click the button below to complete your enrollment and begin your program.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#C9A24D;">
                    <a href="${enrollUrl}"
                       style="display:inline-block;padding:16px 40px;font-size:12px;font-weight:700;
                              letter-spacing:0.2em;text-transform:uppercase;color:#000000;
                              text-decoration:none;">
                      Activate Coaching
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:12px;color:#4b5563;line-height:1.5;">
                Or copy this link into your browser:<br />
                <a href="${enrollUrl}" style="color:#C9A24D;word-break:break-all;">${enrollUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background:#0d0e0f;padding:0 40px;">
              <div style="height:1px;background:rgba(201,162,77,0.18);"></div>
            </td>
          </tr>

          <!-- Signoff -->
          <tr>
            <td style="background:#0d0e0f;padding:28px 40px 40px;">
              <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#ffffff;font-style:italic;">
                Jermaine Jones
              </p>
              <p style="margin:0 0 1px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C9A24D;">
                Founder &amp; Head Coach
              </p>
              <p style="margin:0;font-size:11px;color:#4b5563;letter-spacing:0.05em;">
                Kynovant
              </p>
            </td>
          </tr>

          <!-- Gold bottom rule -->
          <tr>
            <td style="height:2px;background:#C9A24D;"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <p style="margin:0;font-size:10px;color:#374151;letter-spacing:0.05em;">
                www.kynovant.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from:    `Kynovant <${fromEmail}>`,
    to:      clientEmail,
    subject: "Your Kynovant Agreement Is Complete",
    html,
  });

  if (error) {
    console.error("[DocuSign Webhook] Resend error sending activate email:", error.message ?? error);
  } else {
    console.log("[DocuSign Webhook] Activate Coaching email sent to:", clientEmail, "| package:", packageName);
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Read raw body first — must happen before any req.json() / req.text() call ──
  // The request body stream can only be consumed once. We read it as text here
  // so it is available for both HMAC verification and JSON parsing below.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    console.error("[DocuSign Webhook] Failed to read request body");
    return NextResponse.json({ ok: true });
  }

  // ── Security: HMAC-SHA256 verification ────────────────────────────────────
  const webhookSecret = process.env.DOCUSIGN_WEBHOOK_SECRET;

  if (webhookSecret) {
    // DocuSign sends the digest in X-DocuSign-Signature-1.
    // If multiple HMAC keys are configured it also sends -2, -3, etc.
    // We validate against the first one present.
    const candidateHeaders = [
      "x-docusign-signature-1",
      "x-docusign-signature-2",
      "x-docusign-signature-3",
    ];

    // Debug: which signature headers arrived (no values logged)
    const presentHeaders = candidateHeaders.filter(h => req.headers.get(h) !== null);
    console.log("[DocuSign Webhook] Signature headers present:", presentHeaders);

    const receivedSig = req.headers.get("x-docusign-signature-1");
    console.log("[DocuSign Webhook] x-docusign-signature-1 present:", receivedSig !== null);

    if (!receivedSig) {
      console.warn("[DocuSign Webhook] Unauthorized — X-DocuSign-Signature-1 header missing");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const computed = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    // Log lengths only — never log the actual signature values or secret
    console.log("[DocuSign Webhook] Computed signature length:", computed.length);
    console.log("[DocuSign Webhook] Received signature length:", receivedSig.length);

    if (!verifyHmac(rawBody, webhookSecret, receivedSig)) {
      console.warn("[DocuSign Webhook] Unauthorized — HMAC mismatch");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[DocuSign Webhook] DocuSign webhook secret not configured — accepting unauthenticated request");
  }

  // ── Parse body from the already-read raw string ────────────────────────────
  const contentType = req.headers.get("content-type") ?? "";
  let payload: DSConnectPayload | null = null;

  if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(rawBody) as DSConnectPayload;
    } catch {
      console.error("[DocuSign Webhook] Failed to parse JSON body");
      return NextResponse.json({ ok: true }); // ack to prevent DocuSign retries
    }
  } else {
    // XML or unknown format — log truncated raw text for debugging
    console.log("[DocuSign Webhook] Non-JSON body received (XML?):", rawBody.slice(0, 500));
    return NextResponse.json({ ok: true });
  }

  // ── Identify event ─────────────────────────────────────────────────────────
  const event      = payload?.event;
  const envelopeId = payload?.data?.envelopeId
    ?? payload?.data?.envelopeSummary?.envelopeId;
  const signers    = payload?.data?.envelopeSummary?.recipients?.signers ?? [];

  // ── Map event to Catalyst status ───────────────────────────────────────────
  let catalystStatus: string | undefined;

  if (event === "recipient-completed") {
    catalystStatus = classifyRecipientCompleted(signers);
  } else if (event !== undefined) {
    catalystStatus = ENVELOPE_EVENT_STATUS[event];
  }

  logEvent(event, envelopeId, catalystStatus, {
    accountId:         payload?.data?.accountId,
    generatedDateTime: payload?.generatedDateTime,
    signerCount:       signers.length,
  });

  // ── Per-event handling ─────────────────────────────────────────────────────

  if (event === "envelope-sent") {
    // Catalyst status: Agreement Sent
    // TODO: Future — update agreement status in CRM/database to "sent" for envelopeId
    console.log("[DocuSign Webhook] envelope-sent:", { envelopeId });
  }

  else if (event === "envelope-delivered") {
    // Catalyst status: Agreement Delivered (all parties have received it)
    // TODO: Future — update agreement status in CRM/database to "delivered" for envelopeId
    console.log("[DocuSign Webhook] envelope-delivered:", { envelopeId });
  }

  else if (event === "recipient-completed") {
    // Catalyst status depends on which role completed
    //   Client completes first → "Client Signed / Awaiting Coach Finalization"
    //   Coach completes → "Awaiting Coach Finalization" (edge: happens before envelope-completed)
    // TODO: Future — update agreement status in CRM/database for envelopeId based on catalystStatus
    // TODO: Future — if role === "Coach", trigger coach-finalizing flow
    console.log("[DocuSign Webhook] recipient-completed:", { envelopeId, catalystStatus, signers: signers.map(s => ({ roleName: s.roleName, status: s.status })) });
  }

  else if (event === "envelope-completed") {
    // Catalyst status: Fully Executed — both parties have signed
    // TODO: Future — update agreement status in CRM/database to "fully_executed" for envelopeId
    // TODO: Future — create client onboarding tasks in task management system
    // TODO: Future — attach signed PDF copy to client folder in Google Drive
    console.log("[DocuSign Webhook] envelope-completed (fully executed):", { envelopeId });

    // ── Sprint 3A: Send Activate Coaching email ────────────────────────────
    // Extract Client signer details. DocuSign Connect must have "Include Document Fields"
    // enabled so textTab values (including PackageName) appear in the payload.
    const clientSigner = signers.find(
      s => (s.roleName ?? "").toLowerCase() === "client",
    );
    const clientEmail   = clientSigner?.email ?? "";
    const clientName    = clientSigner?.name  ?? "";
    const packageName   = clientSigner?.tabs?.textTabs
      ?.find(t => t.tabLabel === "PackageName")
      ?.value ?? "";

    if (!packageName) {
      console.warn(
        "[DocuSign Webhook] envelope-completed: PackageName tab missing from payload — " +
        "enable 'Include Document Fields' in DocuSign Connect config. Activate email not sent.",
        { envelopeId },
      );
    } else if (!clientEmail) {
      console.warn("[DocuSign Webhook] envelope-completed: Client signer email missing. Activate email not sent.", { envelopeId });
    } else {
      const enrollPath = PACKAGE_ENROLL_PATHS[packageName];
      if (!enrollPath) {
        console.warn("[DocuSign Webhook] envelope-completed: No enroll path for package:", packageName, "— activate email not sent.");
      } else {
        try {
          await sendActivateCoachingEmail(clientName, clientEmail, packageName, enrollPath);
        } catch (err) {
          // Never let email failure block the DocuSign ack
          console.error("[DocuSign Webhook] Activate email threw unexpectedly:", err instanceof Error ? err.message : err);
        }
      }
    }
  }

  else if (event === "envelope-declined") {
    // Catalyst status: Declined — a recipient declined to sign
    // TODO: Future — update agreement status in CRM/database to "declined" for envelopeId
    // TODO: Future — notify coach to follow up with client
    console.log("[DocuSign Webhook] envelope-declined:", { envelopeId });
  }

  else if (event === "envelope-voided") {
    // Catalyst status: Voided — envelope was voided (by sender or admin)
    // TODO: Future — update agreement status in CRM/database to "voided" for envelopeId
    // TODO: Future — notify coach that agreement was voided
    console.log("[DocuSign Webhook] envelope-voided:", { envelopeId });
  }

  else {
    // Unrecognized event — log and ack to prevent DocuSign retries
    console.log("[DocuSign Webhook] Unrecognized event — ignoring:", { event, envelopeId });
  }

  // Always respond quickly so DocuSign does not retry
  return NextResponse.json({ ok: true });
}
