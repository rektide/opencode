# Executive Summary: TOON Syntax Highlighting for OpenCode TUI

## Objective

Add proper syntax highlighting for TOON (Token-Oriented Object Notation) format in OpenCode's Terminal User Interface, particularly for LLM messages that include TOON code blocks or JSON that's displayed in TOON format.

## Current State

❌ **No TOON syntax highlighting exists** in OpenCode

- TOON messages render as plain text in the TUI
- No language mapping for `.toon` files
- No tree-sitter parser configured for TOON syntax
- Only indirect TOON reference is an optional peer dependency

## Existing Infrastructure

OpenCode already has a mature syntax highlighting system:

✅ **Tree-sitter-based parsing** via `@opentui/core`
✅ **20+ language parsers** configured in `parsers-config.ts`
✅ **WASM-based syntax highlighting** with nvim-treesitter queries
✅ **Theme system** with extensible syntax color palette
✅ **Automatic filetype detection** for 117 file extensions
✅ **Markdown code block rendering** with `filetype` attribute

## The Problem

**Primary Blocker**: License incompatibility

- TOON's tree-sitter parser (`tree-sitter-toon`) is **GPL-3.0**
- All existing parsers in `parsers-config.ts` use permissive licenses (MIT, ISC, BSD-2, BSD-3)
- Cannot directly bundle GPL-licensed code with MIT-licensed parsers config

## Recommended Solution

### Phase 1: License Resolution (REQUIRED)

1. Contact `tree-sitter-toon` maintainer (`3swordman`) to request:
   - Dual-licensing (MIT/GPL-3.0)
   - MIT-compatible relicense permission
   - Or guidance on alternative licensing

2. If dual-license unavailable:
   - Fork and relicense (with explicit permission)
   - Find or develop MIT-licensed TOON parser
   - Consider separate GPL-licensed module architecture

### Phase 2: Parser Integration (2-4 hours)

1. Add language mapping: `".toon": "toon"` to `language.ts`
2. Build/host TOON WASM parser
3. Create `highlights.scm` query file for TOON syntax
4. Configure parser in `parsers-config.ts`

### Phase 3: TUI Integration (2-4 hours)

1. Update `filetype()` detection for `.toon` extension
2. Add TOON-specific syntax colors to theme system
3. Test with markdown ```toon code blocks
4. Verify streaming behavior for LLM messages

### Phase 4: Testing & Documentation (6-9 hours)

1. Unit tests for language detection and parser loading
2. Integration tests for TUI rendering
3. Update README and developer documentation
4. Add TOON examples to documentation

## Estimated Timeline

- **License resolution**: 1-2 weeks (external dependency)
- **Implementation**: 8-17 hours once license resolved
- **Total effort**: 14-25 hours

## Benefits

✅ **Improved readability** of TOON messages from LLMs
✅ **Better developer experience** when working with TOON files
✅ **Consistent highlighting** across all formats in OpenCode TUI
✅ **Leverages existing infrastructure** - minimal architectural changes
✅ **Extensible pattern** for adding future custom parsers

## Alternatives (if license cannot be resolved)

1. **External parser configuration** - Users add TOON parser via config
2. **Basic regex highlighting** - Simpler but less accurate (no tree-sitter)
3. **YAML highlighting** - Similar structure, but inaccurate for TOON-specific syntax
4. **No highlighting** - Current state (acceptable fallback)

## Decision Point

**Primary decision needed**: Can we resolve the GPL-3.0 license incompatibility?

Recommendation: Contact TOON parser maintainer immediately to begin dual-license discussion before implementation begins.

---

**Document Version**: 1.0
**Date**: 2025-01-07
**Author**: Research & Planning
