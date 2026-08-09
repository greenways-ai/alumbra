# Fence stale lighting jobs

This complete Hara project presents the generation, revision and epoch fences around
Alumbra Engine's hot lighting runtime.

Changing chunk `[0 0 0]` invalidates only the bounded propagation neighbourhood,
while the unrelated field for `[2 0 0]` remains readable. A result planned against
an older source revision is rejected. The current revision installs, and attempts
to reuse the older result then fail as stale generation. Manual invalidation also
advances the epoch and rejects an otherwise revision-current job.

The story selects no worker implementation, persistence provider, renderer or
service authority.
