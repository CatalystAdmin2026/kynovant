import "server-only";

import { and, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  clientProfiles,
  coachingEnrollments,
  programTemplates,
  users,
} from "./schema";
import { clientPrograms } from "./schema-program";
import { exercises } from "./schema-exercise";

export type HqSearchResultKind = "client" | "program" | "exercise";

export interface HqSearchResult {
  id: string;
  kind: HqSearchResultKind;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

export interface HqSearchResponse {
  query: string;
  results: HqSearchResult[];
}

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;

export function normalizeHqSearchQuery(query: string | null | undefined): string {
  return String(query ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function isSearchableHqQuery(query: string): boolean {
  return normalizeHqSearchQuery(query).length >= MIN_QUERY_LENGTH;
}

export function hqSearchHref(kind: HqSearchResultKind, id: string): string {
  if (kind === "client") return `/hq/clients/${id}`;
  if (kind === "program") return `/hq/programs/${id}`;
  return `/hq/exercises/${id}`;
}

export function canCoachSeeExerciseSearchResult(input: {
  scope: string;
  createdBy: string | null;
  status: string;
}, coachId: string): boolean {
  if (input.status !== "active") return false;
  if (input.scope === "system" || input.scope === "organization") return true;
  return input.scope === "coach" && input.createdBy === coachId;
}

function like(query: string): string {
  return `%${query}%`;
}

export async function searchHq(
  coachId: string,
  rawQuery: string,
  limitPerType = 6,
): Promise<HqSearchResponse> {
  const query = normalizeHqSearchQuery(rawQuery);
  if (!isSearchableHqQuery(query)) return { query, results: [] };

  const db = getDb();
  const pattern = like(query);
  const safeLimit = Math.max(1, Math.min(limitPerType, 10));

  const [clientRows, programRows, exerciseRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: clientProfiles.fullName,
        preferredName: clientProfiles.preferredName,
        status: coachingEnrollments.status,
      })
      .from(coachingEnrollments)
      .innerJoin(users, eq(coachingEnrollments.clientId, users.id))
      .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
      .where(
        and(
          eq(coachingEnrollments.coachId, coachId),
          or(
            ilike(clientProfiles.fullName, pattern),
            ilike(clientProfiles.preferredName, pattern),
            ilike(users.email, pattern),
          ),
        ),
      )
      .orderBy(desc(coachingEnrollments.createdAt))
      .limit(safeLimit),

    db
      .select({
        id: programTemplates.id,
        name: programTemplates.name,
        category: programTemplates.category,
        status: programTemplates.status,
        updatedAt: programTemplates.updatedAt,
      })
      .from(programTemplates)
      .where(
        and(
          or(
            eq(programTemplates.createdBy, coachId),
            exists(
              db
                .select({ one: clientPrograms.id })
                .from(clientPrograms)
                .innerJoin(
                  coachingEnrollments,
                  eq(coachingEnrollments.clientId, clientPrograms.clientId),
                )
                .where(
                  and(
                    eq(clientPrograms.programTemplateId, programTemplates.id),
                    eq(coachingEnrollments.coachId, coachId),
                  ),
                ),
            ),
          ),
          or(
            ilike(programTemplates.name, pattern),
            ilike(programTemplates.description, pattern),
            ilike(sql<string>`${programTemplates.category}::text`, pattern),
          ),
        ),
      )
      .orderBy(desc(programTemplates.updatedAt))
      .limit(safeLimit),

    db
      .select({
        id: exercises.id,
        name: exercises.name,
        classification: exercises.classification,
        movementPattern: exercises.movementPattern,
        scope: exercises.scope,
        status: exercises.status,
        createdBy: exercises.createdBy,
      })
      .from(exercises)
      .where(
        and(
          eq(exercises.status, "active"),
          or(
            inArray(exercises.scope, ["system", "organization"]),
            and(eq(exercises.scope, "coach"), eq(exercises.createdBy, coachId)),
          ),
          or(
            ilike(exercises.name, pattern),
            ilike(sql<string>`${exercises.classification}::text`, pattern),
            ilike(sql<string>`${exercises.movementPattern}::text`, pattern),
          ),
        ),
      )
      .orderBy(desc(exercises.updatedAt))
      .limit(safeLimit),
  ]);

  const results: HqSearchResult[] = [
    ...clientRows.map((client): HqSearchResult => {
      const name = client.preferredName || client.fullName || client.email;
      return {
        id: client.id,
        kind: "client",
        title: name,
        subtitle: client.email,
        href: hqSearchHref("client", client.id),
        meta: client.status,
      };
    }),
    ...programRows.map((program): HqSearchResult => ({
      id: program.id,
      kind: "program",
      title: program.name,
      subtitle: program.category.replace(/_/g, " "),
      href: hqSearchHref("program", program.id),
      meta: program.status,
    })),
    ...exerciseRows.map((exercise): HqSearchResult => ({
      id: exercise.id,
      kind: "exercise",
      title: exercise.name,
      subtitle: exercise.classification.replace(/_/g, " "),
      href: hqSearchHref("exercise", exercise.id),
      meta: exercise.scope,
    })),
  ];

  return { query, results };
}
