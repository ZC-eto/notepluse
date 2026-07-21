const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const CONFIG_NAME = 'notepluse-config.json'
/** 旧版插件名遗留配置，启动时若存在则合并迁移一次 */
const LEGACY_CONFIG_NAMES = ['garben-config.json', 'md-workspace-config.json']
const DEFAULT_FOLDER_NAME = 'NotePluseNotes'
/** 默认一级文件夹（物理子目录） */
const DEFAULT_FOLDERS = ['个人', '工作', '今日待办', '长期待办', '记录']
/** 「记录」类：日记/流水，不强制任务模板 */
const RECORD_FOLDER_NAMES = new Set(['记录'])

function safeGetPath(name) {
  try {
    if (window.ztools && typeof window.ztools.getPath === 'function') {
      return window.ztools.getPath(name)
    }
  } catch (e) {
    console.warn('[notepluse] getPath failed', name, e)
  }
  return null
}

function getConfigDir() {
  return safeGetPath('userData') || os.homedir()
}

function getConfigPath() {
  const dir = getConfigDir()
  if (safeGetPath('userData')) return path.join(dir, CONFIG_NAME)
  return path.join(dir, '.notepluse-config.json')
}

function legacyConfigPaths() {
  const dir = getConfigDir()
  const inUserData = Boolean(safeGetPath('userData'))
  const paths = []
  for (const name of LEGACY_CONFIG_NAMES) {
    paths.push(path.join(dir, name))
    if (!inUserData) paths.push(path.join(dir, '.' + name))
  }
  if (inUserData) {
    paths.push(path.join(os.homedir(), '.garben-config.json'))
    paths.push(path.join(os.homedir(), '.md-workspace-config.json'))
  }
  return paths
}

function readConfigFile(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (e) {
    console.error('[notepluse] readConfig failed', configPath, e)
  }
  return null
}

function readConfig() {
  const configPath = getConfigPath()
  const current = readConfigFile(configPath)
  if (current && typeof current === 'object') return current

  for (const legacy of legacyConfigPaths()) {
    const data = readConfigFile(legacy)
    if (data && typeof data === 'object') {
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true })
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8')
        console.info('[notepluse] migrated config from', legacy)
      } catch (e) {
        console.warn('[notepluse] config migrate write failed', e)
      }
      return data
    }
  }
  return {}
}

