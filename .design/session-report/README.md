# Selected Session exit report

This patch adds an explicit `/print-sessions` TUI command. It loads every Session named by
`Args.sessionIDs` in array order, follows message cursors to completion, formats readable Markdown,
installs the result in a one-run report slot, and exits. The existing `Tui.run` lifecycle writes that
report only after its renderer scope has been released. The report slot is deliberately separate
from the mounted Session footer, whose cleanup clears the ordinary epilogue during teardown.

Ordinary exit is unchanged. No report is loaded or printed unless the command is invoked.

## Repeated `-s` integration

The independent repeated-flag patch should pass its normalized, de-duplicated, argument-ordered
selection to the TUI as `args.sessionIDs`. It should continue passing `args.sessionID` while legacy
single-selection consumers need it. This patch falls back to `[args.sessionID]`, so it can land first.

The array means explicitly selected startup Sessions, not all persisted/open tabs. That keeps report
scope stable if tabs are opened, closed, or restored during the TUI run. The startup patch remains
responsible for validating unknown IDs and deciding which selected Session is initially active.

## Failure and output policy

Session loading is sequential to keep request and output order stable. Each Session's metadata and
first message page load together; later pages follow `cursor.next`. Any failed page rejects the
command, shows the normal TUI error toast, and leaves the TUI running without installing a partial
epilogue. Thinking is included so the report is a complete Markdown transcript.
