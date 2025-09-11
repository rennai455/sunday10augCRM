#!/usr/bin/env node
// Generate JSON Schemas from Zod definitions to docs/api-schemas.json
const fs = require('fs');
const path = require('path');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { schemas } = require('../src/validate');

const out = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'renn-ai-crm API Schemas',
  definitions: {},
};

for (const [name, schema] of Object.entries(schemas)) {
  out.definitions[name] = zodToJsonSchema(schema, name);
}

const outPath = path.join(__dirname, '..', 'docs', 'api-schemas.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath);

