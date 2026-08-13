// Server-side proxy to the Calendly API.
// Keeps CALENDLY_PERSONAL_ACCESS_TOKEN out of the browser bundle — .env.local only.
//
// Returns normalized CalendlyEvent objects for three categories:
//   upcoming  — active events in the future (next ~90 days)
//   recent    — active events completed in the last 30 days
//   cancelled — cancelled events in the last 30 days
//
// Each event is paired with its first invitee via a secondary API call.
// All invitee fetches run in parallel per category.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

// ─── Raw Calendly API shapes ──────────────────────────────────

interface CalendlyLocation {
  type?: string;
  join_url?: string;
  location?: string;
}

interface CalendlyEventRaw {
  uri: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  event_type: string;
  location?: CalendlyLocation;
  cancellation?: { reason?: string } | null;
}

interface CalendlyInviteeRaw {
  uri: string;
  name: string;
  email: string;
}

// ─── Normalized output shape (matches lib/calendly.ts) ───────

interface NormalizedCalendlyEvent {
  uri: string;
  eventTypeUri: string;
  name: string;
  status: "active" | "canceled";
  startTime: string;
  endTime: string;
  location: string;
  cancellationReason: string | null;
  inviteeName: string;
  inviteeEmail: string;
  inviteeUri: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────

const CALENDLY_API = "https://api.calendly.com";

function calendlyGet(path: string, token: string): Promise<Response> {
  return fetch(`${CALENDLY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

function extractUuid(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function normalizeLocation(loc: CalendlyLocation | undefined): string {
  if (!loc) return "";
  if (loc.join_url) return loc.join_url;
  if (loc.location) return loc.location;
  if (loc.type) return loc.type.replace(/_/g, " ");
  return "";
}

// Fetches events matching the given query params and pairs each with its
// first invitee. Never throws — returns [] on any Calendly API error.
async function fetchEventsWithInvitees(
  token: string,
  userUri: string,
  params: Record<string, string>,
): Promise<NormalizedCalendlyEvent[]> {
  const qs = new URLSearchParams({ user: userUri, count: "10", ...params });
  let eventsRes: Response;
  try {
    eventsRes = await calendlyGet(`/scheduled_events?${qs.toString()}`, token);
  } catch {
    return [];
  }
  if (!eventsRes.ok) return [];

  const eventsBody = await eventsRes.json() as { collection?: CalendlyEventRaw[] };
  const rawEvents = eventsBody.collection ?? [];
  if (rawEvents.length === 0) return [];

  // Fetch first invitee for each event in parallel
  const normalized = await Promise.all(
    rawEvents.map(async (evt): Promise<NormalizedCalendlyEvent> => {
      const uuid = extractUuid(evt.uri);
      let inviteeName = "";
      let inviteeEmail = "";
      let inviteeUri: string | null = null;

      try {
        const invRes = await calendlyGet(
          `/scheduled_events/${uuid}/invitees?count=1`,
          token,
        );
        if (invRes.ok) {
          const invBody = await invRes.json() as { collection?: CalendlyInviteeRaw[] };
          const first = invBody.collection?.[0];
          if (first) {
            inviteeName = first.name;
            inviteeEmail = first.email;
            inviteeUri = first.uri;
          }
        }
      } catch {
        // Non-fatal — event still shows without invitee details
      }

      return {
        uri: evt.uri,
        eventTypeUri: evt.event_type,
        name: evt.name,
        status: evt.status === "canceled" ? "canceled" : "active",
        startTime: evt.start_time,
        endTime: evt.end_time,
        location: normalizeLocation(evt.location),
        cancellationReason: evt.cancellation?.reason ?? null,
        inviteeName,
        inviteeEmail,
        inviteeUri,
      };
    }),
  );

  return normalized;
}

// ─── Route handler ────────────────────────────────────────────

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;
  const userUri = process.env.CALENDLY_USER_URI;

  if (!token || !userUri) {
    const missing = [
      !token && "CALENDLY_PERSONAL_ACCESS_TOKEN",
      !userUri && "CALENDLY_USER_URI",
    ]
      .filter(Boolean)
      .join(", ");
    return NextResponse.json(
      {
        ok: false,
        unconfigured: true,
        error: `${missing} not set in .env.local — see env.local.example for setup instructions.`,
      },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [upcoming, recent, cancelled] = await Promise.all([
      // Active events starting from now
      fetchEventsWithInvitees(token, userUri, {
        status: "active",
        min_start_time: now,
        max_start_time: ninetyDaysOut,
        sort: "start_time:asc",
      }),
      // Active events that have already ended (last 30 days)
      fetchEventsWithInvitees(token, userUri, {
        status: "active",
        min_start_time: thirtyDaysAgo,
        max_start_time: now,
        sort: "start_time:desc",
      }),
      // Cancelled events (last 30 days)
      fetchEventsWithInvitees(token, userUri, {
        status: "canceled",
        min_start_time: thirtyDaysAgo,
        sort: "start_time:desc",
      }),
    ]);

    return NextResponse.json({
      ok: true,
      upcoming,
      recent,
      cancelled,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch Calendly events",
      },
      { status: 502 },
    );
  }
}
