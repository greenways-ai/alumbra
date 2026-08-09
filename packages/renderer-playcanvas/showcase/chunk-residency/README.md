# Dynamic chunk residency

This complete Showcase project describes the first AR-03 residency transition. A deterministic camera window moves from one chunk centre to the next, schedules missing canonical chunks, installs current meshes and evicts resources that leave the bounded window.

The visible state contains counters only. Canonical chunk arrays, mesh buffers, worker handles, PlayCanvas entities and installed project paths remain inside the application boundary.
