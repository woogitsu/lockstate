# First Cell after furnished delivery templates

The full room-plan integration had not yet incorporated PR1751 / issue1750. Its old real-runtime regression had been removed as unreachable on the earlier command slice; on the full-plan branch it now runs and reproduces the bug. Both live and JSON Save/Load variants finish the Storage Room and Delivery Bay with their authored capabilities and zero prisoners, then leave the first Cell pending after 30,000 simulated ticks.

Reapplying the reviewed living-carrier guard makes those exact two cases pass; the combined production-route foundation and regression tests pass10/10, and TypeScript passes. When no living prisoner exists, procurement uses its existing direct-deposit fallback. Once a living prisoner exists the furnished bay route remains available, verified by the foundation fixture. No material price, balance number, save field or carrier role was introduced.

The new browser case uses the real Room plans dialog for all three placements, Save/Load between furnishing the route and placing the Cell, and the actual worker completion counters. It does not inject construction commands. This browser case is prepared but has not run: the camera agent currently has the sole browser lease. Runtime unit proof is complete; player acceptance and production release remain incomplete.
