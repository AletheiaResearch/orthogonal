import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanD1Tables } from "./cleanup";
import { initSession, queryDO } from "./helpers";

/**
 * CON-72: the DO `sandbox` table carries a `runtime_gateway_capable` column
 * (migration 32). Proving it through the real workerd SQLite guards the
 * legacy-safe invariant the gate depends on: a freshly-created row defaults to
 * NULL (= not gateway-capable), so a restore of a pre-gateway snapshot never
 * mints a token / drops raw keys into a plugin-less image.
 */
describe("sandbox.runtime_gateway_capable (migration 32)", () => {
  beforeEach(async () => {
    await cleanD1Tables();
  });

  afterEach(async () => {
    await cleanD1Tables();
  });

  it("column exists, defaults to NULL on a new row, and round-trips 0/1", async () => {
    const { stub } = await initSession();

    await queryDO(
      stub,
      "INSERT INTO sandbox (id, status, git_sync_status, created_at) VALUES ('sb-cap-1', 'pending', 'pending', 1)"
    );

    const initial = await queryDO<{ runtime_gateway_capable: number | null }>(
      stub,
      "SELECT runtime_gateway_capable FROM sandbox WHERE id = 'sb-cap-1'"
    );
    expect(initial).toHaveLength(1);
    expect(initial[0].runtime_gateway_capable).toBeNull();

    await queryDO(stub, "UPDATE sandbox SET runtime_gateway_capable = 1 WHERE id = 'sb-cap-1'");
    const capable = await queryDO<{ runtime_gateway_capable: number | null }>(
      stub,
      "SELECT runtime_gateway_capable FROM sandbox WHERE id = 'sb-cap-1'"
    );
    expect(capable[0].runtime_gateway_capable).toBe(1);

    await queryDO(stub, "UPDATE sandbox SET runtime_gateway_capable = 0 WHERE id = 'sb-cap-1'");
    const notCapable = await queryDO<{ runtime_gateway_capable: number | null }>(
      stub,
      "SELECT runtime_gateway_capable FROM sandbox WHERE id = 'sb-cap-1'"
    );
    expect(notCapable[0].runtime_gateway_capable).toBe(0);
  });
});
