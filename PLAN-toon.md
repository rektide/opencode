# Plan: TOON Syntax Highlighting in OpenCode TUI

## Research Summary

### Current Syntax Highlighting System

OpenCode uses a robust syntax highlighting system built on tree-sitter:

1. **Core Components**:
   - `@opentui/core` - Core TUI library with syntax highlighting support
   - `web-tree-sitter` - WASM-based tree-sitter parser
   - Language-specific parsers loaded from `parsers-config.ts`

2. **Parser Configuration** (`packages/opencode/parsers-config.ts`):
   - Defines WASM URLs for various languages (Python, Rust, Go, C++, etc.)
   - Uses nvim-treesitter query files for syntax rules
   - Built-in support for: JavaScript, TypeScript, Markdown, and 20+ other languages

3. **Language Detection** (`packages/opencode/src/lsp/language.ts`):
   - Maps file extensions to language IDs
   - Currently supports 117 language mappings
   - No TOON mapping exists yet

4. **TUI Rendering** (`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`):
   - Uses `<code>` component with `filetype` prop for syntax highlighting
   - Renders markdown content with `filetype="markdown"`
   - Applies `syntaxStyle` prop for color themes

### TOON Format

TOON (Token-Oriented Object Notation) is:

- Compact, human-readable encoding for LLM prompts
- Combines YAML's indentation with CSV-style tabular arrays
- Uses `.toon` file extension
- Has a complete tree-sitter grammar: `tree-sitter-toon` (GPL-3.0)

### Current TOON Support

**Status**: ❌ No TOON syntax highlighting in OpenCode

Evidence:

- No `".toon": "toon"` in `LANGUAGE_EXTENSIONS` mapping
- No TOON parser in `parsers-config.ts`
- No existing WASM file or parser configuration for TOON
- Only indirect reference: optional peer dependency in `@openrouter/ai-sdk-provider`

### TOON Tree-sitter Grammar

Available at: https://github.com/3swordman/tree-sitter-toon

- Status: Production Ready (93.8% test pass rate)
- License: GPL-3.0 (incompatible with MIT-based parsers-config.ts)
- Has WASM builds (needs to check for pre-built)
- Grammar files available: `grammar.js`, `tree-sitter.json`
- Query files: Standard tree-sitter test corpus

## Proposed Implementation Plan

### Phase 1: Infrastructure Setup

1. **Add TOON Language Mapping**
   - File: `packages/opencode/src/lsp/language.ts`
   - Add: `".toon": "toon"` to `LANGUAGE_EXTENSIONS`

2. **License Compliance Check**
   - TOON parser is GPL-3.0
   - Current parsers in `parsers-config.ts` use MIT/ISC/BSD-2/BSD-3 licenses
   - **Option A**: Seek MIT-compatible TOON parser (contact maintainers)
   - **Option B**: Build from source and use as separate module
   - **Option C**: Fork/clone parser and relicense (with permission)
   - **Option D**: Add TOON as optional/external parser configuration

3. **Parser Integration**
   - Identify or create WASM build of `tree-sitter-toon`
   - Create query files for syntax highlighting:
     - `highlights.scm` - for token highlighting
     - `locals.scm` - for scope detection (optional)
   - Host query files in opencode repo or use remote URLs

### Phase 2: Parser Configuration

1. **Add TOON to `parsers-config.ts`**

   ```typescript
   {
     filetype: "toon",
     wasm: "URL_TO_TOON_WASM",
     queries: {
       highlights: [
         "URL_TO_TOON_HIGHLIGHTS_SCM"
       ],
       // Optional: locals query
     },
   }
   ```

2. **Query File Development**
   - Create highlighting rules for TOON syntax:
     - Keys (object properties)
     - Values (strings, numbers, booleans)
     - Array headers with lengths `[N]`
     - Field lists `{fields}`
     - Delimiters (comma, pipe, tab)
     - Comments (if supported)

### Phase 3: TUI Integration

