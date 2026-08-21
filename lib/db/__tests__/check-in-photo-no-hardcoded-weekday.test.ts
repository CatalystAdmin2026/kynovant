// ─────────────────────────────────────────────────────────────
// Source-inspection guard: the Check-In Progress Photos pass must
// contain NO Sunday/Wednesday-specific product logic in production
// code — every weekday must be handled generically via the existing
// 0-6 weekday convention.
//
// Pure — reads source files as text, no DB/session dependency. Scoped
// to this pass's own new/modified production files (not test files,
// which legitimately use "Sunday"/"Wednesday" as example fixture
// data per this task's own instructions). Comments and doc-strings
// are allowed to mention the words in EXPLANATORY prose (e.g. "no
// weekday is hardcoded — Sunday/Wednesday are illustrative only");
// this test greps for actual code usage of the literal strings
// "Sunday"/"Wednesday" (weekday LABEL/name strings), which — outside
// comment lines — would only plausibly appear if a special case had
// been written for that specific day.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PRODUCTION_FILES = [
  "lib/db/schema-check-in.ts",
  "lib/db/schema-check-in-photos.ts",
  "lib/db/check-in-photo-service.ts",
  "lib/db/check-in-schedule-service.ts",
  "lib/db/check-in-service.ts",
  "app/portal/check-ins/actions.ts",
  "app/portal/check-ins/new/page.tsx",
  "components/portal/CheckInForm.tsx",
  "components/portal/CheckInPhotoUploader.tsx",
  "app/hq/clients/[clientId]/actions.ts",
  "app/hq/clients/[clientId]/page.tsx",
  "components/hq/workspace/CheckInScheduleEditor.tsx",
  "app/hq/check-ins/[checkInId]/page.tsx",
  "components/hq/check-ins/CheckInPhotoGallery.tsx",
  "scripts/setup-check-in-photos-bucket.ts",
];

// Strips // line comments and /* */ block comments so a comment
// mentioning the words in prose (like this file's own header, and
// schema-check-in.ts's/check-in-schedule-service.ts's pre-existing
// architecture comments) never trips the check meant for real code.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("Check-In Progress Photos pass — no hardcoded Sunday/Wednesday logic", () => {
  for (const relativePath of PRODUCTION_FILES) {
    it(`${relativePath} contains no literal "Sunday"/"Wednesday" outside comments`, () => {
      const source = readFileSync(resolve(__dirname, "../../../", relativePath), "utf8");
      const code = stripComments(source);
      expect(code).not.toMatch(/Sunday/);
      expect(code).not.toMatch(/Wednesday/);
    });
  }
});
