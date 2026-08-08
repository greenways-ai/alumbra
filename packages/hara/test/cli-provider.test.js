import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHaraInvocationSource,
  createHaraCliProvider,
  parseHaraEdnOutput,
  sha256Evidence,
} from "../../../scripts/hara-cli-provider.js";

test("the CLI provider emits a closed restricted-EDN invocation program", () => {
  const source = buildHaraInvocationSource({
    entry:{module:"gw.alumbra.fixture", function:"echo-value"},
    arguments:[{"quoted":"a\"b", "opacity":0.42}, [-1, 0, 2]],
  });
  assert.match(source, /\[std\.foundation\.edn :as edn\]/);
  assert.match(source, /\[std\.json :as json\]/);
  assert.match(source, /\[gw\.alumbra\.fixture :as target\]/);
  assert.match(source, /apply target\/echo-value/);
  assert.match(source, /edn\/read/);
  assert.match(source, /edn\/write/);
  assert.match(source, /0\.42/);
  assert.doesNotMatch(source, /allow-(?:net|process|file)|System|ProcessBuilder/);
});

test("the CLI provider rejects code-shaped entry points and non-data arguments", () => {
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
  assert.throws(
    () => buildHaraInvocationSource({
      entry:{module:"gw.alumbra.fixture", function:"echo-value"},
      arguments:[() => true],
    }),
    (error) => error.code === "hara/invocation-arguments",
  );
});

test("the CLI provider decodes the final printed Hara EDN string with decimals", () => {
  const edn = "{\"coordinate\" [-2 0 3] \"ok\" true \"opacity\" 0.42}";
  const stdout = `runtime diagnostic\n${JSON.stringify(JSON.stringify(edn))}\n`;
  assert.deepEqual(parseHaraEdnOutput(stdout), {
    coordinate:[-2, 0, 3],
    ok:true,
    opacity:0.42,
  });
  assert.throws(
    () => parseHaraEdnOutput(`${JSON.stringify(JSON.stringify(":keyword"))}\n`),
    (error) => error.code === "hara/runtime-output",
  );
  assert.throws(
    () => parseHaraEdnOutput("diagnostic only\n"),
    (error) => error.code === "hara/runtime-output",
  );
});

test("activation evidence uses lowercase SHA-256 coordinates", () => {
  assert.equal(
    sha256Evidence(Buffer.from("alumbra", "utf8")),
    "sha256:3b8b1462922e4f2ca072c52c909d1de66b688ec6e1f8574f3e77ba6553ea274a",
  );
  assert.throws(
    () => createHaraCliProvider(),
    (error) => error.code === "hara/provider-project",
  );
});
