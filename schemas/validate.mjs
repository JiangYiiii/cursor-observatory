import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pairs = [
  ["examples/manifest.json", "manifest.schema.json"],
  ["examples/architecture.json", "architecture.schema.json"],
  ["examples/capabilities.json", "capabilities.schema.json"],
  ["examples/progress.json", "progress.schema.json"],
  ["examples/test-results.json", "test-results.schema.json"],
  ["examples/test-mapping.json", "test-mapping.schema.json"],
  ["examples/test-expectations.json", "test-expectations.schema.json"],
  ["examples/ai-sessions.json", "ai-sessions.schema.json"],
  ["examples/data-models.json", "data-models.schema.json"],
  ["examples/docs-health.json", "docs-health.schema.json"],
  ["examples/sessions-index.json", "sessions-index.schema.json"],
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let failed = false;
for (const [dataRel, schemaRel] of pairs) {
  const dataPath = join(__dirname, dataRel);
  const schemaPath = join(__dirname, schemaRel);
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (!ok) {
    failed = true;
    console.error(`FAIL ${dataRel} vs ${schemaRel}`);
    console.error(validate.errors);
  } else {
    console.log(`OK   ${dataRel}`);
  }
}

if (failed) {
  process.exit(1);
}
