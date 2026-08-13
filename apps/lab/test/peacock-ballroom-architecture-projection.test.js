import assert from "node:assert/strict";
import test from "node:test";
import {createPeacockBallroomArchitecturalProjection} from "../src/peacock-ballroom-architecture.js";

function finiteVector(values, label) {
  for (const [index, value] of values.entries()) {
    assert.equal(Number.isFinite(value), true, `${label}[${index}] must be finite`);
  }
}

class FakeColor {
  constructor(...values) {
    finiteVector(values, "color");
    this.values = values;
  }
}

class FakeMaterial {
  update() { this.updated = true; }
  destroy() { this.destroyed = true; }
}

class FakeVec3 {
  constructor(x = 0, y = 0, z = 0) {
    finiteVector([x, y, z], "vector");
    this.x = x;
    this.y = y;
    this.z = z;
  }

  length() {
    return Math.hypot(this.x, this.y, this.z);
  }

  mulScalar(value) {
    assert.equal(Number.isFinite(value), true, "vector scalar must be finite");
    this.x *= value;
    this.y *= value;
    this.z *= value;
    return this;
  }
}

class FakeQuat {
  setFromDirections(from, to) {
    assert.ok(from instanceof FakeVec3);
    assert.ok(to instanceof FakeVec3);
    this.from = from;
    this.to = to;
    return this;
  }
}

class FakeEntity {
  constructor(name, app) {
    this.name = String(name);
    this.app = app;
    this.children = [];
    this.components = [];
    this.enabled = true;
  }

  addComponent(type, options) {
    this.components.push({type, options});
  }

  setLocalPosition(...values) {
    finiteVector(values, `${this.name} position`);
    this.position = values;
  }

  setLocalScale(...values) {
    finiteVector(values, `${this.name} scale`);
    this.scale = values;
  }

  setLocalEulerAngles(...values) {
    finiteVector(values, `${this.name} euler`);
    this.euler = values;
  }

  setLocalRotation(rotation) {
    assert.ok(rotation instanceof FakeQuat);
    this.rotation = rotation;
  }

  addChild(child) {
    this.children.push(child);
  }

  destroy() {
    this.destroyed = true;
    this.children.length = 0;
  }
}

const pc = Object.freeze({
  Entity: FakeEntity,
  StandardMaterial: FakeMaterial,
  Color: FakeColor,
  Vec3: FakeVec3,
  Quat: FakeQuat,
  BLEND_NORMAL: "normal",
});

function createApp() {
  const app = {renderNextFrame: false};
  app.root = new FakeEntity("Application root", app);
  return app;
}

for (const profile of ["desktop", "mobile"]) {
  test(`materializes finite ${profile} ornamental geometry with scalar arch centers`, () => {
    const app = createApp();
    const projection = createPeacockBallroomArchitecturalProjection({pc, app, profile});
    const evidence = projection.evidence();

    assert.equal(evidence.status, "ready");
    assert.equal(evidence.profile, profile);
    assert.equal(evidence.materials, 10);
    assert.equal(evidence.columns, 12);
    assert.equal(evidence.arches, 10);
    assert.equal(evidence.stairRamps, 2);
    assert.equal(evidence.domeRibs, 8);
    assert.equal(evidence.chandeliers, 3);
    assert.equal(evidence.planters, profile === "mobile" ? 2 : 4);
    assert.equal(evidence.windows, 12);
    assert.equal(evidence.lights, 3);
    assert.ok(evidence.entities > 100);

    const archNames = projection.root.children
      .map(({name}) => name)
      .filter((name) => name.startsWith("Ivory pointed arch"));
    assert.equal(archNames.length, 10 * (profile === "mobile" ? 8 : 12));
    assert.ok(archNames.includes("Ivory pointed arch -18/-16.5/-1/0"));
    assert.ok(archNames.includes("Ivory pointed arch 18/16.5/1/3"));
    assert.equal(archNames.some((name) => name.includes(",")), false);

    assert.equal(projection.suspend(), true);
    assert.equal(projection.evidence().suspended, true);
    assert.equal(projection.resume(), true);
    assert.equal(projection.evidence().suspended, false);
    const disposed = projection.destroy();
    assert.equal(disposed.status, "disposed");
    assert.equal(disposed.baseline, true);
    assert.equal(disposed.entities, 0);
  });
}
