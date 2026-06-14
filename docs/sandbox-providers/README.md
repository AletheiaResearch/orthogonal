# Sandbox providers

**Status:** Modal is the only supported sandbox backend (since the Modal-only migration, June 2026).

Open-Inspect previously supported deploy-time selection among Modal, Daytona, and Vercel Sandboxes.
That multi-provider layer was removed to simplify operations, tests, and documentation. Modal
remains required for all sandbox execution, repo image builds, and session filesystem snapshots.

This folder documents what changed and what survived, so a future backend (for example Cloudflare
Sandboxes) can be added without rediscovering the migration by hand.

## Documents

| Document                                       | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| [CHANGELOG.md](./CHANGELOG.md)                 | Narrative log of the Modal-only migration by layer         |
| [REMOVED.md](./REMOVED.md)                     | Deleted files, env vars, Terraform outputs, and DB helpers |
| [ARCHITECTURE.md](./ARCHITECTURE.md)           | What remains: `SandboxProvider`, lifecycle, Modal wiring   |
| [ADDING_A_PROVIDER.md](./ADDING_A_PROVIDER.md) | Checklist for adding a second sandbox backend              |

**To add a provider, start with [ADDING_A_PROVIDER.md](./ADDING_A_PROVIDER.md).**

## Recovering deleted code

Reference implementations for Daytona and Vercel lived in the tree before the migration. To inspect
them without checking out an old branch, find the migration commit on your branch:

```bash
git log --oneline --grep='standardize to modal'
# Then substitute <migration-commit> below (parent commit = <migration-commit>^)
git show <migration-commit>^:packages/control-plane/src/sandbox/provider-name.ts
git show <migration-commit>^:packages/control-plane/src/sandbox/providers/daytona-provider.ts
git show <migration-commit>^:packages/control-plane/src/sandbox/providers/vercel/provider.ts
```

See [CHANGELOG.md](./CHANGELOG.md) for a reference commit hash from the original PR branch (may
differ after squash merge).
