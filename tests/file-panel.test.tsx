import { describe, expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const pane = (isPlaced: boolean) => ({ id: 'file-panel', title: 'File', isShown: true, isFocused: false, isPlaced })
const PATCH = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old line', '+new line'] }]

describe('file-panel', () => {
  for (const surface of SURFACES) {
    test(`${surface}: an Edit lands in the pane with its diff`, async ($, on) => {
      on('tool.call', { tool: 'Edit' }, async (_$, e) => ({
        result: {
          filePath: e.file_path,
          oldString: e.old_string,
          newString: e.new_string,
          originalFile: 'old line',
          structuredPatch: PATCH,
          userModified: false,
          replaceAll: false,
        },
      }))

      await $.tool.call({
        tool: 'Edit',
        tool_use_id: 'toolu_1',
        file_path: 'D:/proj/Unit1.pas',
        old_string: 'old line',
        new_string: 'new line',
      })

      const pane = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'Pane',
        requestId: 'file-panel',
        props: {
          title: 'File',
          isFocused: false,
          bodyColumns: 60,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 40 },
          view: {},
        },
      })

      expect(await pane.find({ type: 'Text', text: 'Unit1.pas' })).toBeDefined()
      expect(await pane.find({ type: 'Code', text: '+new line' })).toBeDefined()
    })

    test(`${surface}: the transcript row of an Edit shrinks once the pane is open`, async ($, on) => {
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('ui.panes', () => ({ value: [pane(true)] }))
      on('ui.render', { component: 'ToolUse' }, ($e, e) => {
        const { Text } = $e.ui.resolve(e)

        return <Text>engine row</Text>
      })
      await $.command.run({ command: 'file-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

      const row = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'ToolUse',
        requestId: 'toolu_2',
        props: {
          tool_use_id: 'toolu_2',
          tool: 'Edit',
          input: { file_path: 'D:/proj/Unit2.pas', old_string: 'a', new_string: 'b' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      })

      expect(await row.find({ type: 'Text', text: /Edit Unit2\.pas .*File pane/ })).toBeDefined()
    })

    test(`${surface}: files a Bash command changed land in the pane`, async ($, on) => {
      on('tool.call', { tool: 'Bash' }, async () => ({
        result: {
          stdout: 'done',
          stderr: '',
          interrupted: false,
          bashEditDiff: { files: [{ filePath: 'D:/proj/notes.md', hunks: PATCH }], moreFiles: 0 },
        },
      }))

      await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_4', command: 'python edit.py' })

      const pane = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'Pane',
        requestId: 'file-panel',
        props: {
          title: 'File',
          isFocused: false,
          bodyColumns: 60,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 40 },
          view: {},
        },
      })

      expect(await pane.find({ type: 'Text', text: 'notes.md' })).toBeDefined()
      expect(await pane.find({ type: 'Code', text: '+new line' })).toBeDefined()
    })

    test(`${surface}: a Bash command in another worktree lands in the pane through git`, async ($, on) => {
      const ran = (stdout: string, exitCode = 0) => ({
        value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
      })
      let isAfter = false
      on('session.cwd', () => ({ value: 'D:/repo/main' }))
      on('process.run', (_$, e) => {
        const args = e.argv.join(' ')
        if (args.includes('worktree list')) {
          return ran('worktree D:/repo/main\nHEAD 1\n\nworktree D:/repo/wt\nHEAD 2\n')
        }
        if (args.includes('stash create')) {
          return ran('abc123\n')
        }
        if (args.includes('ls-files')) {
          return ran('')
        }
        if (args.includes('diff') && args.includes('abc123')) {
          return ran(isAfter ? 'diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-b\n+B\n' : '')
        }

        return ran('', 1)
      })
      on('tool.call', { tool: 'Bash' }, async () => {
        isAfter = true

        return { result: { stdout: '', stderr: '', interrupted: false } }
      })

      await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_7', command: "sed -i 's/b/B/' ../wt/f.txt" })

      const pane = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'Pane',
        requestId: 'file-panel',
        props: {
          title: 'File',
          isFocused: false,
          bodyColumns: 60,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 40 },
          view: {},
        },
      })

      expect(await pane.find({ type: 'Text', text: 'D:/repo/wt/f.txt' })).toBeDefined()
      expect(await pane.find({ type: 'Code', text: '+B' })).toBeDefined()
    })

    test(`${surface}: a Bash result drops its file diffs once the pane is open`, async ($, on) => {
      let drawn: unknown
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('ui.panes', () => ({ value: [pane(true)] }))
      on('ui.render', { component: 'ToolResult' }, ($e, e) => {
        drawn = e.props.output
        const { Text } = $e.ui.resolve(e)

        return <Text>engine result</Text>
      })
      await $.command.run({ command: 'file-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

      await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'ToolResult',
        requestId: 'toolu_5',
        props: {
          tool_use_id: 'toolu_5',
          tool: 'Bash',
          output: {
            stdout: 'done',
            stderr: '',
            interrupted: false,
            bashEditDiff: { files: [{ filePath: 'D:/proj/notes.md', hunks: PATCH }], moreFiles: 0 },
          },
          isErrored: false,
        },
      })

      expect(drawn).toEqual({ stdout: 'done', stderr: '', interrupted: false })
    })

    test(`${surface}: the transcript keeps an Edit row in full while the pane waits undrawn`, async ($, on) => {
      on('ui.open', () => ({ value: { isPlaced: false, reason: 'terminal 100 columns, pane needs 110' } }))
      on('ui.panes', () => ({ value: [pane(false)] }))
      on('ui.render', { component: 'ToolUse' }, ($e, e) => {
        const { Text } = $e.ui.resolve(e)

        return <Text>engine row</Text>
      })
      await $.command.run({ command: 'file-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })

      const row = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'ToolUse',
        requestId: 'toolu_6',
        props: {
          tool_use_id: 'toolu_6',
          tool: 'Edit',
          input: { file_path: 'D:/proj/Unit6.pas', old_string: 'a', new_string: 'b' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      })

      expect(await row.find({ type: 'Text', text: /File pane/ })).toBeUndefined()
      expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    })

    test(`${surface}: the transcript row of an Edit shrinks once a waiting pane gets placed`, async ($, on) => {
      let isPlaced = false
      on('ui.open', () => ({ value: { isPlaced: false, reason: 'terminal 100 columns, pane needs 144' } }))
      on('ui.panes', () => ({ value: [pane(isPlaced)] }))
      on('ui.render', { component: 'ToolUse' }, ($e, e) => {
        const { Text } = $e.ui.resolve(e)

        return <Text>engine row</Text>
      })
      await $.command.run({ command: 'file-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })
      isPlaced = true

      const row = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'ToolUse',
        requestId: 'toolu_8',
        props: {
          tool_use_id: 'toolu_8',
          tool: 'Edit',
          input: { file_path: 'D:/proj/Unit8.pas', old_string: 'a', new_string: 'b' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      })

      expect(await row.find({ type: 'Text', text: /Edit Unit8\.pas .*File pane/ })).toBeDefined()
    })

    test(`${surface}: a Bash row is left to the engine`, async ($, on) => {
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('ui.panes', () => ({ value: [pane(true)] }))
      on('ui.render', { component: 'ToolUse' }, ($e, e) => {
        const { Text } = $e.ui.resolve(e)

        return <Text>engine row</Text>
      })
      await $.command.run({ command: 'file-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

      const row = await $.ui.mount({
        plugin: 'file-panel',
        surface,
        component: 'ToolUse',
        requestId: 'toolu_3',
        props: {
          tool_use_id: 'toolu_3',
          tool: 'Bash',
          input: { command: 'ls' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      })

      expect(await row.find({ type: 'Text', text: /File pane/ })).toBeUndefined()
      expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    })
  }
})
