import type { EngineInterface } from 'claude-code'

// The engine attaches a Bash result's file diff only for the session's own working tree. A command that
// works in another worktree of the same repository (cd ../wt && ..., sed -i ../wt/f.txt) comes back
// without one, so for those worktrees the pane takes its own snapshot before the command and diffs after.

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }
export type ChangedFile = { filePath: string; hunks: Hunk[]; created?: true; deleted?: true }

type Snapshot = { root: string; base: string; untracked: Set<string> }

const MAX_FILES = 50

function normalized(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function git($: EngineInterface, root: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const ran = await $.process.run(['git', '-c', 'core.quotePath=false', ...args], { cwd: root, timeoutMs: 15000 })

  return { exitCode: ran.exitCode, stdout: ran.stdout }
}

async function worktreesOf($: EngineInterface): Promise<string[]> {
  const listed = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { timeoutMs: 15000 })
  if (listed.exitCode !== 0) {
    return []
  }

  return listed.stdout
    .split(/\r?\n/)
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length).trim())
}

// The other worktrees the command names: by absolute path, or by folder name as a path segment.
async function namedWorktrees($: EngineInterface, command: string): Promise<string[]> {
  const worktrees = await worktreesOf($)
  if (worktrees.length < 2) {
    return []
  }

  const cwd = normalized(await $.session.cwd())
  const text = normalized(command)

  return worktrees.filter(root => {
    const path = normalized(root)
    if (cwd === path || cwd.startsWith(`${path}/`)) {
      return false
    }
    const name = path.slice(path.lastIndexOf('/') + 1)

    return text.includes(path) || new RegExp(`(^|[/\\s'"=])${escaped(name)}([/\\s'"]|$)`).test(text)
  })
}

function untrackedOf(stdout: string): Set<string> {
  return new Set(stdout.split('\0').filter(Boolean))
}

export async function snapshotNamedWorktrees($: EngineInterface, command: string): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = []
  for (const root of await namedWorktrees($, command)) {
    // A stash commit of the working tree, written to the object store only: no ref, no file touched.
    const stash = await git($, root, ['stash', 'create'])
    const untracked = await git($, root, ['ls-files', '-o', '--exclude-standard', '-z'])
    if (stash.exitCode !== 0 || untracked.exitCode !== 0) {
      continue
    }
    snapshots.push({ root, base: stash.stdout.trim() || 'HEAD', untracked: untrackedOf(untracked.stdout) })
  }

  return snapshots
}

function parsedDiff(root: string, text: string): ChangedFile[] {
  const files: ChangedFile[] = []
  let file: ChangedFile | undefined
  let hunk: Hunk | undefined
  let oldPath = ''

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('diff --git ')) {
      file = undefined
      hunk = undefined
    } else if (line.startsWith('--- ')) {
      oldPath = line.slice(4)
    } else if (line.startsWith('+++ ')) {
      const newPath = line.slice(4)
      const relative = newPath === '/dev/null' ? oldPath.replace(/^a\//, '') : newPath.replace(/^b\//, '')
      file = { filePath: `${root}/${relative}`, hunks: [] }
      if (oldPath === '/dev/null') {
        file.created = true
      }
      if (newPath === '/dev/null') {
        file.deleted = true
      }
      files.push(file)
    } else if (file !== undefined && line.startsWith('@@ ')) {
      const found = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (found) {
        hunk = {
          oldStart: Number(found[1]),
          oldLines: found[2] === undefined ? 1 : Number(found[2]),
          newStart: Number(found[3]),
          newLines: found[4] === undefined ? 1 : Number(found[4]),
          lines: [],
        }
        file.hunks.push(hunk)
      }
    } else if (hunk !== undefined && /^[ +\-\\]/.test(line)) {
      hunk.lines.push(line)
    }
  }

  return files
}

export async function changesSince($: EngineInterface, snapshots: Snapshot[]): Promise<{ files: ChangedFile[]; moreFiles: number }> {
  const files: ChangedFile[] = []
  for (const snapshot of snapshots) {
    const tracked = await git($, snapshot.root, ['diff', '--no-color', '--no-ext-diff', snapshot.base])
    if (tracked.exitCode === 0) {
      files.push(...parsedDiff(snapshot.root, tracked.stdout))
    }

    const untracked = await git($, snapshot.root, ['ls-files', '-o', '--exclude-standard', '-z'])
    for (const relative of untrackedOf(untracked.stdout)) {
      if (snapshot.untracked.has(relative)) {
        continue
      }
      // --no-index exits 1 when the files differ, which a new file always does.
      const created = await git($, snapshot.root, ['diff', '--no-color', '--no-index', '--', '/dev/null', relative])
      const parsed = parsedDiff(snapshot.root, created.stdout)
      files.push(...(parsed.length > 0 ? parsed : [{ filePath: `${snapshot.root}/${relative}`, hunks: [], created: true as const }]))
    }
  }

  return { files: files.slice(0, MAX_FILES), moreFiles: Math.max(0, files.length - MAX_FILES) }
}
