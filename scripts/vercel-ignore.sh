#!/usr/bin/env bash
# Vercel "Ignored Build Step" — build a project only when it (or a workspace dependency) changed.
# Mirrors the Turborepo docs' CI example: https://turborepo.dev/docs/reference/query#ci-example
#
# `turbo query affected --exit-code` returns 1 (affected), 0 (none), or 2 (error), which maps onto
# Vercel's contract: 1 -> build, 0 -> skip, 2 -> build (fail-safe). The ignore step runs BEFORE
# install, so there is no project-local turbo yet and Vercel's global turbo predates `query affected`
# — hence npx fetches a current one. Run from the app's Root Directory; turbo walks up to the root.
#
# Usage: bash ../../scripts/vercel-ignore.sh <package-name>
npx --yes turbo query affected --packages "$1" --base "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" --exit-code
