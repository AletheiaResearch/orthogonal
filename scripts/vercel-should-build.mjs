#!/usr/bin/env node
// @ts-check
/**
 * Vercel "Ignored Build Step" decider for this pnpm + Turborepo monorepo.
 *
 * Vercel runs this from a project's Root Directory on every deployment and reads the exit code:
 *   - exit 1  -> BUILD  (proceed)
 *   - exit 0  -> SKIP   (deployment is CANCELED)
 *
 * Wire it up per project via vercel.json `ignoreCommand`, e.g. in apps/landing/vercel.json:
 *   { "ignoreCommand": "node ../../scripts/vercel-should-build.mjs @orthogonal/landing" }
 *
 * It builds when the target package OR any of its transitive workspace dependencies changed, or a
 * global build input changed (lockfile, workspace manifest, turbo.json, root package.json/tsconfig).
 * It skips when every changed file is either build-irrelevant (docs, .github, markdown, terraform,
 * editor/lint config) or belongs to an unrelated workspace package.
 *
 * Bias: fail SAFE toward BUILDING. Any ambiguity (no comparison base, unknown file, parse error)
 * builds rather than risk skipping a deploy that should have shipped.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const BUILD = 1;
const SKIP = 0;
const log = (msg) => console.log(`[vercel-should-build] ${msg}`);
/** @param {0|1} code @param {string} reason */
const decide = (code, reason) => {
  log(`${code === BUILD ? "BUILD" : "SKIP"}: ${reason}`);
  process.exit(code);
};

const target = process.argv[2];
if (!target) decide(BUILD, "no target package argument provided");

// --- Locate the repo root (nearest ancestor containing pnpm-workspace.yaml) ---
function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
const repoRoot = findRepoRoot(process.cwd());
if (!repoRoot) decide(BUILD, "could not locate repo root (pnpm-workspace.yaml)");

const git = (args) =>
  execSync(`git ${args}`, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
const gitOk = (args) => {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
};
const shaExists = (sha) => Boolean(sha) && gitOk(`cat-file -e ${sha}^{commit}`);

// --- Determine the comparison base ---
// Prefer the SHA Vercel last built for THIS project; fall back to HEAD's parent. Vercel clones are
// shallow, so try to fetch the previous SHA before giving up.
const head = process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";
let base = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
if (base && !shaExists(base)) gitOk(`fetch --depth=100 origin ${base}`);
if (!shaExists(base)) {
  base = gitOk(`rev-parse ${head}~1`) ? git(`rev-parse ${head}~1`) : "";
}
if (!shaExists(base)) decide(BUILD, "no usable comparison base (first commit or shallow clone)");

let changed;
try {
  changed = git(`diff --name-only ${base} ${head}`).split("\n").filter(Boolean);
} catch {
  decide(BUILD, `git diff ${base}..${head} failed`);
}
if (changed.length === 0) decide(BUILD, "no file changes between base and HEAD (e.g. redeploy)");

// --- Load the workspace package graph ---
function loadWorkspace() {
  /** @type {Record<string, {dir: string, deps: Record<string,string>, internal: string[]}>} */
  const pkgs = {};
  for (const root of ["packages", "apps"]) {
    const rootPath = join(repoRoot, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(rootPath, entry.name, "package.json");
      if (!existsSync(manifest)) continue;
      const json = JSON.parse(readFileSync(manifest, "utf8"));
      pkgs[json.name] = {
        dir: `${root}/${entry.name}`,
        deps: { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies },
        internal: [],
      };
    }
  }
  const names = new Set(Object.keys(pkgs));
  for (const pkg of Object.values(pkgs)) {
    pkg.internal = Object.keys(pkg.deps).filter((dep) => names.has(dep));
  }
  return pkgs;
}
const pkgs = loadWorkspace();
if (!pkgs[target]) decide(BUILD, `target "${target}" not found in workspace`);

// Transitive closure: the target plus every workspace package it (transitively) depends on.
function dependencyClosure(name) {
  const seen = new Set();
  const stack = [name];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current) || !pkgs[current]) continue;
    seen.add(current);
    stack.push(...pkgs[current].internal);
  }
  return seen;
}
const affecting = dependencyClosure(target);

// --- Classify each changed file ---
// Build-irrelevant paths: never affect any deployment output.
const IGNORE = [
  /^docs\//,
  /^\.github\//,
  /^\.vscode\//,
  /^\.idea\//,
  /^terraform\//,
  /^\.changeset\//,
  /^\.husky\//,
  /(^|\/)README(\.[^/]+)?$/i,
  /\.mdx?$/i,
  /^LICENSE$/i,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^\.editorconfig$/,
  /^CODEOWNERS$/,
  /^\.?oxlint.*/i,
  /^\.prettier.*/i,
];
// Root files that can change build output for ANY project -> always build.
const GLOBAL_BUILD_INPUTS = new Set([
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  ".npmrc",
]);
const ownerOf = (file) => {
  let owner = null;
  let longest = -1;
  for (const [name, info] of Object.entries(pkgs)) {
    const prefix = `${info.dir}/`;
    if (file.startsWith(prefix) && info.dir.length > longest) {
      owner = name;
      longest = info.dir.length;
    }
  }
  return owner;
};

const unrelated = [];
for (const file of changed) {
  if (IGNORE.some((re) => re.test(file))) continue;
  if (GLOBAL_BUILD_INPUTS.has(file)) decide(BUILD, `global build input changed: ${file}`);
  const owner = ownerOf(file);
  if (!owner) decide(BUILD, `unrecognized change outside any workspace package: ${file}`);
  if (affecting.has(owner)) decide(BUILD, `change in "${owner}" affects "${target}": ${file}`);
  unrelated.push(`${file} (${owner})`);
}

decide(
  SKIP,
  `none of ${changed.length} changed file(s) affect "${target}" — all build-irrelevant or in unrelated packages [${unrelated.join(", ") || "ignored only"}]`
);
