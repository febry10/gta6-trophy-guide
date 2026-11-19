// A working gta6-trophy-guide-01 entry (Node 22, standard library only): the guide is this directory's app/ folder,
// plain static files a browser opens at app/index.html (ES modules, CSS, no build step), offline: it loads nothing
// over the network, and its trophy list and guides are app/data/trophies.json. The program hands it in: it copies app/
// and screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the judge reads (your
// screenshots, the first load's files and bytes, and your source), with the vendored make.fun library. Leave
// vendor/makefun-frontend.ts as it is: the scorer requires dossier.json to be byte for byte what its own copy writes.
//
// Only the plumbing, not a winner: a plain checklist of the 55 trophies with a one-line hint each. Write a real guide
// for every trophy in your own words, a roadmap to the platinum, filters and a spoiler setting in app/, put 3 or 4 PNG
// or JPEG screenshots of it in screenshots/ (the first by name is the cover; shots.json says which views this
// starter's were taken of), and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Preflight validation -------------------------------------------------------
// The hand-in at the bottom copies whatever sits in app/ and screenshots/ and lets
// the vendored library summarise it. That library enforces the scorer's caps while
// it writes, but it says nothing about the trophy data itself, and a refusal from it
// arrives as a dossier error rather than as the name of the thing that is wrong in
// this repository. So before anything is copied, the entry checks its own
// deliverables against the two contracts that decide whether it counts: the gate's
// trophies row (every one of the 55 trophies carrying a guide) and the caps the
// scorer applies to screenshots/ and app/. A failure here is a bug in this
// repository, so the program stops and names it instead of handing in an entry
// that would be refused.

const TROPHY_COUNT = 55;
const SHOT_MAX_BYTES = 262144;
const APP_FILE_LIMIT = 993;
const APP_BYTE_LIMIT = 50331648;
const IMAGE_SUFFIXES = ['.png', '.jpg', '.jpeg'];

function preflightFail(problem: string): never {
  throw new Error(`preflight: ${problem}`);
}

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkTrophyData(root: string): void {
  const dataPath = join(root, 'app', 'data', 'trophies.json');
  if (!existsSync(dataPath)) preflightFail('app/data/trophies.json is missing');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(dataPath, 'utf8'));
  } catch {
    preflightFail('app/data/trophies.json does not parse as JSON');
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { trophies?: unknown } | null)?.trophies;
  if (!Array.isArray(list)) preflightFail('app/data/trophies.json holds no trophy list');
  if (list.length !== TROPHY_COUNT) {
    preflightFail(`app/data/trophies.json lists ${list.length} trophies, but the game has ${TROPHY_COUNT}`);
  }
  list.forEach((trophy, index) => {
    const fields = trophy as Record<string, unknown> | null;
    for (const field of ['name', 'description', 'grade', 'guide']) {
      if (fields === null || !isFilled(fields[field])) {
        preflightFail(`trophy ${index + 1} of app/data/trophies.json has no usable ${field}`);
      }
    }
  });
}

function imageNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => IMAGE_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix)))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

function checkScreenshots(root: string): string[] {
  const dir = join(root, 'screenshots');
  const names = imageNames(dir);
  if (names.length < 3 || names.length > 4) {
    preflightFail(`screenshots/ holds ${names.length} image files, but an entry hands in 3 or 4`);
  }
  for (const name of names) {
    const size = statSync(join(dir, name)).size;
    if (size > SHOT_MAX_BYTES) {
      preflightFail(`screenshots/${name} is ${size} bytes, over the ${SHOT_MAX_BYTES}-byte cap`);
    }
  }
  return names;
}

function checkAppTree(root: string): void {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else {
        files += 1;
        bytes += info.size;
      }
    }
  };
  walk(join(root, 'app'));
  if (files > APP_FILE_LIMIT) preflightFail(`app/ holds ${files} files, over the ${APP_FILE_LIMIT}-file cap`);
  if (bytes > APP_BYTE_LIMIT) preflightFail(`app/ totals ${bytes} bytes, over the ${APP_BYTE_LIMIT}-byte cap`);
}

function runPreflight(root: string): string[] {
  checkTrophyData(root);
  const shots = checkScreenshots(root);
  checkAppTree(root);
  return shots;
}

const validatedShots = runPreflight(here);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files and directories in app/ or
// 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648 }),
);

// --- Verified hand-in -------------------------------------------------------------
// dossier.json is the summary the judge reads, so writing it is not taken on
// trust: the program reads the file back and checks that the screenshots it
// claims are exactly the images the preflight validated and the copy delivered.
// Any mismatch means what sits in the output is not the entry that was checked,
// and the run fails rather than leave a hand-in nobody verified.
const written = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')) as { images?: Array<{ name?: unknown }> };
const claimedShots = Array.isArray(written.images) ? written.images.map((image) => image?.name) : [];
const copiedShots = imageNames(join(out, 'screenshots'));
const sameList = (a: unknown[], b: string[]): boolean => a.length === b.length && a.every((name, index) => name === b[index]);
if (!sameList(claimedShots, copiedShots) || !sameList(copiedShots, validatedShots)) {
  throw new Error(
    `hand-in: dossier.json lists [${claimedShots.join(', ')}], the output holds [${copiedShots.join(', ')}], ` +
    `and the preflight validated [${validatedShots.join(', ')}]`,
  );
}
