# @greenways/alumbra-core

Headless, runtime-neutral voxel values for Alumbra.

The package owns block registries, chunk coordinates, palette-backed chunk
storage, deterministic snapshot encoding, generator identity and reversible
block transactions. It imports no DOM, Hodos, PlayCanvas, storage or game
package.

## Example

```js
import {
  applyBlockTransaction,
  createBlockRegistry,
  createBlockTransaction,
  createChunk,
  digestChunkSnapshot,
  getBlock,
} from "@greenways/alumbra-core";

const registry = createBlockRegistry([
  { id: "alumbra/air", empty: true },
  { id: "alumbra/stone" },
]);

const chunk = createChunk({
  registry,
  coord: [0, 0, 0],
  shape: [32, 32, 32],
});

const transaction = createBlockTransaction({
  id: "transaction/place-stone",
  expectedRevisions: [{ chunk: [0, 0, 0], revision: 0 }],
  changes: [{
    chunk: [0, 0, 0],
    local: [1, 2, 3],
    before: "alumbra/air",
    after: "alumbra/stone",
  }],
}, registry);

const result = applyBlockTransaction([chunk], transaction, registry);
console.log(getBlock(result.chunks.get("0,0,0"), [1, 2, 3]));
console.log(await digestChunkSnapshot(result.chunks.get("0,0,0")));
```

Snapshots are canonical: identical chunk coordinates, shape, revision and voxel
values produce identical bytes regardless of internal palette insertion order.
