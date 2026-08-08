import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateShowcase } from "./showcase-package.mjs";
import {
  PACKAGE_INDEX, PUBLIC_PACKAGE_ORDER, RENDERER_PACKAGE_SET, objectValue, parseFile,
} from "./showcase-values.mjs";

export async function loadShowcases(root = process.cwd()) {
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
      if (packageManifest.private || !RENDERER_PACKAGE_SET.has(packageManifest.name)) continue;
      await access(path.join(directory, "showcase.edn")).catch(() => {
        throw new Error(`${packageManifest.name}: every public Alumbra renderer-chain package requires showcase.edn`);
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

  for (const packageName of PUBLIC_PACKAGE_ORDER) {
    if (!showcases.some((showcase) => showcase.packageName === packageName)) {
      errors.push(`missing: renderer-chain package ${packageName} has no valid Showcase`);
    }
  }

  if (errors.length) {
    const error = new Error(errors.join("\n"));
    error.errors = errors;
    throw error;
  }
  return Object.freeze(showcases.sort((left, right) => {
    const leftOrder = PACKAGE_INDEX.get(left.packageName) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = PACKAGE_INDEX.get(right.packageName) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.packageName.localeCompare(right.packageName);
  }));
}
