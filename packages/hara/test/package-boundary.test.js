import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

function files(directory, extension) {
  const output = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...files(file, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) output.push(file);
  }
  return output;
}

test("Hara rules package imports only Core and contains required HAL namespaces", () => {
  for (const file of files(path.join(root, "src"), ".js")) {
    const source = fs.readFileSync(file, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      assert(
        specifier.startsWith(".") || specifier === "@greenways/alumbra-core",
        `${path.relative(root, file)} imports unexpected ${specifier}`,
      );
    }
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|indexedDB)\b/);
    assert.doesNotMatch(source, /@greenways\/hodos|playcanvas|@greenways\/alumbra-(?:engine|renderer|game|hodos)/);
  }
  const expected = ["block", "chunk", "generator", "transaction", "world", "game"];
  for (const namespace of expected) {
    const file = path.join(root, "src/gw/alumbra", `${namespace}.hal`);
    assert.equal(fs.existsSync(file), true, `${namespace}.hal is required`);
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, new RegExp(`\\(ns gw\\.alumbra\\.${namespace}\\)`));
  }
});
