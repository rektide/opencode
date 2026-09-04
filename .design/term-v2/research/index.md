# Pluggable epilogue research wave

These reports were produced independently from the shared [initial possibility map](/.design/term-v2/epilogue-plugins0.gpt56s.md). The [wave synthesis](/.design/term-v2/epilogue-plugins1-syn0.gpt56s.md) reconciles their evidence and recommendations.

## Interface designs

- [Headless epilogue slot](/.design/term-v2/research/headless-slot0.gpt56s.md): measures how much existing slot registration, ordering, reconciliation, and cleanup can be reused; includes null-component and offscreen alternatives plus falsifying prototypes.
- [Structured epilogue registry](/.design/term-v2/research/structured-registry0.gpt56s.md): separates a dedicated additive registration interface from its retained live-computation implementation and compares shutdown pull, imperative push, and aggregate tracking.
- [Retained reactive cells](/.design/term-v2/research/retained-cells0.gpt56s.md): develops retained cells and adds an implementability addendum showing native Solid, cleanup, storage, and lifecycle reuse; experimentally evaluates null and `visible=false` OpenTUI variants.

## Current-system audits

- [CLI plugin surface audit](/.design/term-v2/research/plugin-surface-audit0.gpt56s.md): inventories cached Session data, reactivity, slots, storage, events, renderer access, cleanup, supported prototypes, and unsupported hacks.
- [Shutdown carry audit](/.design/term-v2/research/shutdown-carry-audit0.gpt56s.md): traces the production state machine and identifies `NodeRuntime` interruption as a blocker for SIGINT/SIGTERM epilogue output; maps tests and seam-specific carry risk.
- [Fixed-purpose Active carry](/.design/term-v2/research/fixed-carry0.gpt56s.md): minimizes and hardens the current downstream patch, defines lookup-free activity semantics, and gives a threshold for investing in a generic upstream seam.
