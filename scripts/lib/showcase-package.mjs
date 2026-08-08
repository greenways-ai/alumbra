import path from "node:path";
import {
  DEMO_KEYS, STATE_KEYS, TOP_KEYS, VIEW_KEYS, VIEWPORT_KEYS,
  declaredWorkspaceSurfaces, knownKeys, objectValue, parseCatalogTags, parseFile,
  rejectExecutableValue, relativePath, requireEntry, text, token, unique, vectorValue,
} from "./showcase-values.mjs";

async function validateDemoProject(packageDirectory, demo) {
  const project = await requireEntry(
    packageDirectory,
    demo.project,
    "directory",
    `Showcase demo ${demo.id} project`,
  );
  const requiredFiles = ["README.md", "project.edn", "project.lock.edn", "workspace.edn", "src/main.hal"];
  const resolved = Object.create(null);
  for (const file of requiredFiles) {
    resolved[file] = await requireEntry(
      packageDirectory,
      path.posix.join(project.relative, file),
      "file",
      `Showcase demo ${demo.id} ${file}`,
    );
  }
  const descriptor = objectValue(
    await parseFile(resolved["project.edn"].target, `Showcase demo ${demo.id} project.edn`),
    `Showcase demo ${demo.id} project.edn`,
  );
  if (token(descriptor["hara/type"], `Showcase demo ${demo.id} project :hara/type`) !== "project") {
    throw new Error(`Showcase demo ${demo.id} project.edn must declare :hara/type :project`);
  }
  objectValue(
    await parseFile(resolved["project.lock.edn"].target, `Showcase demo ${demo.id} project.lock.edn`),
    `Showcase demo ${demo.id} project.lock.edn`,
  );
  const workspace = objectValue(
    await parseFile(resolved["workspace.edn"].target, `Showcase demo ${demo.id} workspace.edn`),
    `Showcase demo ${demo.id} workspace.edn`,
  );
  const surfaces = declaredWorkspaceSurfaces(workspace);
  if (!surfaces.has(demo.surface)) {
    throw new Error(
      `Showcase demo ${demo.id} selects undeclared surface ${demo.surface} in ${project.relative}/workspace.edn`,
    );
  }
}

function packageToolsetId(packageName) {
  const prefix = "@greenways/";
  if (!packageName.startsWith(prefix)) throw new Error(`Unsupported Showcase package name: ${packageName}`);
  return packageName.slice(prefix.length);
}

function activityId(toolsetId, demoId) {
  return `${toolsetId}/${demoId}`;
}

