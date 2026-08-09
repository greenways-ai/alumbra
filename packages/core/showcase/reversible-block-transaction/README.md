# Apply and undo a block transaction

This complete Showcase project follows one canonical Alumbra Core change across
its durable boundaries:

1. the transaction names the exact chunk revision it expects;
2. the change records both the current and replacement block values;
3. application advances the chunk revision and returns bounded evidence; and
4. undo is represented by a separately identified inverse transaction.

Nothing in the value depends on a renderer, mutable scene object or hidden undo
stack. A consumer can inspect the same transaction and inverse before deciding
whether it has authority to apply either one.
