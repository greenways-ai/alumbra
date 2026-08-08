# Alumbra block transactions

Format: `alumbra.block-transaction/1`

A block transaction is a bounded semantic operation over one or more existing
chunks.

```json
{
  "format": "alumbra.block-transaction/1",
  "id": "transaction/place-stone",
  "expectedRevisions": [
    {"chunk": [0, 0, 0], "revision": 4}
  ],
  "changes": [
    {
      "chunk": [0, 0, 0],
      "local": [1, 2, 3],
      "before": {"id": "alumbra/air", "state": {}},
      "after": {"id": "alumbra/stone", "state": {}}
    }
  ],
  "metadata": {}
}
```

## Rules

- transaction identity is supplied by the authority; Core never invents random
  or time-derived identity;
- target coordinates are unique within one transaction;
- every change declares its expected prior block value;
- optional expected chunk revisions detect stale bases before application;
- all changes are validated before any chunk is replaced;
- each affected chunk revision increments exactly once;
- conflicts fail without partial application;
- inversion swaps before/after values and reverses change order;
- metadata is canonical and limited to 16 KiB.

Transactions do not contain renderer objects, mesh data, browser handles,
private keys or transport policy.
