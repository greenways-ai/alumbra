# Dynamic chunk residency

This complete Showcase project runs the first AR-03 residency transition. A deterministic player viewpoint moves from one chunk centre to the next, schedules missing canonical chunks, installs current worker meshes and evicts resources that leave the bounded window.

After the initial checked transition, the live Catalog story accepts **WASD** or the **arrow keys** to move the viewpoint one chunk at a time. Every move recomputes the desired window and waits for bounded generation and mesh queues before presenting the new resident state.

The visible state contains counters and viewpoint identity only. Canonical chunk arrays, mesh buffers, worker handles, PlayCanvas entities and installed project paths remain inside the application boundary.
