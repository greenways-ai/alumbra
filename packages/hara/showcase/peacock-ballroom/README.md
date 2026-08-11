# Peacock Ballroom

This complete Hara Showcase project describes the installed Peacock Ballroom world provider without carrying browser, renderer or network authority in the document.

The provider launches the semantic activity `alumbra-hara/peacock-ballroom` from the exact package `hara:greenways/alumbra-peacock-ballroom@0.1.0` and exposes three bounded named states:

- `ballroom/day`
- `ballroom/gallery-overlook`
- `ballroom/mosaic-floor`

The live host remains in Alumbra. Catalog, Hodos and Playground select the provider and state; they do not duplicate its chunks, renderer, lighting runtime or edit path.
