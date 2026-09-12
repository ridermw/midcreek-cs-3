import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { canonicalJson, digest } from './assets/contracts.ts'

export interface PagesArtifact {
  readonly root: string
  readonly files: readonly { path: string; bytes: number; sha256: string }[]
}

const exec = promisify(execFile)
const base = '/midcreek-cs-3/'
const extensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.png', '.webp', '.ico', '.woff', '.woff2'])
const forbidden = /gallery\/|assets\/library\/|\.glb|\.map|\.artifacts|receipt|prompt|capture|log/i
const privateText = /PRIVATE[_ -]SENTINEL|\/(?:Users|home|private|tmp|var|Volumes|etc|opt)\/|file:\/\/|(?:^|[^a-z0-9])[A-Z]:[\\/]|\.artifacts|rawPrompt|private(?:Path|Photo|Reference)|accountId|deploymentId|RELEASE_BLOCKED|provisional\s+assets/i

function requirePages(condition: unknown, code: string, subject: string): asserts condition {
  if (!condition) throw new Error(`PAGES_${code}: ${subject}`)
}
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
async function noSymlinks(path: string, allowMissing = false): Promise<void> {
  let current: string = sep
  for (const part of resolve(path).split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      requirePages(!(await lstat(current)).isSymbolicLink(), 'FORBIDDEN', 'symlink or symlink ancestor')
    } catch (error) {
      if (allowMissing && hasCode(error, 'ENOENT')) return
      throw error
    }
  }
}
function decoded(text: string): string {
  return text.replace(/\\\//g, '/')
    .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
      (match, point: string, unicode: string, hex: string) => {
        const code = Number.parseInt(point ?? unicode ?? hex, 16)
        return code <= 0x10ffff ? String.fromCodePoint(code) : match
      })
}
function htmlValue(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|sol|bsol|colon);?/gi, (_, entity: string) => {
    const name = entity.toLowerCase()
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(name[1] === 'x' ? 2 : 1), name[1] === 'x' ? 16 : 10)
      requirePages(code > 0 && code <= 0x10ffff, 'URL', 'invalid HTML character reference')
      return String.fromCodePoint(code)
    }
    const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/', bsol: '\\', colon: ':' }
    return entities[name]!
  })
}

