import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadShowcases, renderRendererCatalogModule } from "./lib/showcase.mjs";

const output = path.join(process.cwd(), "packages/hodos/generated/renderer-catalog.js");
const expected = renderRendererCatalogModule(await loadShowcases());
let actual = null;
try {
  actual = await readFile(output, "utf8");
} catch {
  // Report the same actionable failure for missing and stale generated output.
}
if (actual !== expected) {
  console.error("Alumbra Renderer Catalog is stale. Run npm run catalog:build and commit the result.");
  const encoded = Buffer.from(expected, "utf8").toString("base64");
  const width = 3000;
  for (let offset = 0; offset < encoded.length; offset += width) {
    const index = String(offset / width).padStart(3, "0");
    console.error(`ALUMBRA_CATALOG_EXPECTED_${index}=${encoded.slice(offset, offset + width)}`);
  }
  process.exitCode = 1;
} else {
  console.log("Alumbra Renderer Catalog is current.");
}
