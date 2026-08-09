import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
manifest.scripts.test = manifest.scripts.test.replace(
  "packages/history/test/*.test.js",
  "packages/history/test/*.test.js packages/history-store/test/*.test.js",
);
manifest.scripts["pack:check"] = manifest.scripts["pack:check"].replace(
  "npm pack --dry-run -w @greenways/alumbra-history &&",
  "npm pack --dry-run -w @greenways/alumbra-history && npm pack --dry-run -w @greenways/alumbra-history-store &&",
);
fs.writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);

const project = fs.readFileSync("project.edn", "utf8").replace(
  "\"hara:greenways/alumbra-history\" {:version \"^0.1.0\"}\n  \"hara:greenways/alumbra-engine\"",
  "\"hara:greenways/alumbra-history\" {:version \"^0.1.0\"}\n  \"hara:greenways/alumbra-history-store\" {:version \"^0.1.0\"}\n  \"hara:greenways/alumbra-engine\"",
);
fs.writeFileSync("project.edn", project);

const distribution = fs.readFileSync("src/gw/alumbra/core.hal", "utf8").replace(
  "\"greenways/alumbra-history\"\n   \"greenways/alumbra-engine\"",
  "\"greenways/alumbra-history\"\n   \"greenways/alumbra-history-store\"\n   \"greenways/alumbra-engine\"",
);
fs.writeFileSync("src/gw/alumbra/core.hal", distribution);

const specs = fs.readFileSync("spec/README.md", "utf8").replace(
  "- [World history](history.md) — region manifests, checkpoint roots, ordered\n  transaction replay and semantic-head verification;\n- [Local world save]",
  "- [World history](history.md) — region manifests, checkpoint roots, ordered\n  transaction replay and semantic-head verification;\n- [History store](history-store.md) — content-addressed snapshot archives and\n  write-last manifest publication;\n- [Local world save]",
);
fs.writeFileSync("spec/README.md", specs);

let boundaries = fs.readFileSync("scripts/check-boundaries.js", "utf8").replaceAll(
  "      \"@greenways/alumbra-history\",\n",
  "      \"@greenways/alumbra-history\",\n      \"@greenways/alumbra-history-store\",\n",
);
const rule = `  {
    label: "History store",
    directory: "packages/history-store",
    forbiddenSpecifiers: [
      "@greenways/hodos",
      "playcanvas",
      "@greenways/alumbra-engine",
      "@greenways/alumbra-renderer",
      "@greenways/alumbra-viewport",
      "@greenways/alumbra-game",
      "@greenways/alumbra-hodos",
      "@greenways/alumbra-hara",
      "@greenways/hestia",
      "@greenways/ignatius",
      "@greenways/tahto",
      "opfs",
      ...serverAndNetworkImports,
    ],
    forbiddenGlobals: [
      ...browserGlobals,
      ...storageGlobals,
    ],
    allowedDependencies: new Set([
      "@greenways/alumbra-core",
      "@greenways/alumbra-history",
    ]),
    allowedPeers: new Set(),
    optionalPeers: new Set(),
  },
`;
boundaries = boundaries.replace("  {\n    label: \"Engine\",", `${rule}  {\n    label: "Engine",`);
fs.writeFileSync("scripts/check-boundaries.js", boundaries);