function writeConfig(partial) {
  const configPath = getConfigPath()
  const next = { ...readConfig(), ...partial }
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function sanitizeTitle(title) {
  return (
    String(title || '未命名笔记')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || '未命名笔记'
  )
}

function sanitizeFolderName(name) {
  return (
    String(name || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function normalizeRelFolder(folder) {
  if (!folder) return ''
  return String(folder)
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => sanitizeFolderName(p))
    .filter(Boolean)
    .join('/')
}

function resolveUnderRoot(root, relFolder) {
  const rel = normalizeRelFolder(relFolder)
  if (!rel) return root
  const parts = rel.split('/')
  const full = path.join(root, ...parts)
  const resolvedRoot = path.resolve(root)
  const resolvedFull = path.resolve(full)
  if (resolvedFull !== resolvedRoot && !resolvedFull.startsWith(resolvedRoot + path.sep)) {
    throw new Error('非法文件夹路径: ' + relFolder)
  }
  return full
}

function isRecordFolder(relFolder) {
  const top = normalizeRelFolder(relFolder).split('/')[0] || ''
  return RECORD_FOLDER_NAMES.has(top)
}

function folderKind(relFolder) {
  const top = normalizeRelFolder(relFolder).split('/')[0] || ''
  if (RECORD_FOLDER_NAMES.has(top)) return 'record'
  if (top === '今日待办' || top === '长期待办') return 'todo'
  return 'note'
}

function todayIsoLocal() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function addDaysIso(base, n) {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function ensureSampleNote(root) {
  const workDir = path.join(root, '工作')
  fs.mkdirSync(workDir, { recursive: true })
  const sample = path.join(workDir, '快速开始.md')
  if (fs.existsSync(sample)) return sample

  const date = todayIsoLocal()
  const end = addDaysIso(date, 4)
  const due = addDaysIso(date, 2)
  const content = `# 快速开始

这是一篇普通笔记，不是「只能写周计划」。用文件夹区分个人 / 工作 / 今日 / 长期 / 记录即可。

普通勾选不会进投影：

- [ ] 这是一条普通清单，不会被诺麦笔记收录

<!-- mdw:tasks id="release-plan" name="发布计划" color="violet" -->

## 示例任务

- [ ] 写产品需求 @id(requirements) @start(${date}) @end(${end}) @priority(high) #工作
  - [ ] 整理评审材料 @id(review-kit) @due(${due}) #协作
- [ ] 发布里程碑 @id(release) @type(milestone) @date(${end}) @color(green)

<!-- /mdw:tasks -->

## 记录

灵感和会议纪要写在这里；只有 Task Block 内的 \`- [ ]\` 才会进待办 / 甘特 / 日历。
`

  fs.writeFileSync(sample, content, 'utf8')
  return sample
}

function ensureDefaultFolders(root) {
  for (const name of DEFAULT_FOLDERS) {
    fs.mkdirSync(path.join(root, name), { recursive: true })
  }
}

function getNotesRoot() {
  const cfg = readConfig()
  if (cfg.notesRoot && fs.existsSync(cfg.notesRoot)) {
    ensureDefaultFolders(cfg.notesRoot)
    return cfg.notesRoot
  }

  const documents = safeGetPath('documents') || path.join(os.homedir(), 'Documents')
  const root = path.join(documents, DEFAULT_FOLDER_NAME)
  const isNew = !fs.existsSync(root)
  fs.mkdirSync(root, { recursive: true })
  ensureDefaultFolders(root)
  writeConfig({ notesRoot: root })
  if (isNew) ensureSampleNote(root)
  return root
}

function listFolders() {
  const root = getNotesRoot()
  ensureDefaultFolders(root)
  const folders = []

  function walk(dir, rel) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      return
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      if (ent.name.startsWith('.')) continue
      const nextRel = rel ? rel + '/' + ent.name : ent.name
      const fullPath = path.join(dir, ent.name)
      folders.push({
        name: ent.name,
        path: nextRel,
        fullPath,
        kind: folderKind(nextRel),
      })
      // 仅一层业务文件夹；子目录仍扫描以便扩展
      walk(fullPath, nextRel)
    }
  }

  walk(root, '')

  // 保证默认文件夹按固定顺序靠前
  const order = new Map(DEFAULT_FOLDERS.map((n, i) => [n, i]))
  folders.sort((a, b) => {
    const aTop = a.path.split('/')[0]
    const bTop = b.path.split('/')[0]
    const ai = order.has(aTop) ? order.get(aTop) : 1000
    const bi = order.has(bTop) ? order.get(bTop) : 1000
    if (ai !== bi) return ai - bi
    return a.path.localeCompare(b.path, 'zh-CN')
  })

  return { root, folders, defaults: DEFAULT_FOLDERS.slice() }
}

function createFolder(name, parentFolder) {
  const root = getNotesRoot()
  const parent = normalizeRelFolder(parentFolder || '')
  // 支持多级：name 可为「项目A」或「工作/项目A」；parentFolder 为相对父路径
  const rawName = String(name || '').replace(/\\/g, '/')
  const pieces = rawName
    .split('/')
    .map((p) => sanitizeFolderName(p))
    .filter(Boolean)
  if (!pieces.length) throw new Error('文件夹名称为空')
  const rel = normalizeRelFolder([parent, ...pieces].filter(Boolean).join('/'))
  if (!rel) throw new Error('文件夹名称为空')
  const full = resolveUnderRoot(root, rel)
  const existed = fs.existsSync(full)
  fs.mkdirSync(full, { recursive: true })
  const leaf = pieces[pieces.length - 1]
  return {
    name: leaf,
    path: rel,
    fullPath: full,
    kind: folderKind(rel),
    existed,
  }
}

function renameFolder(relPath, newName) {
  const root = getNotesRoot()
  const rel = normalizeRelFolder(relPath)
  if (!rel) throw new Error('文件夹路径为空')
  const leaf = sanitizeFolderName(newName)
  if (!leaf) throw new Error('文件夹名称为空')
  const from = resolveUnderRoot(root, rel)
  if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) {
    throw new Error('文件夹不存在: ' + rel)
  }
  const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  const nextRel = normalizeRelFolder([parentRel, leaf].filter(Boolean).join('/'))
  if (nextRel === rel) {
    return { name: leaf, path: rel, fullPath: from, kind: folderKind(rel) }
  }
  const to = resolveUnderRoot(root, nextRel)
  if (fs.existsSync(to)) throw new Error('目标文件夹已存在: ' + nextRel)
  fs.renameSync(from, to)
  return { name: leaf, path: nextRel, fullPath: to, kind: folderKind(nextRel) }
}

function deleteFolder(relPath) {
  const root = getNotesRoot()
  const rel = normalizeRelFolder(relPath)
  if (!rel) throw new Error('文件夹路径为空')
  // 默认一级目录不允许删，避免用户误清结构
  if (DEFAULT_FOLDERS.includes(rel)) {
    throw new Error('默认文件夹不可删除: ' + rel)
  }
  const full = resolveUnderRoot(root, rel)
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    throw new Error('文件夹不存在: ' + rel)
  }
  // 仅允许空目录，避免误删笔记
  const entries = fs.readdirSync(full)
  if (entries.length) throw new Error('文件夹非空，请先移走或删除其中的笔记')
  fs.rmdirSync(full)
  return true
}

