import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateShowcase } from "./showcase-package.mjs";
import {
  PUBLIC_PACKAGE_ORDER,
  RENDERER_PACKAGE_ORDER,
  SHOWCASE_PACKAGE_SET,
  RENDERER_PACKAGE_SET,
  objectValue,
  parseFile,
} from "./showcase-values.mjs";

async function loadSelectedShowcases(root, {
  packageOrder,
  packageSet,
  familyLabel,
}) {
  const packagesRoot = path.join(root, "packages");
  const errors = [];
  const showcases = [];
  const entries = (await readdir(packagesRoot, { withFileTypes: true }))
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const directory = path.join(packagesRoot, entry.name);
    try {
      const packageManifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      if (packageManifest.private || !packageSet.has(packageManifest.name)) continue;
      await access(path.join(directory, "showcase.edn")).catch(() => {
        throw new Error(`${packageManifest.name}: every ${familyLabel} requires showcase.edn`);
      });
      const project = objectValue(
        await parseFile(path.join(directory, "project.edn"), `${packageManifest.name} project.edn`),
        `${packageManifest.name} project.edn`,
      );
      const manifest = objectValue(
        await parseFile(path.join(directory, "showcase.edn"), `${packageManifest.name} showcase.edn`),
        `${packageManifest.name} showcase.edn`,
      );
      showcases.push(await validateShowcase(directory, packageManifest, project, manifest));
    } catch (error) {
      errors.push(`${entry.name}: ${error.message}`);
    }
  }

  for (const packageName of packageOrder) {
    if (!showcases.some((showcase) => showcase.packageName === packageName)) {
      errors.push(`missing: ${familyLabel} ${packageName} has no valid Showcase`);
    }
  }

  if (errors.length) {
    const error = new Error(errors.join("\n"));
    error.errors = errors;
    throw error;
  }
  const packageIndex = new Map(packageOrder.map((name, index) => [name, index]));
  return Object.freeze(showcases.sort((left, right) => {
    const leftOrder = packageIndex.get(left.packageName) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = packageIndex.get(right.packageName) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.packageName.localeCompare(right.packageName);
  }));
}

export function loadShowcases(root = process.cwd()) {
  return loadSelectedShowcases(root, {
    packageOrder: PUBLIC_PACKAGE_ORDER,
    packageSet: SHOWCASE_PACKAGE_SET,
    familyLabel: "public Alumbra package",
  });
}

export function loadRendererShowcases(root = process.cwd()) {
  return loadSelectedShowcases(root, {
    packageOrder: RENDERER_PACKAGE_ORDER,
    packageSet: RENDERER_PACKAGE_SET,
    familyLabel: "public Alumbra renderer-chain package",
  });
}
