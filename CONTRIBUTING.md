# Contributing to Open-Inspect

Thank you for your interest in contributing to Open-Inspect! This document provides guidelines for
contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/open-inspect.git`
3. Run the setup script: `bash .openinspect/setup.sh`
4. Create a branch for your changes: `git checkout -b feature/your-feature-name`

## Development Setup

The quickest way to get a working environment:

```bash
bash .openinspect/setup.sh
```

This handles pnpm dependencies, builds the shared package, configures git hooks (husky +
lint-staged), and optionally sets up a Python virtualenv for `packages/modal-infra`.

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for full deployment instructions. See
[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for local setup and day-to-day development paths.

For manual setup or individual steps:

```bash
# Install dependencies
corepack enable
pnpm install

# Build shared package
pnpm --filter @open-inspect/shared build

# Run type checking
pnpm run typecheck

# Run linting
pnpm run lint

# Run tests
pnpm -r run test
```

## Project Structure

| Package                    | Description                          |
| -------------------------- | ------------------------------------ |
| `packages/control-plane`   | Cloudflare Workers + Durable Objects |
| `packages/web`             | Next.js web application              |
| `apps/orto`                | Next.js web app (Vercel + PostHog)   |
| `packages/sandbox-runtime` | Shared in-sandbox agent runtime      |
| `packages/modal-infra`     | Modal sandbox infrastructure         |
| `packages/shared`          | Shared types and utilities           |

## Making Changes

### Code Style

- Run `pnpm run lint` before committing
- Run `pnpm run typecheck` to ensure type safety
- Follow existing code patterns in the codebase

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add new feature`
- `fix: resolve issue with X`
- `docs: update documentation`
- `refactor: restructure module`

### Pull Requests

1. Ensure all tests pass: `pnpm -r run test`
2. Ensure linting passes: `pnpm run lint`
3. Ensure type checking passes: `pnpm run typecheck`
4. Update documentation if needed
5. Provide a clear description of your changes

### Source Control Provider Contributions

For SCM/provider changes, follow:

- `docs/adr/0001-single-provider-scm-boundaries.md`
- `docs/provider-contribution-checklist.md`

### Sandbox Provider Contributions

Open-Inspect currently runs Modal as the only sandbox backend. To add or change sandbox providers,
start with:

- `docs/sandbox-providers/README.md`
- `docs/sandbox-providers/ADDING_A_PROVIDER.md`

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)

## Questions

If you have questions, please open a GitHub issue with the "question" label.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
