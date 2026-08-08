# Alumbra Hara rules boundary

Alumbra Hara rules exchange bounded portable values with a trusted host. They do
not receive dense chunks, typed arrays or host objects.

## Formats

### `alumbra.block-pack/1`

A block pack pins package, version and pack identity, then declares blocks with
bounded state schemas, material metadata, physics, drops, emitted-light evidence
and optional Hara `on-use` entry references. The host combines selected packs and
uses Alumbra Core to create the canonical block registry.

### `alumbra.generator/1`

A generator descriptor contains the Core generator identity plus a Hara
module/function entry and bounded parameters. Package, version, ID and seed are
part of deterministic world identity.

### `alumbra.generated-chunk/1`

A generated chunk is a plan rather than a voxel array:

```text
base fill
  + non-overlapping half-open axis-aligned regions
  + unique sparse overrides
```

Regions may not overlap one another. Overrides have explicit precedence over a
region at the same voxel. Plans are shape- and coordinate-bound, validate every
block through the selected registry and have a bounded maximum write count.
The host sorts writes and materializes one canonical Core chunk.

### `alumbra.world-extension/1`

The extension is stored under `ai.greenways.alumbra/world`. It selects pinned
block packs, one generator, rule packages, mode and initial serializable rule
state. It contains entry identities but no executable JavaScript.

### `alumbra.interaction/1`

An interaction may return validated Core block transactions, typed capability
effects and actor-facing feedback. Empty results, duplicate transactions,
unsupported feedback and non-serializable values fail closed.

## Deterministic fixtures

The package includes matching JavaScript and HAL entry points for:

- flat terrain up to an integer world-space surface;
- an integer height field using
  `minimum + mod(world-x * 3 + world-z * 5 + seed, span)`.

The second runtime slice activates these HAL entries through an injected Hara
provider and compares canonical Core snapshot digests over positive and negative
chunk coordinates.

## Authority

```text
Hara package
  portable declarations, plans, interactions
        ↓
Alumbra Hara host adapter
  validation, bounds, package identity
        ↓
Alumbra Core
  canonical registry, chunk and transaction authority
```

Hodos may supply a runtime or visible component in a product composition, but
this package has no Hodos dependency.
