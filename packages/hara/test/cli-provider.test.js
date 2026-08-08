import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHaraInvocationSource,
  createHaraCliProvider,
  parseHaraJsonOutput,
  sha256Evidence,
} from "../../../scripts/hara-cli-provider.js";

test("the CLI provider emits a closed JSON invocation program", () => {
  const source = buildHaraInvocationSource({
    entry:{module:"gw.alumbra.fixture", function:"echo-value"},
    arguments:[{"quoted":"a\"b"}, [-1, 0, 2]],
  });
  assert.match(source, /\[std\.json :as json\]/);
  assert.match(source, /\[gw\.alumbra\.fixture :as target\]/);
  assert.match(source, /apply target\/echo-value/);
  assert.match(source, /json\/read/);
  assert.doesNotMatch(source, /allow-(?:net|process|file)|System|ProcessBuilder/);
});

test("the CLI provider rejects code-shaped entry points", () => {
  assert.throws(
    () => buildHaraInvocationSource({
      entry:{module:"gw.alumbra.fixture) (do", function:"echo-value"},
      arguments:[],
    }),
    (error) => error.code === "hara/invocation-entry",
  );
  assert.throws(
    () => buildHaraInvocationSource({
      entry:{module:"gw.alumbra.fixture", function:"echo/value"},
      arguments:[],
    }),
    (error) => error.code === "hara/invocation-entry",
  );
});

test("the CLI provider decodes the final printed Hara JSON string", () => {
  const value = {ok:true, coordinate:[-2, 0, 3]};
  const stdout = `runtime diagnostic\n${JSON.stringify(JSON.stringify(value))}\n`;
  assert.deepEqual(parseHaraJsonOutput(stdout), value);
  assert.throws(
    () => parseHaraJsonOutput("diagnostic only\n"),
    (error) => error.code === "hara/runtime-output",
  );
});

test("activation evidence uses lowercase SHA-256 coordinates", () => {
  assert.equal(
    sha256Evidence(Buffer.from("alumbra", "utf8")),
    "sha256:18d40abea83379f8c0a192b70f9f6565996c1a2acfc7057d20bca52ba6733178",
  );
  assert.throws(
    () => createHaraCliProvider(),
    (error) => error.code === "hara/provider-project",
  );
});
