import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const metricsMock = vi.fn();
const founderNameMock = vi.fn();

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
    getOverwatchFounderFirstName: founderNameMock,
  };
});

const { default: OverwatchPage } = await import("@/app/overwatch/page");

function baseMetrics() {
  return {
    overview: {
      totalCoachAccounts: 1,
      activeCoachAccounts: 1,
      invitedCoachAccounts: 0,
      activeSubscriptions: 0,
      trialingSubscriptions: 0,
      pastDueSubscriptions: 0,
      cancelledSubscriptions: 0,
      totalActiveClients: 0,
      averageClientsPerCoach: 0,
      newCoachAccounts7d: 1,
      newCoachAccounts30d: 1,
    },
    acquisition: {
      startedSignup: 0,
      inviteSent: 0,
      accountActivated: 0,
      trialStarted: 0,
      paidActive: 0,
      cancelledChurned: 0,
      conversionRateTrialToPaid: null,
      recentLeads: [],
    },
    accounts: [
      {
        id: "coach-id",
        email: "coach@example.com",
        accountStatus: "active",
        createdAt: new Date("2026-08-12T22:48:39.519Z"),
        displayName: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
        cancelledAt: null,
        activeClientCount: 0,
      },
    ],
    product: {
      activeClientPrograms: 0,
      completedWorkoutsLast7d: 0,
      programsTotal: 0,
      programsActive: 0,
      blueprintsTotal: 0,
      blueprintsActive: 0,
      exercisesTotal: 0,
      exercisesActive: 0,
    },
    platform: {
      admins: 1,
      totalUsers: 1,
      activity: [],
    },
  };
}

describe("Overwatch page server render", () => {
  beforeEach(() => {
    metricsMock.mockResolvedValue(baseMetrics());
    founderNameMock.mockResolvedValue(null);
  });

  it("renders for an active founder admin without coach profile, client profile, or subscription", async () => {
    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Founder command center");
    expect(html).toContain("kynovant@gmail.com");
    expect(html).toContain("Unnamed coach");
    expect(html).toContain("No Billing");
  });

  it.skipIf(!process.env.DATABASE_URL)("renders with live production-shaped Overwatch metrics", async () => {
    const actual = await vi.importActual<typeof import("@/lib/db/overwatch-service")>(
      "@/lib/db/overwatch-service",
    );
    metricsMock.mockResolvedValue(await actual.getOverwatchMetrics());

    const element = await OverwatchPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(element);

    expect(html).toContain("Founder command center");
    expect(html).toContain("Coach and Trainer Accounts");
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
});
