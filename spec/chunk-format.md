# Alumbra chunk snapshot format

Format: `alumbra.chunk-snapshot/1`

The snapshot is a canonical binary representation of one fixed-shape voxel
chunk. Identical coordinate, shape, revision and voxel values produce identical
bytes regardless of the chunk's internal palette insertion order.

## Coordinate and index order

Coordinates are integer triples `[x y z]`.

Local voxels use X-major linear order:

```text
index = x + sizeX × (y + sizeY × z)
```

World-to-chunk conversion uses mathematical floor division, so local coordinates
remain non-negative for negative world coordinates.

## Header

All multi-byte integers are little-endian.

```text
4 bytes   magic "ALCH"
u8        version = 1
u8        palette index width: 1, 2 or 4
u16       flags = 0
u16 × 3   chunk shape
i32 × 3   chunk coordinate
u32       revision
u32       palette count
u32       voxel count
```

## Palette

Only palette entries referenced by voxels are encoded. Each block value is
canonical JSON:

```json
{"id":"alumbra/stone","state":{}}
```

Entries are unique and sorted by their canonical UTF-8 text. Each entry is
encoded as `u32 byteLength` followed by the UTF-8 bytes.

## Voxels

Each voxel is the canonical palette index using the smallest width able to
address the palette:

```text
1 byte  palette ≤ 256
2 bytes palette ≤ 65536
4 bytes otherwise
```

Decoders reject non-minimal widths, malformed UTF-8/JSON, unsorted palettes,
out-of-range indices, unsupported flags, mismatched volume and trailing bytes.

## Digest

The content identity is:

```text
sha256:<lowercase hexadecimal SHA-256 of the complete snapshot bytes>
```

Generator package/version and block-registry identity belong in the surrounding
world or region manifest. They are not ambient inputs.
