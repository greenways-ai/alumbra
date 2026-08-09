import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRendererShowcases, renderRendererCatalogModule } from "./lib/showcase.mjs";

const output = path.join(process.cwd(), "packages/hodos/generated/renderer-catalog.js");
const expected = renderRendererCatalogModule(await loadRendererShowcases());
let actual = null;
try {
  actual = await readFile(output, "utf8");
} catch {
  // Report the same actionable failure for missing and stale generated output.
}
if (actual !== expected) {
  console.error("Alumbra Renderer Catalog is stale. Run npm run catalog:build and commit the result.");
  process.exitCode = 1;
} else {
  console.log("Alumbra Renderer Catalog is current.");
}
