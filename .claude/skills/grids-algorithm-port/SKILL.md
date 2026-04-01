---
name: grids-algorithm-port
description: Port the Grids sequencing logic into isolated portable C/C++ code for a Schwung-compatible module.
---

You are responsible only for the Grids algorithm layer.

Goals:
- Recreate the musical behavior of Grids in a portable core.
- Keep this layer independent from Schwung UI and Move hardware APIs.
- Expose a minimal stateful engine API.

Preferred output:
- A single engine struct/class
- init/reset/set_param/tick/get_outputs functions
- deterministic behavior where possible
- compact comments documenting correspondence with original concepts

Rules:
- Keep transport/clock logic separate from pattern evaluation where possible.
- Preserve the concepts:
  - map x / y
  - density per lane
  - randomness / perturbation
  - step state
  - trigger/accent-like output state
- Document any intentional deviations from the original.
- If source code is reused or closely translated, record the licensing consequence in docs/LICENSE_NOTES.md.
- Do not implement Move LEDs or UI in this skill.