#!/usr/bin/env node
/**
 * i18n guard (runs in CI):
 *  1. every locale file has exactly the same keys as en.json,
 *  2. every literal translation key used in apps/web/src exists,
 *  3. every dynamic key prefix (t(`enums.x.${v}`)) has at least one entry.
 *
 *   node scripts/check-i18n.mjs            # report and exit 1 on problems
 *   node scripts/check-i18n.mjs --missing  # print missing keys as JSON (en)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = join(root, 'apps/web/messages');
const srcDir = join(root, 'apps/web/src');
const LOCALES = ['en', 'ru', 'kk'];

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, new Set(flatten(JSON.parse(readFileSync(join(messagesDir, `${l}.json`), 'utf8'))))]),
);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mts)$/.test(name) ? [p] : [];
  });
}

const used = new Set();
const prefixes = new Set();
const SCOPE_SPLIT = /\n(?=(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s)/;
const BIND_RE =
  /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([^']*)'|\{[^}]*namespace:\s*'([^']*)'[^}]*\})?\s*\)/g;

for (const file of walk(srcDir)) {
  // Each top-level function is its own scope: components in one file often reuse `t` for different namespaces.
  for (const code of readFileSync(file, 'utf8').split(SCOPE_SPLIT)) {
    const bindings = new Map();
    for (const m of code.matchAll(BIND_RE)) bindings.set(m[1], m[2] ?? m[3] ?? '');
    for (const [name, ns] of bindings) {
      const callRe = new RegExp(`\\b${name}(?:\\.rich|\\.has)?\\(\\s*(?:'([^']+)'|\`([^\`]+)\`)`, 'g');
      for (const m of code.matchAll(callRe)) {
        if (m[0].includes('.has(')) continue;
        if (m[1]) used.add(ns ? `${ns}.${m[1]}` : m[1]);
        else if (m[2]) prefixes.add(ns ? `${ns}.${m[2].split('${')[0]}` : m[2].split('${')[0]);
      }
    }
  }
}

const en = messages.en;
const problems = [];
for (const l of LOCALES.slice(1)) {
  const missing = [...en].filter((k) => !messages[l].has(k));
  const extra = [...messages[l]].filter((k) => !en.has(k));
  if (missing.length) problems.push(`${l}: ${missing.length} keys missing (e.g. ${missing.slice(0, 5).join(', ')})`);
  if (extra.length) problems.push(`${l}: ${extra.length} extra keys (e.g. ${extra.slice(0, 5).join(', ')})`);
}
const missingUsed = [...used].filter((k) => !en.has(k)).sort();
const missingPrefixes = [...prefixes].filter((p) => ![...en].some((k) => k.startsWith(p))).sort();
if (missingUsed.length) problems.push(`${missingUsed.length} keys used in code but missing in en.json`);
if (missingPrefixes.length)
  problems.push(`${missingPrefixes.length} dynamic key prefixes with no entries: ${missingPrefixes.join(', ')}`);

if (process.argv.includes('--missing')) {
  console.log(JSON.stringify({ missing: missingUsed, prefixes: missingPrefixes }, null, 2));
  process.exit(0);
}
if (problems.length) {
  console.error(`i18n check failed:\n - ${problems.join('\n - ')}`);
  if (missingUsed.length) console.error(missingUsed.map((k) => `   ${k}`).join('\n'));
  process.exit(1);
}
console.log(
  `i18n OK — ${en.size} keys × ${LOCALES.length} locales, ${used.size} literal keys and ${prefixes.size} dynamic prefixes verified.`,
);
