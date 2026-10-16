import { describe, expect, it } from "vitest";
import type { Permission, SessionContext } from "@/lib/auth";
import { REPORTS, reportAllowed } from "@/lib/reports";
import { navFor } from "@/components/shell/nav-config";

const session = (perms: Permission[]) => ({ can: (p: Permission) => perms.includes(p) }) as unknown as SessionContext;
const report = (k: string) => REPORTS.find((r) => r.key === k)!;

describe("exports respect permissions", () => {
  it("requires reports.export plus the data permission", () => {
    expect(reportAllowed(session(["members.read"]), report("roster"))).toBe(false);
    expect(reportAllowed(session(["reports.export", "members.read"]), report("roster"))).toBe(true);
  });
  it("disciplinary records need discipline.read AND reports.sensitive", () => {
    expect(reportAllowed(session(["reports.export", "discipline.read"]), report("discipline"))).toBe(false);
    expect(reportAllowed(session(["reports.export", "discipline.read", "reports.sensitive"]), report("discipline"))).toBe(true);
  });
  it("treasurer-style access cannot export discipline", () => {
    expect(reportAllowed(session(["reports.export", "dues.read", "members.read"]), report("discipline"))).toBe(false);
    expect(reportAllowed(session(["reports.export", "dues.read", "members.read"]), report("dues"))).toBe(true);
  });
  it("sensitive columns are flagged and off by default", () => {
    for (const r of REPORTS) for (const c of r.columns.filter((x) => x.sensitive)) expect(c.default && !r.requiresSensitive).toBeFalsy();
  });
});

describe("navigation follows permissions", () => {
  it("read-only officer does not see admin sections", () => {
    const items = navFor((p) => ["events.read", "members.read"].includes(p)).map((i) => i.href);
    expect(items).toContain("/calendar");
    expect(items).not.toContain("/audit");
    expect(items).not.toContain("/settings");
  });
});
