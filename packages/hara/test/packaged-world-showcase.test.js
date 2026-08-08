import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {parseEdn} from "../../../scripts/lib/edn.mjs";

const packageRoot = new URL("../", import.meta.url);
const readEdn = async (relative) => parseEdn(await readFile(new URL(relative, packageRoot), "utf8"));

const EXPECTED_PACKAGES = [
  "hara:greenways/alumbra-core",
  "hara:greenways/alumbra-engine",
  "hara:greenways/alumbra-hara",
  "hara:greenways/alumbra-renderer-playcanvas",
  "hara:greenways/alumbra-viewport-playcanvas",
];

test("packaged Hara Showcase pins the complete world-to-viewport dependency chain", async () => {
  const [project, lock, workspace] = await Promise.all([
    readEdn("showcase/packaged-height-field/project.edn"),
    readEdn("showcase/packaged-height-field/project.lock.edn"),
    readEdn("showcase/packaged-height-field/workspace.edn"),
  ]);
  assert.deepEqual(Object.keys(project["project/dependencies"]).sort(), EXPECTED_PACKAGES);
  assert.deepEqual(Object.keys(lock.packages).sort(), EXPECTED_PACKAGES);
  assert.ok(Object.values(lock.packages).every((entry) => entry.version === "0.1.0"));
  assert.equal(workspace["workspace/areas"][0]["area/type"], "alumbra.world/viewport");
  assert.equal(
    workspace["workspace/areas"][0]["area/presentation"]["presentation/surface"],
    "viewport",
  );
});

test("Showcase publishes all three bounded named states", async () => {
  const showcase = await readEdn("showcase.edn");
  const stateIds = showcase["showcase/states"].map((state) => state["state/id"]);
  assert.deepEqual(stateIds, [
    "world/default-seed",
    "world/negative-coordinate",
    "world/package-mismatch",
  ]);
  const demo = showcase["showcase/demos"][0];
  assert.equal(demo["demo/state"], "world/default-seed");
  assert.equal(demo["demo/surface"], "viewport");
  assert.ok(demo["demo/tags"].includes("playable-lab"));
  assert.ok(demo["demo/tags"].includes("checks:9"));
});

test("mismatch state remains descriptive data with no executable fixture fields", async () => {
  const mismatch = await readEdn("showcase/states/package-mismatch.edn");
  assert.equal(mismatch["world/state"], "world/package-mismatch");
  assert.equal(mismatch["package/requested-version"], "0.2.0");
  assert.equal(mismatch["package/pinned-version"], "0.1.0");
  assert.equal(mismatch["error/code"], "hara/package-version-mismatch");
  const text = JSON.stringify(mismatch);
  assert.doesNotMatch(text, /callback|javascript|shader|runtime-handle|project-path|filesystem-path/i);
});
