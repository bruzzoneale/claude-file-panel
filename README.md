# file-panel

**English** · [Italiano](README.it.md)

A Claude Code mod that moves file reads and edits into a sidebar pane, leaving the main transcript to
conversation, reasoning and prompts.

- **"File" pane**: every Edit, Write, NotebookEdit, Read, Glob and Grep call, newest first. Edit and Write
  show the coloured diff and the +/- line counts; errors are shown in red. The "Clear" button
  empties the list.
- **Transcript**: a file tool's row shrinks to one dim line (`✓ Edit Unit1.pas  → File pane`).
  Bash commands are left as they are.
- **Pane closed** (Esc or `ctrl+x x`): the transcript shows everything in full again.
- **`/file-panel`** reopens the pane.

The pane is a column on the right in the terminal's fullscreen layout, from 110 columns wide; it opens by
itself at startup from 144 columns. In the main-screen layout (`CLAUDE_CODE_NO_FLICKER=0`, tmux) it shows
above the prompt instead.

## Installation

In a Claude Code terminal session, at the prompt:

```
/plugin install file-panel --marketplace bruzzoneale/claude-file-panel
```

Answer `y` to "Add marketplace?", then pick the scope (Enter for *user*: the mod is active in every
session). Or from the command line:

```
claude plugin install file-panel --marketplace bruzzoneale/claude-file-panel --scope user
```

Sessions that are already open load the plugin the next time they start.

## Development

After cloning the repository:

- Try it without installing: `claude --plugin-dir <clone folder>`
- Validate: `claude plugin validate <clone folder>`
- Test: `claude plugin test <clone folder>`

`.claude-plugin/types/` is written by the engine when it loads the mod (editor types) and is not
versioned.