export async function validateShowcase(directory, packageManifest, project, manifest) {
  knownKeys(manifest, TOP_KEYS, `${packageManifest.name} Showcase`);
  if (token(manifest["hara/type"], "Showcase :hara/type") !== "showcase") {
    throw new Error(`${packageManifest.name}: showcase.edn must declare :hara/type :showcase`);
  }
  if (manifest["showcase/format"] !== 1) {
    throw new Error(`${packageManifest.name}: unsupported Showcase format`);
  }
  if (manifest["showcase/source"] !== undefined) {
    throw new Error(`${packageManifest.name}: source-local showcase.edn must not declare :showcase/source`);
  }
  if (token(manifest["showcase/package"], "Showcase package") !== token(project["project/id"], "Project id")) {
    throw new Error(`${packageManifest.name}: Showcase package must match project.edn`);
  }
  if (manifest["showcase/version"] !== project["project/version"] || packageManifest.version !== project["project/version"]) {
    throw new Error(`${packageManifest.name}: Showcase, project and npm package versions must match`);
  }

  const title = text(manifest["showcase/title"], `${packageManifest.name} Showcase title`);
  const summary = text(manifest["showcase/summary"], `${packageManifest.name} Showcase summary`);
  const views = vectorValue(manifest["showcase/views"], `${packageManifest.name} Showcase views`);
  const states = vectorValue(manifest["showcase/states"], `${packageManifest.name} Showcase states`);
  const demos = vectorValue(manifest["showcase/demos"], `${packageManifest.name} Showcase demos`);
  if (!views.length) throw new Error(`${packageManifest.name}: Showcase requires at least one view`);
  if (!states.length) throw new Error(`${packageManifest.name}: Alumbra Showcase requires at least one named state`);
  if (!demos.length) throw new Error(`${packageManifest.name}: Showcase requires at least one demo`);

  const normalizedViews = [];
  for (const [index, value] of views.entries()) {
    const view = objectValue(value, `Showcase view ${index}`);
    knownKeys(view, VIEW_KEYS, `Showcase view ${index}`);
    const normalized = {
      id: token(view["view/id"], `Showcase view ${index} id`),
      title: text(view["view/title"], `Showcase view ${index} title`),
      summary: text(view["view/summary"], `Showcase view ${index} summary`),
      source: null,
      docs: null,
    };
    if (view["view/source"]) {
      normalized.source = (await requireEntry(
        directory,
        view["view/source"],
        "file",
        `Showcase view ${normalized.id} source`,
      )).relative;
    }
    if (view["view/docs"]) {
      normalized.docs = (await requireEntry(
        directory,
        view["view/docs"],
        "file",
        `Showcase view ${normalized.id} docs`,
      )).relative;
    }
    normalizedViews.push(normalized);
  }

  const normalizedStates = [];
  for (const [index, value] of states.entries()) {
    const stateValue = objectValue(value, `Showcase state ${index}`);
    knownKeys(stateValue, STATE_KEYS, `Showcase state ${index}`);
    const normalized = {
      id: token(stateValue["state/id"], `Showcase state ${index} id`),
      title: text(stateValue["state/title"], `Showcase state ${index} title`),
      summary: text(stateValue["state/summary"], `Showcase state ${index} summary`),
      file: null,
    };
    if (stateValue["state/file"]) {
      if (!String(stateValue["state/file"]).endsWith(".edn")) {
        throw new Error(`Showcase state ${normalized.id} file must use .edn`);
      }
      const file = await requireEntry(
        directory,
        stateValue["state/file"],
        "file",
        `Showcase state ${normalized.id} file`,
      );
      const fixture = await parseFile(file.target, `Showcase state ${normalized.id}`);
      rejectExecutableValue(fixture, `Showcase state ${normalized.id}`);
      normalized.file = file.relative;
    }
    if (Object.hasOwn(stateValue, "state/value")) {
      rejectExecutableValue(stateValue["state/value"], `Showcase state ${normalized.id}`);
    }
    if (!normalized.file && !Object.hasOwn(stateValue, "state/value")) {
      throw new Error(`Showcase state ${normalized.id} requires :state/file or :state/value`);
    }
    normalizedStates.push(normalized);
  }

  const viewIds = unique(normalizedViews.map((view) => view.id), "view");
  const stateIds = unique(normalizedStates.map((state) => state.id), "state");
  const normalizedDemos = [];
  let defaults = 0;
  for (const [index, value] of demos.entries()) {
    const demoValue = objectValue(value, `Showcase demo ${index}`);
    knownKeys(demoValue, DEMO_KEYS, `Showcase demo ${index}`);
    const viewportValue = demoValue["demo/viewport"];
    let viewport = null;
    if (viewportValue) {
      const map = objectValue(viewportValue, `Showcase demo ${index} viewport`);
      knownKeys(map, VIEWPORT_KEYS, `Showcase demo ${index} viewport`);
      const width = Number(map["viewport/width"]);
      const height = Number(map["viewport/height"]);
      if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        throw new Error(`Showcase demo ${index} viewport dimensions must be positive integers`);
      }
      viewport = Object.freeze({ width, height });
    }
    const id = token(demoValue["demo/id"], `Showcase demo ${index} id`);
    const catalogTags = parseCatalogTags(demoValue["demo/tags"], `Showcase demo ${id}`);
    const demo = {
      id,
      title: text(demoValue["demo/title"], `Showcase demo ${id} title`),
      summary: text(demoValue["demo/summary"], `Showcase demo ${id} summary`),
      view: token(demoValue["demo/view"], `Showcase demo ${id} view`),
      state: demoValue["demo/state"] ? token(demoValue["demo/state"], `Showcase demo ${id} state`) : null,
      project: relativePath(demoValue["demo/project"], `Showcase demo ${id} project`),
      surface: token(demoValue["demo/surface"], `Showcase demo ${id} surface`),
      docs: null,
      theme: demoValue["demo/theme"] ? token(demoValue["demo/theme"], `Showcase demo ${id} theme`) : null,
      viewport,
      default: demoValue["demo/default"] === true,
      ...catalogTags,
    };
    if (!viewIds.has(demo.view)) throw new Error(`Showcase demo ${demo.id} references missing view ${demo.view}`);
    if (demo.state && !stateIds.has(demo.state)) {
      throw new Error(`Showcase demo ${demo.id} references missing state ${demo.state}`);
    }
    if (demoValue["demo/docs"]) {
      demo.docs = (await requireEntry(
        directory,
        demoValue["demo/docs"],
        "file",
        `Showcase demo ${demo.id} docs`,
      )).relative;
    }
    if (demo.default) defaults += 1;
    await validateDemoProject(directory, demo);
    normalizedDemos.push(demo);
  }
  unique(normalizedDemos.map((demo) => demo.id), "demo");
  if (defaults > 1) throw new Error(`${packageManifest.name}: Showcase may declare only one default demo`);

  const publishedFiles = new Set(packageManifest.files || []);
  for (const required of ["showcase.edn", "showcase"]) {
    if (!publishedFiles.has(required)) {
      throw new Error(`${packageManifest.name}: package.json files must include ${required}`);
    }
  }

  const toolsetId = packageToolsetId(packageManifest.name);
  return Object.freeze({
    directory,
    directoryName: path.basename(directory),
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    packageId: token(project["project/id"], "Project id"),
    toolsetId,
    title,
    summary,
    views: Object.freeze(normalizedViews),
    states: Object.freeze(normalizedStates),
    demos: Object.freeze(normalizedDemos.map((demo) => Object.freeze({
      ...demo,
      activityId: activityId(toolsetId, demo.id),
    }))),
  });
}
