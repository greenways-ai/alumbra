# Playable packaged world

This story composes one canonical Alumbra world with the public
`@greenways/alumbra-viewport-playcanvas` session boundary.

The viewport owns PlayCanvas entities, input sampling, picking, frame evidence
and disposal. The world and player remain canonical host values. Suspending the
surface stops viewport updates and rendering; resuming reuses the same world,
player and renderer session rather than rebuilding them.
