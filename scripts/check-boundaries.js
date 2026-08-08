import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const failures = [];

const packageRules = [
  {
    label: "Core",
    directory: "packages/core",
    forbiddenSpecifiers: [
      "@greenways/hodos",
      "playcanvas",
      "@greenways/alumbra-renderer",
      "@greenways/alumbra-game",
      "@greenways/alumbra-hodos",
    ],
    forbiddenGlobals: [
      /\bglobalThis\.document\b/,
      /\bglobalThis\.window\b/,
      /\bwindow\./,
      /\bdocument\./,
    ],
    allowedDependencies: new Set(),
    allowedPeers: new Set(),
    optionalPeers: new Set(),
  },
  {
    label: "PlayCanvas renderer",
    directory: "packages/renderer-playcanvas",
    forbiddenSpecifiers: [
      "@greenways/hodos",
      "@greenways/alumbra-game",
      "@greenways/alumbra-hodos",
    ],
    forbiddenGlobals: [],
    allowedDependencies: new Set(["@greenways/alumbra-core"]),
    allowedPeers: new Set(["playcanvas"]),
    optionalPeers: new Set(["playcanvas"]),
  },
  {
    label: "Hodos adapter",
    directory: "packages/hodos",
    forbiddenSpecifiers: [
      "@greenways/hodos",
      "playcanvas",
      "@greenways/alumbra-renderer",
      "@greenways/alumbra-game",
    ],
    forbiddenGlobals: [
      /\bglobalThis\.document\b/,
      /\bglobalThis\.window\b/,
      /\bwindow\./,
      /\bdocument\./,
    ],
    allowedDependencies: new Set(),
    allowedPeers: new Set(["@greenways/hodos-web", "@greenways/hodos-workspace-ui"]),
    optionalPeers: new Set(["@greenways/hodos-web", "@greenways/hodos-workspace-ui"]),
  },
];

function walk(directory, inspect) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, inspect);
    else if (entry.isFile() && /\.(js|hal)$/.test(entry.name)) inspect(file);
  }
}

function inspectPackage(rule) {
  const packageRoot = path.join(root, rule.directory);
  const sourceRoot = path.join(packageRoot, "src");
  walk(sourceRoot, (file) => {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    const imports = source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g);
    for (const match of imports) {
      const specifier = match[1];
      for (const forbidden of rule.forbiddenSpecifiers) {
        if (specifier.includes(forbidden)) failures.push(`${relative}: forbidden import ${specifier}`);
      }
    }
    if (file.endsWith(".js")) {
      for (const pattern of rule.forbiddenGlobals) {
        if (pattern.test(source)) failures.push(`${relative}: forbidden browser global ${pattern}`);
      }
    }
  });

  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (!rule.allowedDependencies.has(dependency)) {
      failures.push(`${rule.directory}/package.json: unexpected dependency ${dependency}`);
    }
  }
  for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
    if (!rule.allowedPeers.has(dependency)) {
      failures.push(`${rule.directory}/package.json: unexpected peer dependency ${dependency}`);
    }
  }
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    failures.push(`${rule.directory}/package.json: unexpected optional dependency ${dependency}`);
  }
  for (const dependency of rule.optionalPeers) {
    if (manifest.peerDependencies?.[dependency] && manifest.peerDependenciesMeta?.[dependency]?.optional !== true) {
      failures.push(`${rule.directory}/package.json: peer ${dependency} must remain optional`);
    }
  }
}

for (const rule of packageRules) inspectPackage(rule);

const labRoot = path.join(root, "apps/lab");
walk(path.join(labRoot, "src"), (file) => {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes("@greenways/hodos")) {
    failures.push(`${path.relative(root, file)}: lab must not import Hodos`);
  }
});

if (failures.length) {
  console.error("Alumbra package boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Alumbra package boundary checks passed.");
}
