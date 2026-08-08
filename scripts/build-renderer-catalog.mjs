import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadShowcases, renderRendererCatalogModule } from "./lib/showcase.mjs";

const output = path.join(process.cwd(), "packages/hodos/generated/renderer-catalog.js");
const showcases = await loadShowcases();
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, renderRendererCatalogModule(showcases), "utf8");
console.log(`Generated ${path.relative(process.cwd(), output)} from ${showcases.length} package Showcases.`);
