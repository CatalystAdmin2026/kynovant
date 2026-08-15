import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const metricsMock = vi.fn();
const founderProfileMock = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  requireOverwatchAdminPage: vi.fn(async () => ({
    authUser: { id: "founder-admin-id", email: "kynovant@gmail.com" },
    dbUser: {
      id: "founder-admin-id",
      email: "kynovant@gmail.com",
      normalizedEmail: "kynovant@gmail.com",
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date("2026-08-14T23:22:15.978Z"),
      createdAt: new Date("2026-08-14T22:59:48.510Z"),
      updatedAt: new Date("2026-08-14T23:59:23.779Z"),
      deletedAt: null,
    },
  })),
}));

vi.mock("@/lib/db/overwatch-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/overwatch-service")>();
  return {
    ...original,
    getOverwatchMetrics: metricsMock,
    getOverwatchFounderProfile: founderProfileMock,
  };
});

const { default: OverwatchPage } = await import("@/app/overwatch/page");

function baseMetrics() {
  return {
    overview: {
      activeTrials: 0,
      payingAccounts: 0,
      newSignups7d: 1,
      activeCustomerCoaches: 1,
      activeClients: 0,
      workouts7d: 0,
      trialToPaid: null,
      aiGenerations7d: 0,
    },
    revenue: {
      activeTrials: 0,
      payingAccounts: 0,
      trialingSubscriptions: 0,
      pastDueSubscriptions: 0,
      cancelledSubscriptions: 0,
      trialEndingSoon: 0,
      upcomingRenewals: [],
    },
    acquisition: {
      startedSignup: 0,
      inviteSent: 0,
      accountActivated: 0,
      trialStarted: 0,
      paidActive: 0,
      cancelledChurned: 0,
      conversionRateTrialToPaid: null,
      stages: [
        { key: "startedSignup", label: "Started Signup", count: 0, previousRate: null, startedRate: null },
        { key: "inviteSent", label: "Invite Sent", count: 0, previousRate: null, startedRate: null },
        { key: "accountActivated", label: "Account Activated", count: 0, previousRate: null, startedRate: null },
        { key: "trialStarted", label: "Trial Started", count: 0, previousRate: null, startedRate: null },
        { key: "paidActive", label: "Paid / Active", count: 0, previousRate: null, startedRate: null },
        { key: "cancelledChurned", label: "Cancelled / Churned", count: 0, previousRate: null, startedRate: null },
      ],
      recentLeads: [],
    },
    accounts: [
      {
        id: "coach-id",
        email: "coach@example.com",
        accountStatus: "active",
        createdAt: new Date("2026-08-12T22:48:39.519Z"),
        displayName: null,
        classification: "customer",
        subscriptionStatus: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
        cancelledAt: null,
        activeClientCount: 0,
        lastActiveAt: null,
      },
    ],
    engagement: {
      workouts7d: 0,
      checkInsSubmitted7d: 0,
      messages7d: 0,
    },
    aiOperations: {
      runs7d: 0,
      runs30d: 0,
      completed: 0,
      failed: 0,
      successRate: null,
      averageLatencyMs: null,
      providerDistribution: [],
      modelDistribution: [],
    },
    product: {
      activeClientPrograms: 0,
      programsTotal: 0,
      programsActive: 0,
      blueprintsTotal: 0,
      blueprintsActive: 0,
      exercisesTotal: 0,
      exercisesActive: 0,
    },
    platform: {
      dbReachable: true,
      admins: 1,
      totalUsers: 1,
      recentStripeEventAt: null,
      failedSignupInvites: 0,
      pastDueSubscriptions: 0,
    },
  };
}

describe("Overwatch page server render", () => {
  beforeEach(() => {
    metricsMock.mockResolvedValue(baseMetrics());
    founderProfileMock.mockResolvedValue({ firstName: null, timezone: "America/Chicago" });
  });

  it("renders for an active founder admin without coach profile, client profile, or subscription", async () => {
    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Founder command center");
    expect(html).toContain("kynovant@gmail.com");
    expect(html).toContain("Unnamed coach");
    expect(html).toContain("No Billing");
    expect(html).toContain("Business accounts only");
  });

  it.skipIf(!process.env.DATABASE_URL)("renders with live production-shaped Overwatch metrics", async () => {
    const actual = await vi.importActual<typeof import("@/lib/db/overwatch-service")>(
      "@/lib/db/overwatch-service",
    );
    metricsMock.mockResolvedValue(await actual.getOverwatchMetrics());

    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Founder command center");
    expect(html).toContain("Customer Account Directory");
  });

  it("renders when production timestamp fields arrive as strings", async () => {
    const base = baseMetrics();
    const metrics = {
      ...base,
      accounts: [
        {
          ...base.accounts[0],
          createdAt: "2026-08-12T22:48:39.519Z",
          currentPeriodEnd: "2026-09-12T22:48:39.519Z",
          cancelledAt: null,
        },
      ],
      acquisition: {
        ...base.acquisition,
        recentLeads: [
          {
            id: "lead-id",
            submittedName: "Test Lead",
            normalizedEmail: "lead@example.com",
            source: "start_trial",
            firstSignupAt: "2026-08-12T22:48:39.519Z",
            inviteSentAt: null,
            inviteStatus: "sent",
            accountUserId: null,
            accountStatus: null,
            subscriptionStatus: null,
          },
        ],
      },
    };
    metricsMock.mockResolvedValue(metrics);

    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Test Lead");
    expect(html).toContain("Sep 12, 2026");
  });

  it("uses the operator timezone and name for the founder greeting", async () => {
    founderProfileMock.mockResolvedValue({ firstName: "Jermaine", timezone: "America/Chicago" });

    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toMatch(/Good (morning|afternoon|evening), Jermaine\./);
  });

  it("falls back instead of crashing when the operator timezone is malformed", async () => {
    founderProfileMock.mockResolvedValue({ firstName: "Jermaine", timezone: "Not/A_Timezone" });

    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toMatch(/Good (morning|afternoon|evening), Jermaine\./);
  });

  it("keeps client PII out of the rendered Overwatch payload", async () => {
    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Client PII excluded from founder analytics");
    expect(html).not.toContain("client@example.com");
    expect(html).not.toContain("Health Profile");
    expect(html).not.toContain("Check-In Notes");
  });

  it("labels derived account activity without implying coach login telemetry", async () => {
    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Product Activity");
    expect(html).not.toContain(">Last Active<");
  });

  it("renders the corrected zero-lead acquisition empty state", async () => {
    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("No acquisition leads yet. New trial signups will appear here.");
    expect(html).not.toContain("Apply migration 0026");
  });
});
