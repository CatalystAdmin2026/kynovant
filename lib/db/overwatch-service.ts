import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachProfiles,
  coachingEnrollments,
  externalIdentities,
  programTemplates,
  timelineEvents,
  users,
  workoutTemplates,
} from "./schema";
import { applications } from "./schema-applications";
import { clientPrograms, workoutSessions } from "./schema-program";
import {
  exercises,
  workoutTemplateExercises,
  workoutTemplateSections,
} from "./schema-exercise";

export interface OverwatchCoachRow {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  displayName: string | null;
  activeClientCount: number;
}

export interface OverwatchApplicationRow {
  id: string;
  name: string;
  businessStage: string | null;
  status: string;
  createdAt: Date;
}

export interface OverwatchActivityRow {
  eventType: string;
  count: number;
  lastOccurredAt: Date | null;
}

export interface OverwatchMetrics {
  users: {
    total: number;
    coaches: number;
    admins: number;
    clients: number;
    invitedCoaches: number;
    activeCoaches: number;
  };
  growth: {
    applicationsTotal: number;
    applicationsNew: number;
    applicationsQualified: number;
    demosScheduled: number;
    demosComplete: number;
    accepted: number;
    declined: number;
    recentApplications: OverwatchApplicationRow[];
  };
  coaching: {
    activeEnrollments: number;
    activeClientPrograms: number;
    completedWorkoutsLast7d: number;
    averageClientsPerCoach: number;
    clientDistribution: Array<{ label: string; coaches: number }>;
  };
  library: {
    programsTotal: number;
    programsDraft: number;
    programsActive: number;
    blueprintsTotal: number;
    blueprintsActive: number;
    exercisesTotal: number;
    exercisesActive: number;
    systemExercises: number;
    coachExercises: number;
    organizationExercises: number;
    exercisePrescriptions: number;
    blueprintSections: number;
    missingFatigueCost: number;
    missingMuscleGroup: number;
  };
  integrations: {
    stripeIdentities: number;
    stripeSubscriptions: number;
    driveWorkspaces: number;
  };
  coaches: OverwatchCoachRow[];
  activity: OverwatchActivityRow[];
  generatedPrograms: {
    totalProgramTemplates: number;
    createdLast30d: number;
    generatedAttributionTracked: boolean;
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function bucketClientCounts(coaches: OverwatchCoachRow[]): Array<{ label: string; coaches: number }> {
  const buckets = [
    { label: "0 clients", coaches: 0 },
    { label: "1-5", coaches: 0 },
    { label: "6-15", coaches: 0 },
    { label: "16-30", coaches: 0 },
    { label: "31+", coaches: 0 },
  ];

  for (const coach of coaches) {
    const count = coach.activeClientCount;
    if (count === 0) buckets[0].coaches += 1;
    else if (count <= 5) buckets[1].coaches += 1;
    else if (count <= 15) buckets[2].coaches += 1;
    else if (count <= 30) buckets[3].coaches += 1;
    else buckets[4].coaches += 1;
  }

  return buckets;
}

export async function getOverwatchMetrics(): Promise<OverwatchMetrics> {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    userRows,
    applicationRows,
    recentApplications,
    coachRows,
    coachingRows,
    programRows,
    blueprintRows,
    exerciseRows,
    prescriptionRows,
    integrationRows,
    generatedRows,
    activityRows,
  ] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      coaches: sql<number>`count(*) filter (where ${users.role} = 'coach')::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      clients: sql<number>`count(*) filter (where ${users.role} = 'client')::int`,
      invitedCoaches: sql<number>`count(*) filter (where ${users.role} in ('coach', 'admin') and ${users.status} = 'invited')::int`,
      activeCoaches: sql<number>`count(*) filter (where ${users.role} in ('coach', 'admin') and ${users.status} = 'active')::int`,
    }).from(users),

    db.select({
      total: sql<number>`count(*)::int`,
      new: sql<number>`count(*) filter (where ${applications.status} = 'new')::int`,
      qualified: sql<number>`count(*) filter (where ${applications.status} = 'qualified')::int`,
      demosScheduled: sql<number>`count(*) filter (where ${applications.status} = 'demo_scheduled')::int`,
      demosComplete: sql<number>`count(*) filter (where ${applications.status} = 'demo_complete')::int`,
      accepted: sql<number>`count(*) filter (where ${applications.status} = 'accepted')::int`,
      declined: sql<number>`count(*) filter (where ${applications.status} = 'declined')::int`,
    }).from(applications)
      .where(eq(applications.source, "coach_apply")),

    db.select({
      id: applications.id,
      name: applications.name,
      businessStage: applications.businessStage,
      status: applications.status,
      createdAt: applications.createdAt,
    })
      .from(applications)
      .where(eq(applications.source, "coach_apply"))
      .orderBy(desc(applications.createdAt))
      .limit(5),

    db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      displayName: coachProfiles.displayName,
      activeClientCount: sql<number>`count(${coachingEnrollments.id})::int`,
    })
      .from(users)
      .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
      .leftJoin(
        coachingEnrollments,
        and(
          eq(coachingEnrollments.coachId, users.id),
          eq(coachingEnrollments.status, "active"),
        ),
      )
      .where(inArray(users.role, ["coach", "admin"]))
      .groupBy(users.id, coachProfiles.displayName)
      .orderBy(desc(users.createdAt)),

    db.select({
      activeEnrollments: sql<number>`count(*) filter (where ${coachingEnrollments.status} = 'active')::int`,
    }).from(coachingEnrollments),

    db.select({
      total: sql<number>`count(*)::int`,
      draft: sql<number>`count(*) filter (where ${programTemplates.status} = 'draft')::int`,
      active: sql<number>`count(*) filter (where ${programTemplates.status} = 'active')::int`,
    }).from(programTemplates),

    db.select({
      total: sql<number>`count(distinct ${workoutTemplates.id})::int`,
      active: sql<number>`count(distinct ${workoutTemplates.id}) filter (where ${workoutTemplates.status} = 'active')::int`,
      sections: sql<number>`count(distinct ${workoutTemplateSections.id})::int`,
    })
      .from(workoutTemplates)
      .leftJoin(workoutTemplateSections, eq(workoutTemplateSections.workoutTemplateId, workoutTemplates.id)),

    db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${exercises.status} = 'active')::int`,
      system: sql<number>`count(*) filter (where ${exercises.scope} = 'system')::int`,
      coach: sql<number>`count(*) filter (where ${exercises.scope} = 'coach')::int`,
      organization: sql<number>`count(*) filter (where ${exercises.scope} = 'organization')::int`,
      missingFatigueCost: sql<number>`count(*) filter (where ${exercises.fatigueCost} is null)::int`,
      missingMuscleGroup: sql<number>`count(*) filter (where ${exercises.primaryMuscleGroup} is null)::int`,
    }).from(exercises),

    db.select({
      prescriptions: sql<number>`count(*)::int`,
    }).from(workoutTemplateExercises),

    db.select({
      stripeIdentities: sql<number>`count(*) filter (where ${externalIdentities.provider} in ('stripe_customer', 'stripe_price', 'stripe_invoice', 'stripe_subscription'))::int`,
      stripeSubscriptions: sql<number>`count(*) filter (where ${externalIdentities.provider} = 'stripe_subscription')::int`,
      driveWorkspaces: sql<number>`count(*) filter (where ${externalIdentities.provider} = 'google_drive_folder')::int`,
    }).from(externalIdentities),

    db.select({
      totalProgramTemplates: sql<number>`count(*)::int`,
      createdLast30d: sql<number>`count(*) filter (where ${programTemplates.createdAt} >= ${thirtyDaysAgo})::int`,
    }).from(programTemplates),

    db.select({
      eventType: timelineEvents.eventType,
      count: sql<number>`count(*)::int`,
      lastOccurredAt: sql<Date | null>`max(${timelineEvents.occurredAt})`,
    })
      .from(timelineEvents)
      .where(sql`${timelineEvents.occurredAt} >= ${sevenDaysAgo}`)
      .groupBy(timelineEvents.eventType)
      .orderBy(sql`max(${timelineEvents.occurredAt}) desc`)
      .limit(8),
  ]);

  const activeClientProgramsRow = await db.select({
    activeClientPrograms: sql<number>`count(*) filter (where ${clientPrograms.status} = 'active')::int`,
  }).from(clientPrograms);

  const completedWorkoutRows = await db.select({
    completedWorkoutsLast7d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' and ${workoutSessions.completedAt} >= ${sevenDaysAgo})::int`,
  }).from(workoutSessions);

  const coaches = coachRows.map((coach) => ({
    ...coach,
    activeClientCount: toNumber(coach.activeClientCount),
  }));
  const coachCount = coaches.length;
  const totalActiveClients = coaches.reduce((sum, coach) => sum + coach.activeClientCount, 0);

  return {
    users: {
      total: toNumber(userRows[0]?.total),
      coaches: toNumber(userRows[0]?.coaches),
      admins: toNumber(userRows[0]?.admins),
      clients: toNumber(userRows[0]?.clients),
      invitedCoaches: toNumber(userRows[0]?.invitedCoaches),
      activeCoaches: toNumber(userRows[0]?.activeCoaches),
    },
    growth: {
      applicationsTotal: toNumber(applicationRows[0]?.total),
      applicationsNew: toNumber(applicationRows[0]?.new),
      applicationsQualified: toNumber(applicationRows[0]?.qualified),
      demosScheduled: toNumber(applicationRows[0]?.demosScheduled),
      demosComplete: toNumber(applicationRows[0]?.demosComplete),
      accepted: toNumber(applicationRows[0]?.accepted),
      declined: toNumber(applicationRows[0]?.declined),
      recentApplications,
    },
    coaching: {
      activeEnrollments: toNumber(coachingRows[0]?.activeEnrollments),
      activeClientPrograms: toNumber(activeClientProgramsRow[0]?.activeClientPrograms),
      completedWorkoutsLast7d: toNumber(completedWorkoutRows[0]?.completedWorkoutsLast7d),
      averageClientsPerCoach: coachCount > 0 ? totalActiveClients / coachCount : 0,
      clientDistribution: bucketClientCounts(coaches),
    },
    library: {
      programsTotal: toNumber(programRows[0]?.total),
      programsDraft: toNumber(programRows[0]?.draft),
      programsActive: toNumber(programRows[0]?.active),
      blueprintsTotal: toNumber(blueprintRows[0]?.total),
      blueprintsActive: toNumber(blueprintRows[0]?.active),
      exercisesTotal: toNumber(exerciseRows[0]?.total),
      exercisesActive: toNumber(exerciseRows[0]?.active),
      systemExercises: toNumber(exerciseRows[0]?.system),
      coachExercises: toNumber(exerciseRows[0]?.coach),
      organizationExercises: toNumber(exerciseRows[0]?.organization),
      exercisePrescriptions: toNumber(prescriptionRows[0]?.prescriptions),
      blueprintSections: toNumber(blueprintRows[0]?.sections),
      missingFatigueCost: toNumber(exerciseRows[0]?.missingFatigueCost),
      missingMuscleGroup: toNumber(exerciseRows[0]?.missingMuscleGroup),
    },
    integrations: {
      stripeIdentities: toNumber(integrationRows[0]?.stripeIdentities),
      stripeSubscriptions: toNumber(integrationRows[0]?.stripeSubscriptions),
      driveWorkspaces: toNumber(integrationRows[0]?.driveWorkspaces),
    },
    coaches,
    activity: activityRows.map((row) => ({
      eventType: row.eventType,
      count: toNumber(row.count),
      lastOccurredAt: row.lastOccurredAt,
    })),
    generatedPrograms: {
      totalProgramTemplates: toNumber(generatedRows[0]?.totalProgramTemplates),
      createdLast30d: toNumber(generatedRows[0]?.createdLast30d),
      generatedAttributionTracked: false,
    },
  };
}
