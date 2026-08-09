# Packaged height field

This complete Showcase project demonstrates the AR-02 world pipeline:

```text
exact project.lock.edn
        ↓
Hara block pack
        ↓
Hara generator plan
        ↓
Core chunk materialization
        ↓
PlayCanvas viewport
```

The default state renders the seed-17 chunk at `[0 0 0]`. The negative-coordinate
state uses the same exact package and generator at `[-2 0 3]` and carries its
immutable Core snapshot digest. The package-mismatch state is descriptive data:
it requests `0.2.0`, records the `0.1.0` lock, and expects the stable
`hara/package-version-mismatch` rejection without executing an adversarial
fixture.

The visible Catalog receives package, generator, digest, parity and disposal
statuses only. It never receives Hara source strings, chunks, runtime sessions,
PlayCanvas objects or installed project paths.
