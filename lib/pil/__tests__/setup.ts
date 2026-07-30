// Mock "server-only" so PIL modules can be imported in Vitest (node env).
// The actual server-only guard is a no-op in tests; the modules are never
// imported from a browser context in this test suite.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