function inspectText(path: string, raw: string, members: ReadonlySet<string>): void {
  const text = decoded(raw)
  requirePages(!privateText.test(raw) && !privateText.test(text) && !privateText.test(htmlValue(text)),
    'FORBIDDEN', `${path}: private or non-public text`)
  const url = (value: string, module = false) => {
    if (value.startsWith('#') || value === 'data:,') return
    requirePages(!forbidden.test(value), 'FORBIDDEN', `${path}: forbidden request`)
    requirePages(!/[%\\\s\u0000-\u001f]/.test(value), 'URL', `${path}: encoded or malformed URL`)
    requirePages(value.startsWith(base) || (module && /^\.\.?\//.test(value)),
      'URL', `${path}: resource must retain ${base}`)
    const target = new URL(value, `https://pages.invalid${base}${path}`)
    requirePages(target.origin === 'https://pages.invalid' && target.pathname.startsWith(base)
      && !target.search, 'URL', `${path}: escaped URL`)
    const relative = target.pathname.slice(base.length)
    requirePages(!forbidden.test(relative), 'FORBIDDEN', `${path}: forbidden request`)
    const member = relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative
    requirePages(members.has(member), 'DEPENDENCY', `${path}: missing ${member}`)
  }
  const javascript = (source: string) => {
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteralLike(node.moduleSpecifier)) url(node.moduleSpecifier.text, true)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'fetch')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'fetch'))) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteralLike(argument)) {
          url(argument.text, node.expression.kind === ts.SyntaxKind.ImportKeyword)
        }
      }
      if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
        && /gallery\/|assets\/library\/|\.glb(?:$|[?#])/i.test(node.text)) {
        let literal: ts.Node = node
        if (ts.isTemplateSpan(literal.parent)) literal = literal.parent
        if (ts.isTemplateExpression(literal.parent)) literal = literal.parent
        const parent = literal.parent
        const predicate = parent && ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
          && ['includes', 'startsWith', 'endsWith'].includes(parent.expression.name.text)
        requirePages(predicate, 'FORBIDDEN', `${path}: library/gallery reference`)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  const css = (source: string) => {
    const plain = source.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex: string, character: string) => {
        const code = hex ? Number.parseInt(hex, 16) : 0
        requirePages(code <= 0x10ffff, 'URL', `${path}: invalid CSS escape`)
        return hex ? String.fromCodePoint(code) : character
      })
    for (const match of plain.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      url(match[1] ?? match[2] ?? match[3]!)
    }
    for (const match of plain.matchAll(/@import\s+["']([^"']+)["']/gi)) url(match[1]!)
  }
  if (path.endsWith('.js')) javascript(raw)
  if (path.endsWith('.css')) css(raw)
  if (/\.(?:html|svg)$/.test(path)) {
    const html = raw.replace(/<!--[\s\S]*?-->/g, '')
    for (const tag of html.matchAll(/<[a-z](?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
      for (const attribute of tag[0].matchAll(/\s([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        const value = htmlValue(attribute[2] ?? attribute[3] ?? attribute[4]!)
        const name = attribute[1]!.toLowerCase()
        if (name === 'style') css(value)
        else if (name === 'srcset') {
          for (const candidate of value.split(',')) url(candidate.trim().split(/\s+/)[0]!)
        } else if (name === 'src' || name === 'href' || name === 'xlink:href') url(value)
      }
    }
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) javascript(match[1]!)
    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) css(match[1]!)
  }
}

export async function validatePages(root: string): Promise<PagesArtifact> {
  root = resolve(root)
  await noSymlinks(root)
  requirePages((await lstat(root)).isDirectory(), 'FORBIDDEN', 'artifact root must be a directory')
  const contents: { path: string; data: Buffer }[] = []
  const walk = async (directory: string, prefix = ''): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`
      requirePages(!forbidden.test(entry.isDirectory() ? `${path}/` : path)
        && !/[%\\\u0000-\u001f]/.test(path), 'FORBIDDEN', path)
      requirePages(!entry.isSymbolicLink(), 'FORBIDDEN', `${path}: symlink`)
      const absolute = join(directory, entry.name)
      await noSymlinks(absolute)
      if (entry.isDirectory()) await walk(absolute, `${path}/`)
      else {
        requirePages(entry.isFile() && extensions.has(extname(path)), 'FORBIDDEN', path)
        const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          requirePages((await file.stat()).isFile(), 'FORBIDDEN', path)
          contents.push({ path, data: await file.readFile() })
        } finally { await file.close() }
      }
    }
  }
  await walk(root)
  contents.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const members = new Set(contents.map((file) => file.path))
  for (const entry of ['index.html', 'play/index.html']) requirePages(members.has(entry), 'MISSING', entry)
  for (const file of contents) {
    if (/\.(?:html|js|css|json|svg)$/.test(file.path)) inspectText(file.path, file.data.toString('utf8'), members)
  }
  return {
    root, files: contents.map(({ path, data }) => ({ path, bytes: data.length, sha256: digest(data) })),
  }
}

async function publish(generation: string, current: string): Promise<void> {
  await noSymlinks(current, true)
  try {
    requirePages((await lstat(current)).isDirectory(), 'FORBIDDEN', 'current must be a directory')
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
    await rename(generation, current)
    return
  }
  // rename cannot replace a nonempty directory. Use the OS atomic exchange, never a two-rename gap.
  await exec('python3', ['-I', '-c', `
import ctypes, os, sys
libc = ctypes.CDLL(None, use_errno=True)
source, target = map(os.fsencode, sys.argv[1:])
if sys.platform == "darwin":
    swap = libc.renamex_np
    swap.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    args = (source, target, 2)
elif sys.platform == "linux":
    swap = libc.renameat2
    swap.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    args = (-100, source, -100, target, 2)
else:
    raise RuntimeError("PAGES_ATOMIC: directory exchange requires macOS or Linux")
swap.restype = ctypes.c_int
if swap(*args) != 0:
    error = ctypes.get_errno()
    raise OSError(error, os.strerror(error))
`, generation, current])
}

export async function buildPages(repository = resolve('.')): Promise<PagesArtifact> {
  repository = resolve(repository)
  const parent = join(repository, '.artifacts/pages')
  await noSymlinks(parent, true)
  await mkdir(parent, { recursive: true })
  const lock = join(parent, '.build-lock')
  try { await mkdir(lock) } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new Error('PAGES_BUSY: another build owns the publication lock')
    throw error
  }
  const generation = join(parent, randomUUID())
  let published = false
  try {
    const dist = join(generation, 'dist')
    await mkdir(dist, { recursive: true })
    await exec(process.execPath, [
      join(repository, 'node_modules/vite/bin/vite.js'), 'build',
      '--config', join(repository, 'vite.config.ts'), '--outDir', dist, '--emptyOutDir',
    ], { cwd: repository, env: { ...process.env, CS3_PAGES_DEMO: '1' }, maxBuffer: 8_000_000 })
    const artifact = await validatePages(dist)
    await writeFile(join(generation, 'pages-manifest.json'), `${canonicalJson({ files: artifact.files })}\n`, { flag: 'wx' })
    const current = join(parent, 'current')
    await publish(generation, current)
    published = true
    return { root: join(current, 'dist'), files: artifact.files }
  } finally {
    try {
      await rm(generation, { recursive: true, force: true })
    } catch (error) {
      throw new Error(`PAGES_CLEANUP: ${published ? 'current published; prior generation retained' : 'unpublished generation retained'}`, { cause: error })
    } finally { await rmdir(lock) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildPages().then((artifact) => {
    console.log(`PAGES_ARTIFACT: ${artifact.root}`)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
