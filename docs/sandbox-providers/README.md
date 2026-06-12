# Sandbox providers

**Status:** Modal is the only supported sandbox backend (since commit `e0931d3`, June 2026).

Open-Inspect previously supported deploy-time selection among Modal, Daytona, and Vercel Sandboxes.
That multi-provider layer was removed to simplify operations, tests, and documentation. Modal
remains required for all sandbox execution, repo image builds, and session filesystem snapshots.

This folder documents what changed and what survived, so a future backend (for example Cloudflare
Sandboxes) can be added without rediscovering the migration by hand.

> **Not covered here:** Vercel **web hosting** (`web_platform = "vercel"`,
> `terraform/modules/vercel-project/`). That is unrelated to Vercel Sandbox execution, which was
> removed.

## Documents

| Document                                       | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| [CHANGELOG.md](./CHANGELOG.md)                 | Narrative log of the Modal-only migration by layer         |
| [REMOVED.md](./REMOVED.md)                     | Deleted files, env vars, Terraform outputs, and DB helpers |
| [ARCHITECTURE.md](./ARCHITECTURE.md)           | What remains: `SandboxProvider`, lifecycle, Modal wiring   |
| [ADDING_A_PROVIDER.md](./ADDING_A_PROVIDER.md) | Checklist for adding a second sandbox backend              |

**To add a provider, start with [ADDING_A_PROVIDER.md](./ADDING_A_PROVIDER.md).**

## Recovering deleted code

Reference implementations for Daytona and Vercel lived in the tree before `e0931d3`. To inspect them
without checking out an old branch:

```bash
git show e0931d3^:packages/control-plane/src/sandbox/provider-name.ts
git show e0931d3^:packages/control-plane/src/sandbox/providers/daytona-provider.ts
git show e0931d3^:packages/control-plane/src/sandbox/providers/vercel/provider.ts
```
