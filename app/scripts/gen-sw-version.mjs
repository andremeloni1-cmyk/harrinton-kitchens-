// Stamps a per-build id into public/sw-version.js, which the service worker
// importScripts() to name its cache (P2-C3). Because the id changes every build,
// each deploy ships a new cache name and the SW's activate handler prunes the
// previous cache — so content-hashed /_next/static assets can't accumulate on a
// device, and a stale offline page never lingers. The file is git-ignored and
// regenerated on every build.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
// Prefer a deploy-provided commit sha; fall back to a build timestamp so local
// and CI builds still get a unique id.
const raw = process.env.SOURCE_VERSION || process.env.GITHUB_SHA || String(Date.now());
const version = raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "dev";

const out = join(dir, "..", "public", "sw-version.js");
writeFileSync(out, `self.__SW_BUILD = ${JSON.stringify(version)};\n`);
console.log(`[gen-sw-version] ${out} -> ${version}`);
