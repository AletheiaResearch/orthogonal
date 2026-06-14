import * as migration_20260614_110042_initial from "./20260614_110042_initial";

export const migrations = [
  {
    up: migration_20260614_110042_initial.up,
    down: migration_20260614_110042_initial.down,
    name: "20260614_110042_initial",
  },
];
