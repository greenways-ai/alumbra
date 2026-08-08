# Two independent sessions

This story creates two viewport session values with different world identities.
The sessions can advance, suspend and dispose independently. Their visible
placement is shared by the host layout only; canonical world state, player
state, renderer resources and lifecycle counters are not shared.
