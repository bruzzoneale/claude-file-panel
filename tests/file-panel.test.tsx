import { describe, expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
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

    test(`${surface}: a Bash row is left to the engine`, async ($, on) => {
      on('ui.open', () => ({ value: { isPlaced: true } }))
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
