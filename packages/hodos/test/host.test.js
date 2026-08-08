import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_VIEWPORT_COMPONENT_ID,
  createAlumbraViewportArea,
  createAlumbraViewportComponentFactory,
  registerAlumbraHodos,
} from "../src/index.js";

const model = (revision = 0) => ({
  "world/id": "world:alumbra/lab",
  "session/id": "session:lab",
  "world/revision": revision,
  "engine/handle": "handle:alumbra/lab",
  camera: { position: [0, 10, 20], rotation: [-15, 0, 0] },
  status: "active",
  capabilities: { move: true, look: true, jump: true },
});

class ContractRegistry {
  factories = new Map();
  register(id, factory) {
    if (this.factories.has(id)) throw new Error(`duplicate ${id}`);
    this.factories.set(id, factory);
    return () => { if (this.factories.get(id) === factory) this.factories.delete(id); };
  }
  require(id) {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`missing ${id}`);
    return factory;
  }
}

function mountLikeHodos({ registry, area, services = {}, dispatch = () => {} }) {
  const descriptor = area["area/component"];
  const allowed = new Set(descriptor["component/events"]);
  const send = async (event) => {
    const type = event?.["event/type"];
    if (!type) throw new TypeError("event/type required");
    if (allowed.size && !allowed.has(type)) throw new Error(`undeclared event ${type}`);
    return dispatch({ ...event, "component/id": descriptor["component/id"], "area/id": area["area/id"] });
  };
  const controller = registry.require(descriptor["component/id"])({
    root: { dataset: {} },
    model: descriptor["component/model"],
    descriptor,
    services,
    dispatch: send,
    context: { area },
  });
  return {
    update(nextArea) {
      controller.update(nextArea["area/component"]["component/model"], nextArea["area/component"], { area: nextArea });
    },
    destroy() { controller.destroy(); },
  };
}

test("adapter registers one trusted viewport and preserves the host across updates", async () => {
  const registry = new ContractRegistry();
  const calls = [];
  let send;
  let creates = 0;
  let destroys = 0;
  const unregister = registerAlumbraHodos(registry, {
    createViewportHost({ container, dispatch, context }) {
      creates += 1;
      send = dispatch;
      calls.push(["create", container, context.area["area/id"]]);
      return {
        update(value) { calls.push(["update", value["world/revision"]]); },
        destroy() { destroys += 1; },
      };
    },
  });
  assert.deepEqual([...registry.factories.keys()], [ALUMBRA_VIEWPORT_COMPONENT_ID]);

  const events = [];
  const initial = createAlumbraViewportArea({ model: model(1), events: ["alumbra/look"] });
  const host = mountLikeHodos({ registry, area: initial, dispatch: (event) => events.push(event) });
  host.update(createAlumbraViewportArea({ model: model(2), events: ["alumbra/look"] }));
  await send({ "event/type": "alumbra/look", delta: [2, -1] });
  await assert.rejects(send({ "event/type": "alumbra/break" }), /undeclared/);
  host.destroy();
  host.destroy();

  assert.equal(creates, 1);
  assert.equal(destroys, 1);
  assert.deepEqual(calls.filter(([type]) => type === "update").map(([, revision]) => revision), [1, 2]);
  assert.deepEqual(events, [{
    "event/type": "alumbra/look",
    delta: [2, -1],
    "component/id": ALUMBRA_VIEWPORT_COMPONENT_ID,
    "area/id": "area/alumbra-world",
  }]);
  unregister();
  assert.equal(registry.factories.size, 0);
});

test("factory accepts injected services and falls back to dispose", () => {
  let updates = 0;
  let disposes = 0;
  const controller = createAlumbraViewportComponentFactory()({
    root: {},
    model: model(),
    dispatch: () => {},
    context: {},
    services: {
      alumbraViewport: {
        createHost() {
          return {
            update() { updates += 1; },
            dispose() { disposes += 1; },
          };
        },
      },
    },
  });
  controller.update(model(3));
  controller.destroy();
  controller.destroy();
  assert.equal(updates, 2);
  assert.equal(disposes, 1);
});

test("factory fails closed for missing or malformed injected hosts", () => {
  const factory = createAlumbraViewportComponentFactory();
  assert.throws(() => factory({ root: {}, model: model(), services: {}, dispatch: () => {} }), /createViewportHost/);
  assert.throws(() => createAlumbraViewportComponentFactory({
    createViewportHost: () => null,
  })({ root: {}, model: model(), services: {}, dispatch: () => {} }), /host object/);
  assert.throws(() => createAlumbraViewportComponentFactory({
    createViewportHost: () => ({}),
  })({ root: {}, model: model(), services: {}, dispatch: () => {} }), /implement update/);
});
