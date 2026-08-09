# Propagate sunlight and emitted light

This complete Hara project presents Alumbra Engine's deterministic voxel-lighting
contract without copying dense field arrays into the Showcase state.

The story compares loaded-sky sunlight attenuation with the explicit `opaque` and
`open` missing-neighbour policies, then follows one level-15 lamp across the
negative-to-zero chunk boundary. Reversing the input chunk order produces the same
field bytes and ordered field identities.

Engine retains the hot `Uint8Array` fields. Public consumers receive point samples,
explicit copies and bounded evidence. No renderer, storage provider, worker,
browser service or Hodos component owns the dense arrays.
