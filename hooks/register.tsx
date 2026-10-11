import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { FileEntry, FileEntryStatus } from '../types'

const PANE = 'file-panel'
const TITLE = 'File'
const POINTER = '→ File pane'
const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Read', 'Glob', 'Grep'])
const MAX_ENTRIES = 100
const MAX_DIFF_LINES = 80

const entries = atom({ plugin: 'file-panel', key: 'entries' } as const, [])
const isOpen = atom({ plugin: 'file-panel', key: 'isOpen' } as const, false)

type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

function targetOf(input: unknown): string {
  const fields = (input ?? {}) as Record<string, unknown>
  const value = fields.file_path ?? fields.notebook_path ?? fields.pattern ?? fields.path ?? ''

  return typeof value === 'string' ? value : ''
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/)

  return parts[parts.length - 1] || path
}

// Whole hunks only, so the Code element still parses the text as a unified diff.
function diffOf(result: unknown): Pick<FileEntry, 'diff' | 'added' | 'removed' | 'note'> {
  return hunksOf((result as { structuredPatch?: Hunk[] } | undefined)?.structuredPatch)
}

function hunksOf(patch: Hunk[] | undefined): Pick<FileEntry, 'diff' | 'added' | 'removed' | 'note'> {
  if (!Array.isArray(patch) || patch.length === 0) {
    return {}
  }

  let added = 0
  let removed = 0
  let shownLines = 0
  let hiddenHunks = 0
  const hunks: string[] = []

  for (const hunk of patch) {
    added += hunk.lines.filter(line => line.startsWith('+')).length
    removed += hunk.lines.filter(line => line.startsWith('-')).length

    if (hunks.length > 0 && shownLines + hunk.lines.length > MAX_DIFF_LINES) {
      hiddenHunks += 1
      continue
    }
    shownLines += hunk.lines.length
    hunks.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${hunk.lines.join('\n')}`,
    )
  }

  return {
    diff: hunks.join('\n'),
    added,
    removed,
    note: hiddenHunks > 0 ? `… ${hiddenHunks} more hunk${hiddenHunks === 1 ? '' : 's'} not shown` : undefined,
  }
}

function summaryOf(tool: string, result: unknown): Pick<FileEntry, 'diff' | 'added' | 'removed' | 'note'> {
  if (tool === 'Edit' || tool === 'Write') {
    const fromPatch = diffOf(result)
    if (fromPatch.diff !== undefined) {
      return fromPatch
    }
    const write = result as { type?: string; content?: string } | undefined
    if (tool === 'Write' && write?.type === 'create' && typeof write.content === 'string') {
      const lineCount = write.content.split('\n').length

      return { note: `new file, ${lineCount} line${lineCount === 1 ? '' : 's'}`, added: lineCount }
    }
  }

  return {}
}

type BashEditDiff = {
  files: { filePath: string; hunks: Hunk[]; created?: true; deleted?: true }[]
  moreFiles: number
}

function bashEditDiffOf(result: unknown): BashEditDiff | undefined {
  const diff = (result as { bashEditDiff?: BashEditDiff } | undefined)?.bashEditDiff

  return Array.isArray(diff?.files) && diff.files.length > 0 ? diff : undefined
}

// One entry per file a shell command changed, from the diff the engine attaches to Bash results.
function bashEntriesOf(toolUseId: string, diff: BashEditDiff): FileEntry[] {
  const found: FileEntry[] = diff.files.map((file, index) => {
    const details = hunksOf(file.hunks)
    const change = file.created ? 'new file' : (file.deleted ? 'deleted' : undefined)
    const note = [change, details.note].filter(Boolean).join(', ') || undefined

    return { id: `${toolUseId}#${index}`, tool: 'Bash', path: file.filePath, status: 'done', ...details, note }
  })
  if (diff.moreFiles > 0) {
    found.push({
      id: `${toolUseId}#more`,
      tool: 'Bash',
      path: '',
      status: 'done',
      note: `… ${diff.moreFiles} more file${diff.moreFiles === 1 ? '' : 's'} changed, not shown`,
    })
  }

  return found
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'file-panel',
      description: 'Open the side pane with file reads and edits',
    })
    void $.ui.open({ id: PANE, title: TITLE }).then(() => update($, isOpen, () => true))

    return next(e)
  })

  on('command.run', { command: 'file-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await update($, isOpen, () => true)

    return { text: 'File pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      await update($, isOpen, () => false)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash') {
      const ran = await next(e)
      const diff = bashEditDiffOf(ran.result)
      if (diff !== undefined) {
        const found = bashEntriesOf(e.tool_use_id, diff)
        await update($, entries, list => [...list, ...found].slice(-MAX_ENTRIES))
      }

      return ran
    }
    if (!FILE_TOOLS.has(e.tool)) {
      return next(e)
    }

    const entry: FileEntry = { id: e.tool_use_id, tool: e.tool, path: targetOf(e), status: 'running' }
    await update($, entries, list => [...list, entry].slice(-MAX_ENTRIES))

    const ran = await next(e)
    const isFailed = (ran.deny !== undefined) || (ran.isError === true)
    const details = isFailed
      ? { note: ran.deny ?? ran.text ?? 'error' }
      : summaryOf(e.tool, ran.result)

    const status: FileEntryStatus = isFailed ? 'error' : 'done'
    await update($, entries, list =>
      list.map(one => (one.id === entry.id ? { ...one, ...details, status } : one)),
    )

    return ran
  }).catch(($, e, next) => next(e))

  // Transcript: file tool rows shrink to one dim line while the pane is open.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!FILE_TOOLS.has(e.props.tool) || !(await read($, isOpen))) {
      return next(e)
    }

    const { Text } = $.ui.resolve(e)
    const mark = e.props.isRunning ? '…' : (e.props.isErrored ? '✗' : '✓')

    return (
      <Text dimColor wrap="truncate-end">
        {`${mark} ${e.props.tool} ${baseName(targetOf(e.props.input))}  ${POINTER}`}
      </Text>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    // A shell command's output stays; only the file diffs it carries move to the pane.
    if (e.props.tool === 'Bash' && bashEditDiffOf(e.props.output) !== undefined && (await read($, isOpen))) {
      const { bashEditDiff: _moved, ...output } = e.props.output as { bashEditDiff?: unknown }

      return next({ ...e, props: { ...e.props, output } })
    }
    if (!FILE_TOOLS.has(e.props.tool) || !(await read($, isOpen))) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const isAllFiles = e.props.calls.every(call => FILE_TOOLS.has(call.tool))
    if (!isAllFiles || e.props.isExpanded || !(await read($, isOpen))) {
      return next(e)
    }

    const counts = new Map<string, number>()
    for (const call of e.props.calls) {
      counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1)
    }
    const label = [...counts].map(([tool, count]) => `${tool} ×${count}`).join(', ')
    const mark = e.props.isActive ? '…' : '✓'
    const { Text } = $.ui.resolve(e)

    return <Text dimColor wrap="truncate-end">{`${mark} ${label}  ${POINTER}`}</Text>
  })

  // The pane: newest first, Edit/Write with their diff.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const list = await read($, entries)

    if (list.length === 0) {
      return <Text dimColor>No file operations in this session yet.</Text>
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>{`${list.length} operation${list.length === 1 ? '' : 's'}  `}</Text>
          <Button key="clear" label="Clear" onPress={() => update($, entries, () => [])} />
        </Box>
        {[...list].reverse().map(entry => (
          <Box flexDirection="column" marginTop={1}>
            <Text wrap="truncate-end">
              <Text color={entry.status === 'error' ? 'error' : (entry.status === 'running' ? 'warning' : 'success')}>
                {entry.status === 'error' ? '✗ ' : (entry.status === 'running' ? '… ' : '✓ ')}
              </Text>
              <Text bold>{entry.tool}</Text>
              {` ${baseName(entry.path)}`}
              {entry.added ? <Text color="diffAdded">{` +${entry.added}`}</Text> : ''}
              {entry.removed ? <Text color="diffRemoved">{` -${entry.removed}`}</Text> : ''}
            </Text>
            {entry.path !== baseName(entry.path) && (
              <Text dimColor wrap="truncate-start">{entry.path}</Text>
            )}
            {entry.diff && <Code source={entry.diff} format="diff" path={entry.path} />}
            {entry.note && <Text dimColor={entry.status !== 'error'} color={entry.status === 'error' ? 'error' : undefined}>{entry.note}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
