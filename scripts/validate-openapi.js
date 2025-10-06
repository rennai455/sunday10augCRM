#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const ROUTES_FILE = path.join(__dirname, '..', 'src', 'routes.js');
const SPEC_FILE = path.join(__dirname, '..', 'docs', 'openapi.json');
const VALIDATE_FILE = path.join(__dirname, '..', 'src', 'validate.js');

function extractRoutes(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\bapp\.(get|post|put|delete|patch)\s*\(/);
    if (!m) continue;
    // Look ahead for the first argument which should be a string literal on current or next lines
    let j = i;
    let buf = '';
    while (j < Math.min(i + 5, lines.length)) {
      buf += lines[j] + '\n';
      j++;
      const pm = buf.match(/\bapp\.(get|post|put|delete|patch)\s*\(\s*([`'\"])\s*([^`'\"]+)\s*\2/);
      if (pm) {
        const method = pm[1].toLowerCase();
        const pathStr = pm[3];
        out.push({ method, path: pathStr });
        break;
      }
    }
  }
  // Filter to API-relevant routes
  const keep = out.filter((r) => r.path.startsWith('/api') || r.path === '/webhook' || r.path === '/metrics' || r.path === '/health' || r.path === '/healthz' || r.path === '/readyz' || r.path === '/readiness');
  return keep;
}

function pascalCase(name) {
  return name.replace(/(^|[_-])(\w)/g, (_, __, c) => c.toUpperCase());
}

function extractSchemaNames(src) {
  // Very simple parser: find keys inside "const schemas = { ... }"
  const start = src.indexOf('const schemas = {');
  if (start < 0) return [];
  const body = src.slice(start);
  const end = body.indexOf('};');
  const objSrc = body.slice(0, end >= 0 ? end : body.length);
  const keys = new Set();
  for (const m of objSrc.matchAll(/\n\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) {
    keys.add(m[1]);
  }
  return Array.from(keys);
}

function main() {
  const routesSrc = fs.readFileSync(ROUTES_FILE, 'utf8');
  const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
  const validateSrc = fs.readFileSync(VALIDATE_FILE, 'utf8');

  const routes = extractRoutes(routesSrc);
  const specPaths = spec.paths || {};

  const missing = [];
  for (const r of routes) {
    const p = specPaths[r.path];
    if (!p) {
      missing.push(`${r.method.toUpperCase()} ${r.path} (missing path)`);
      continue;
    }
    if (!p[r.method]) {
      missing.push(`${r.method.toUpperCase()} ${r.path} (missing method operation)`);
    }
  }

  const schemasInCode = extractSchemaNames(validateSrc);
  const schemaNamesExpected = schemasInCode.map(pascalCase);
  const specSchemas = Object.keys((spec.components && spec.components.schemas) || {});
  const schemasMissing = schemaNamesExpected.filter((s) => !specSchemas.includes(s));

  if (missing.length === 0 && schemasMissing.length === 0) {
    console.log('OpenAPI validation OK: routes and schemas are covered.');
    process.exit(0);
  }

  if (missing.length) {
    console.log('Missing from OpenAPI spec:');
    for (const m of missing) console.log(' -', m);
  }
  if (schemasMissing.length) {
    console.log('\nSchemas referenced in code but missing in OpenAPI components:');
    for (const s of schemasMissing) console.log(' -', s);
  }
  // Non-zero exit to help CI flag gaps
  process.exit(1);
}

main();