1. **Automatic Detection**
   - Update `filetype()` function in session/index.tsx to recognize `.toon` files
   - Ensure markdown code blocks with ```toon use TOON highlighting

2. **Theme Support**
   - Add TOON-specific syntax colors to theme definitions
   - Reuse existing theme color palette:
     - `syntaxString` - for TOON strings
     - `syntaxNumber` - for TOON numbers
     - `syntaxKeyword` - for TOON keys/headers
     - `syntaxOperator` - for TOON delimiters
   - Optional: Add dedicated TOON colors if syntax warrants it

### Phase 4: Testing & Validation

1. **Unit Tests**
   - Test TOON language detection
   - Verify parser loads correctly
   - Test with various TOON examples (simple, nested, tabular)

2. **Integration Tests**
   - Verify TUI renders TOON code blocks correctly
   - Test streaming behavior (for LLM output)
   - Test concealment and theme switching

3. **Edge Cases**
   - Mixed markdown + TOON content
   - Invalid/malformed TOON (should not crash)
   - Large TOON payloads (performance)

### Phase 5: Documentation

1. **Update User Docs**
   - Document TOON support in README
   - Add TOON examples to docs
   - Note limitations if any (e.g., license issue)

2. **Developer Docs**
   - Document TOON parser configuration
   - Note license compatibility considerations
   - Guide for adding similar parsers in future

## Implementation Details

### Key Considerations

1. **License Compatibility**
   - Primary blocker: GPL-3.0 vs MIT
   - Need resolution before proceeding
   - Recommended: Contact TOON parser maintainer for dual-license

2. **WASM Availability**
   - Check if `tree-sitter-toon` releases include WASM
   - If not, build locally using tree-sitter CLI
   - Consider hosting WASM on GitHub releases or CDN

3. **Parser Architecture**
   - Follow existing pattern in `parsers-config.ts`
   - Use `addDefaultParsers()` from @opentui/core
   - Ensure lazy loading to avoid startup overhead

4. **Query Syntax**
   - Use nvim-treesitter query format
   - Reference existing queries in parsers-config.ts (e.g., python, rust)
   - Test queries with `tree-sitter query` CLI

### Code Structure

```
packages/opencode/
├── parsers-config.ts          # Add TOON parser config
└── src/
    ├── lsp/
    │   └── language.ts         # Add ".toon" mapping
    └── cli/cmd/tui/
        ├── context/
        │   └── theme.tsx        # Add TOON syntax colors
        └── routes/
            └── session/
                └── index.tsx    # Update filetype detection
```

### Query File Structure

Create `queries/toon/highlights.scm`:

```
; Comments
(comment) @comment

; Keys (object properties)
(key) @property

; String values
(string) @string

; Numbers
(number) @number

; Boolean/null
(boolean) @boolean
(null) @constant

; Array headers with length
(array_header) @keyword

; Field lists in tabular arrays
(field_list) @keyword

; Delimiters
(delimiter) @operator
```

## Estimated Effort

- **Phase 1 (Setup)**: 2-4 hours
- **Phase 2 (Config)**: 4-8 hours
- **Phase 3 (Integration)**: 2-4 hours
- **Phase 4 (Testing)**: 4-6 hours
- **Phase 5 (Docs)**: 2-3 hours

**Total**: 14-25 hours (dependent on license resolution)

## Dependencies

Required:

- `tree-sitter-toon` WASM build (or build process)
- Query files for TOON syntax highlighting
- License compatibility resolution

Optional:

- Additional theme colors specific to TOON
- Performance testing with large TOON payloads

## Success Criteria

✅ TOON code blocks in LLM messages render with syntax highlighting
✅ .toon files opened in opencode are highlighted correctly
✅ Theme colors apply appropriately to TOON syntax
✅ No performance degradation on startup or rendering
✅ Tests pass for TOON parser integration
✅ Documentation updated

## Open Questions

1. **License**: Can we resolve GPL-3.0 incompatibility?
   - Contact `3swordman` (tree-sitter-toon maintainer)
   - Explore alternative MIT-licensed TOON parsers
   - Consider separate GPL-licensed module

2. **WASM**: Is pre-built WASM available?
   - Check tree-sitter-toon releases
   - Build from source if needed
   - Host location (GitHub releases, CDN, inline)

3. **Scope**: Should we add TOON to other file types?
   - Inline TOON in markdown (already supported via ```toon)
   - JSON-TOON conversion tool (out of scope)
   - LSP support for .toon files (future work)

## Next Steps

1. **Immediate**: Contact TOON parser maintainer about licensing
2. **Short-term**: Evaluate alternative TOON parsers or fork with MIT license
3. **Medium-term**: Build WASM and create query files
4. **Long-term**: Full integration and testing

## Alternatives

If license cannot be resolved:

1. **External Parser Configuration**: Allow users to add custom parsers via config
2. **Basic Regex Highlighting**: Use simple regex for TOON (less accurate, no tree-sitter)
3. **YAML Highlighting**: Use YAML parser for TOON (similar but inaccurate)
4. **No Highlighting**: Display TOON as plain text (current state)

## Related Issues

- None tracked yet (new feature request)

## References

- TOON Format: https://toonformat.dev
- TOON Spec: https://github.com/toon-format/spec
- tree-sitter-toon: https://github.com/3swordman/tree-sitter-toon
- nvim-treesitter queries: https://github.com/nvim-treesitter/nvim-treesitter
- OpenCode parsers-config: `packages/opencode/parsers-config.ts`
