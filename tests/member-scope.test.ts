import { describe, expect, it } from "vitest";

import { relationMatchesScope, type MemberRelation } from "@yonetim/contracts";

const rel = (relation: string, ended = false, unitHasActiveTenant = false): MemberRelation => ({
  relation,
  ended,
  unitHasActiveTenant,
});

describe("üye kapsamı", () => {
  it("aktif malik: malik, aktif, (kiracısız dairede) oturan", () => {
    const rows = [rel("owner")];
    expect(relationMatchesScope(rows, "owner")).toBe(true);
    expect(relationMatchesScope(rows, "active")).toBe(true);
    expect(relationMatchesScope(rows, "occupant")).toBe(true);
    expect(relationMatchesScope(rows, "tenant")).toBe(false);
    expect(relationMatchesScope(rows, "former_owner")).toBe(false);
  });

  it("kiracılı dairenin maliği oturan değildir", () => {
    expect(relationMatchesScope([rel("owner", false, true)], "occupant")).toBe(false);
    expect(relationMatchesScope([rel("tenant", false, true)], "occupant")).toBe(true);
  });

  it("eski kiracı yalnız eski kiracı kapsamında (ve tümde)", () => {
    const rows = [rel("tenant", true)];
    expect(relationMatchesScope(rows, "former_tenant")).toBe(true);
    expect(relationMatchesScope(rows, "all")).toBe(true);
    expect(relationMatchesScope(rows, "active")).toBe(false);
    expect(relationMatchesScope(rows, "tenant")).toBe(false);
  });

  it("aynı ilişki yeniden başladıysa eski sayılmaz", () => {
    const rows = [rel("tenant", true), rel("tenant")];
    expect(relationMatchesScope(rows, "former_tenant")).toBe(false);
    expect(relationMatchesScope(rows, "tenant")).toBe(true);
  });

  it("eski kiracı olup malik olan kişi her iki kapsamda", () => {
    const rows = [rel("tenant", true), rel("owner")];
    expect(relationMatchesScope(rows, "former_tenant")).toBe(true);
    expect(relationMatchesScope(rows, "owner")).toBe(true);
  });
});
