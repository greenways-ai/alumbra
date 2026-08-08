import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = new URL("../", import.meta.url);
const coreDirectory = new URL("../packages/core/", import.meta.url);
const sourceDirectory = new URL("../packages/core/src/", import.meta.url);
const forbiddenSpecifiers = [
  "@greenways/hodos",
  "playcanvas",
  "@greenways/alumbra-game",
  "@greenways/alumbra-hodos",
];
const forbiddenGlobals = [
  /\bglobalThis\.document\b/,
  /\bglobalThis\.window\b/,
  /\bwindow\./,
  /\bdocument\./,
];

const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && /\.(js|hal)$/.test(entry.name)) inspect(file);
  }
}

function inspect(file) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(new URL(".", root).pathname, file);
  const imports = source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    for (const forbidden of forbiddenSpecifiers) {
      if (specifier.includes(forbidden)) {
        failures.push(`${relative}: forbidden import ${specifier}`);
      }
    }
  }
  if (file.endsWith(".js")) {
    for (const pattern of forbiddenGlobals) {
      if (pattern.test(source)) failures.push(`${relative}: forbidden browser global ${pattern}`);
    }
  }
}

walk(new URL(".", sourceDirectory).pathname);

const manifest = JSON.parse(fs.readFileSync(new URL("package.json", coreDirectory), "utf8"));
for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  for (const dependency of Object.keys(manifest[section] ?? {})) {
    if (
      dependency.includes("hodos")
      || dependency.includes("playcanvas")
      || dependency.includes("alumbra-game")
    ) {
      failures.push(`packages/core/package.json: forbidden ${section} entry ${dependency}`);
    }
  }
}

if (failures.length) {
  console.error("Alumbra package boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Alumbra Core boundary check passed.");
}
