#!/usr/bin/env bash
# Vercel "Ignored Build Step" — build a project only when it (or a workspace dependency) changed.
# Mirrors the Turborepo docs' CI example: https://turborepo.dev/docs/reference/query#ci-example
#
# `turbo query affected --exit-code` returns 1 (affected), 0 (none), or 2 (error), which maps onto
# Vercel's contract: 1 -> build, 0 -> skip, 2 -> build (fail-safe). Run from the app's Root Directory;
# turbo walks up to the workspace root.
#
# NOTE: trying Vercel's global turbo directly (no npx). The ignore step runs BEFORE install, so if the
# global turbo is too old for `query affected` this errors and Vercel builds (fail-safe). If so, switch
# back to `npx --yes turbo ...`.
#
# Usage: bash ../../scripts/vercel-ignore.sh <package-name>
turbo query affected --packages "$1" --base "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" --exit-code