function walkNotes(dir, relFolder, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue
    const fullPath = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      const nextRel = relFolder ? relFolder + '/' + ent.name : ent.name
      walkNotes(fullPath, nextRel, out)
      continue
    }
    if (!/\.(md|markdown)$/i.test(ent.name)) continue
    try {
      const stat = fs.statSync(fullPath)
      out.push({
        name: ent.name,
        path: fullPath,
        mtime: stat.mtimeMs,
        size: stat.size,
        folder: relFolder || '',
        kind: folderKind(relFolder || ''),
      })
    } catch (e) {
      // skip unreadable
    }
  }
}

function listNotes() {
  const root = getNotesRoot()
  ensureDefaultFolders(root)
  const files = []
  walkNotes(root, '', files)
  files.sort((a, b) => b.mtime - a.mtime)
  const { folders } = listFolders()
  return { root, files, folders }
}

function readNote(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function writeNote(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  return true
}

function defaultNoteBody(title, relFolder) {
  const safe = sanitizeTitle(title)
  if (isRecordFolder(relFolder)) {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `# ${safe}\n\n日期：${y}-${m}-${day}\n\n`
  }
  return `# ${safe}\n\n`
}

/**
 * @param {string} title
 * @param {string} [folder] 相对 notesRoot 的文件夹路径，如「工作」「记录」
 */
function createNote(title, folder, body) {
  const root = getNotesRoot()
  const rel = normalizeRelFolder(folder)
  const dir = resolveUnderRoot(root, rel)
  fs.mkdirSync(dir, { recursive: true })
  const safe = sanitizeTitle(title)
  let filePath = path.join(dir, safe + '.md')
  let i = 1
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${safe}-${i}.md`)
    i += 1
  }
  const content = typeof body === 'string' ? body : defaultNoteBody(safe, rel)
  fs.writeFileSync(filePath, content, 'utf8')
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    folder: rel,
    kind: folderKind(rel),
  }
}

function deleteNote(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return true
}

function renameNote(filePath, newTitle) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('笔记不存在: ' + filePath)
  }
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath) || '.md'
  const safe = sanitizeTitle(newTitle)
  let nextPath = path.join(dir, safe + ext)
  if (path.resolve(nextPath) === path.resolve(filePath)) {
    return { path: filePath, name: path.basename(filePath) }
  }
  let i = 1
  while (fs.existsSync(nextPath)) {
    nextPath = path.join(dir, `${safe}-${i}${ext}`)
    i += 1
  }
  fs.renameSync(filePath, nextPath)
  return { path: nextPath, name: path.basename(nextPath) }
}

function setNotesRoot(dirPath) {
  if (!dirPath) throw new Error('目录路径为空')
  fs.mkdirSync(dirPath, { recursive: true })
  if (!fs.existsSync(dirPath)) {
    throw new Error('目录不存在: ' + dirPath)
  }
  ensureDefaultFolders(dirPath)
  writeConfig({ notesRoot: dirPath })
  return dirPath
}

function getNotesRootPath() {
  return getNotesRoot()
}

function openInFolder(filePath) {
  try {
    let target = filePath
    if (!target || !fs.existsSync(target)) {
      target = getNotesRoot()
    }
    if (window.ztools && typeof window.ztools.shellShowItemInFolder === 'function') {
      window.ztools.shellShowItemInFolder(target)
      return true
    }
    if (window.ztools && typeof window.ztools.shellOpenPath === 'function') {
      const stat = fs.statSync(target)
      window.ztools.shellOpenPath(stat.isDirectory() ? target : path.dirname(target))
      return true
    }
  } catch (e) {
    console.warn('[notepluse] openInFolder failed', e)
  }
  return false
}

function chooseNotesRoot() {
  try {
    if (window.ztools && typeof window.ztools.showOpenDialog === 'function') {
      const result = window.ztools.showOpenDialog({
        title: '选择笔记目录',
        defaultPath: getNotesRoot(),
        properties: ['openDirectory', 'createDirectory'],
      })
      if (Array.isArray(result) && result[0]) {
        return setNotesRoot(result[0])
      }
      return null
    }
  } catch (e) {
    console.warn('[notepluse] chooseNotesRoot failed', e)
  }
  return null
}

window.services = {
  listNotes,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  readNote,
  writeNote,
  createNote,
  deleteNote,
  renameNote,
  setNotesRoot,
  getNotesRootPath,
  openInFolder,
  chooseNotesRoot,
  readConfig,
  writeConfig,
  DEFAULT_FOLDERS,
}
