import { computed, reactive, ref } from 'vue'
import type {
  AppView,
  EditorMode,
  FolderKind,
  FolderMeta,
  GlobalTask,
  NoteGroup,
  NoteMeta,
  SyncProvider,
  TaskBlockTarget,
  UiDensity,
} from '../core/types'
import { parseScheduledTasks, parseTasks, countTasks, parseTaskDocument } from '../core/parseTasks'
import {
  collectGlobalTasks,
  countGlobalTasks,
  type NoteTaskCacheEntry,
} from '../core/globalTasks'
import {
  appendTask,
  toggleTaskDone,
  updateTaskSchedule,
  applyTaskPatch,
  removeTask,
} from '../core/writeTasks'
import type { Task, TaskPatch } from '../core/types'
import { askConfirm, askPrompt } from './uiDialog'
import {
  DEFAULT_SYNC_PROVIDER,
  loadSyncProvider,
  saveSyncProvider,
  getSyncProviderStatus,
} from '../core/webdivSync'

const DEMO_PLAN_PATH = 'demo://工作/快速开始'
const DEFAULT_FOLDERS = ['个人', '工作', '今日待办', '长期待办', '记录']

const notes = ref<NoteMeta[]>([])
const folders = ref<FolderMeta[]>([])
const notesRoot = ref('')
const activePath = ref('')
const activeFolder = ref('')
const content = ref('')
const dirty = ref(false)
const view = ref<AppView>('editor')
const editorMode = ref<EditorMode>('wysiwyg')
const status = ref('')
const saving = ref(false)
const saveError = ref('')
const recentPaths = ref<string[]>([])
const settingsOpen = ref(false)
const syncProvider = ref<SyncProvider>(DEFAULT_SYNC_PROVIDER)
const defaultView = ref<AppView>('editor')
const defaultEditorMode = ref<EditorMode>('wysiwyg')
/** 设置：启用的工作视图（均可关闭；至少保留一个入口） */
const enabledViews = ref<AppView[]>(['editor', 'todo', 'gantt', 'calendar'])
/** 设置：进入时是否默认打开笔记库 */
const libraryDefaultOpen = ref(false)
/** 界面密度：默认紧凑，适配 ZTools 窄窗 */
const uiDensity = ref<UiDensity>('compact')
/** 首次引导是否已完成（可设置里重开） */
const onboardingCompleted = ref(false)
/** 当前会话是否显示引导层 */
const onboardingOpen = ref(false)
/** 桌面小窗偏好（宿主 createBrowserWindow） */
const miniWindowEnabled = ref(false)
/** 0.35–1 desktop sticky surface opacity */
const miniWindowOpacity = ref(0.88)
let miniWindowRef: any = null
/** 内容撤销栈（源码级可靠） */
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let applyingHistory = false
/** 最近删除的笔记（最小撤销） */
const lastDeleted = ref<{ path: string; name: string; content: string; folder: string; kind: FolderKind; expires: number } | null>(null)
const collapsedFolders = ref<Record<string, boolean>>({})
/** demo 模式下的内存内容，避免切笔记丢内容 */
const demoStore = new Map<string, string>()

/** 跨笔记任务扫描缓存（按 path + mtime） */
const allTasksCache = new Map<string, NoteTaskCacheEntry>()
/** 手动 bump，强制 allTasks 重算（例如改了其他笔记） */
const allTasksBump = ref(0)

let saveTimer: ReturnType<typeof setTimeout> | null = null
let openSeq = 0
let flushChain: Promise<boolean> = Promise.resolve(true)
/** 仅首次从 config 套用默认视图/编辑模式，避免刷新笔记时打断当前会话 */
let prefsApplied = false

function isAppView(v: unknown): v is AppView {
  return v === 'editor' || v === 'todo' || v === 'gantt' || v === 'calendar'
}

function isEditorMode(v: unknown): v is EditorMode {
  return v === 'wysiwyg' || v === 'source'
}

function isUiDensity(v: unknown): v is UiDensity {
  return v === 'comfortable' || v === 'compact'
}

function applyDensityToDom(density: UiDensity) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-density', density)
}

function writeUserConfig(partial: Record<string, unknown>) {
  if (window.services && typeof window.services.writeConfig === 'function') {
    return window.services.writeConfig(partial)
  }
  return partial
}

function todayIso() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function todayPlanBody(date: string) {
  return `# 日程页 — ${date}

这是一张可自由编辑的日程页。只有下方明确的 Task Block 会进入待办、日历和甘特视图。

<!-- mdw:tasks id="daily-${date}" name="${date} 日程" color="blue" -->

## 今日焦点

- [ ] 完成一项重要工作 @id(focus-${date}) @date(${date}) @priority(high)

<!-- /mdw:tasks -->

## 记录

`
}

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function formatSaveError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e.trim()) return e.trim()
  return '写入失败，请重试'
}

function rememberRecent(path: string) {
  if (!path) return
  recentPaths.value = [path, ...recentPaths.value.filter((p) => p !== path)].slice(0, 12)
}

function sortNotesByMtime(list: NoteMeta[]): NoteMeta[] {
  return [...list].sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
}

function sanitizeTitle(title: string): string {
  return (
    String(title || '未命名笔记')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || '未命名笔记'
  )
}

function folderKindOf(folder: string): FolderKind {
  const top = (folder || '').split(/[/\\]/)[0] || ''
  if (top === '记录') return 'record'
  if (top === '今日待办' || top === '长期待办') return 'todo'
  return 'note'
}

function ensureFolderList(list: FolderMeta[]): FolderMeta[] {
  const map = new Map(list.map((f) => [f.path, f]))
  for (const name of DEFAULT_FOLDERS) {
    if (!map.has(name)) {
      map.set(name, { name, path: name, kind: folderKindOf(name) })
    }
  }
  const order = new Map(DEFAULT_FOLDERS.map((n, i) => [n, i]))
  return [...map.values()].sort((a, b) => {
    const aTop = a.path.split('/')[0]
    const bTop = b.path.split('/')[0]
    const ai = order.has(aTop) ? (order.get(aTop) as number) : 1000
    const bi = order.has(bTop) ? (order.get(bTop) as number) : 1000
    if (ai !== bi) return ai - bi
    return a.path.localeCompare(b.path, 'zh-CN')
  })
}

function demoInit() {
  notesRoot.value = notesRoot.value || '(demo)'
  folders.value = ensureFolderList(
    DEFAULT_FOLDERS.map((name) => ({ name, path: name, kind: folderKindOf(name) }))
  )
  if (!notes.value.length) {
    const date = todayIso()
    const body = demoContent(date)
    const personalPath = 'demo://个人/购物与琐事'
    const personalBody = samplePersonalBody()
    const todayPath = `demo://今日待办/今日计划-${date}`
    const d = new Date(`${date}T12:00:00`)
    const add = (n: number) => {
      const x = new Date(d)
      x.setDate(x.getDate() + n)
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    }
    demoStore.set(DEMO_PLAN_PATH, body)
    demoStore.set(personalPath, personalBody)
    demoStore.set(todayPath, todayPlanBodyRich(date, add(-1), add(2)))
    notes.value = [
      {
        name: '快速开始.md',
        path: DEMO_PLAN_PATH,
        mtime: Date.now(),
        size: 1,
        folder: '工作',
        kind: 'note',
      },
      {
        name: `今日计划-${date}.md`,
        path: todayPath,
        mtime: Date.now() - 500,
        size: 1,
        folder: '今日待办',
        kind: 'todo',
      },
      {
        name: '购物与琐事.md',
        path: personalPath,
        mtime: Date.now() - 1000,
        size: 1,
        folder: '个人',
        kind: 'note',
      },
    ]
    // 空库仅提供可选示例，不自动打开，避免默认标题绑架首屏
    activePath.value = ''
    activeFolder.value = '工作'
    content.value = ''
  }
}

export function useWorkspace() {

  function loadUiPrefs() {
    try {
      let cfg = (window.services?.readConfig?.() || {}) as Record<string, unknown>
      if (!window.services?.readConfig) {
        try {
          const raw =
            localStorage.getItem('garben-ui-prefs') || localStorage.getItem('mdw-ui-prefs')
          if (raw) cfg = { ...cfg, ...(JSON.parse(raw) as Record<string, unknown>) }
        } catch {}
      }
      if (isAppView(cfg.defaultView)) defaultView.value = cfg.defaultView
      if (isEditorMode(cfg.defaultEditorMode)) defaultEditorMode.value = cfg.defaultEditorMode
      if (Array.isArray(cfg.enabledViews)) {
        const next = (cfg.enabledViews as unknown[]).filter(isAppView) as AppView[]
        if (next.length) enabledViews.value = Array.from(new Set(next))
      }
      if (typeof cfg.libraryDefaultOpen === 'boolean') libraryDefaultOpen.value = cfg.libraryDefaultOpen
      if (typeof cfg.miniWindowEnabled === 'boolean') miniWindowEnabled.value = cfg.miniWindowEnabled
      if (typeof cfg.miniWindowOpacity === 'number' && cfg.miniWindowOpacity >= 0.35 && cfg.miniWindowOpacity <= 1) {
        miniWindowOpacity.value = cfg.miniWindowOpacity
      }
      if (isUiDensity(cfg.uiDensity)) uiDensity.value = cfg.uiDensity
      if (typeof cfg.onboardingCompleted === 'boolean') onboardingCompleted.value = cfg.onboardingCompleted
      applyDensityToDom(uiDensity.value)
      if (!prefsApplied) {
        view.value = defaultView.value
        if (!enabledViews.value.includes(view.value)) {
          view.value = enabledViews.value[0] || 'editor'
        }
        editorMode.value = defaultEditorMode.value
        prefsApplied = true
        if (!onboardingCompleted.value) onboardingOpen.value = true
      }
    } catch {
      applyDensityToDom(uiDensity.value)
    }
  }

  function persistUiPrefs() {
    const payload = {
      defaultView: defaultView.value,
      defaultEditorMode: defaultEditorMode.value,
      enabledViews: enabledViews.value.slice(),
      libraryDefaultOpen: libraryDefaultOpen.value,
      miniWindowEnabled: miniWindowEnabled.value,
      miniWindowOpacity: miniWindowOpacity.value,
      uiDensity: uiDensity.value,
      onboardingCompleted: onboardingCompleted.value,
    }
    if (window.services?.writeConfig) {
      window.services.writeConfig(payload)
      return
    }
    try {
      localStorage.setItem('garben-ui-prefs', JSON.stringify(payload))
    } catch {}
  }

  function setDefaultView(v: AppView) {
    if (!isAppView(v)) return
    defaultView.value = v
    if (enabledViews.value.includes(v)) view.value = v
    else if (!enabledViews.value.includes(defaultView.value) && enabledViews.value[0]) {
      // 默认视图未启用时，启动仍记用户选择；当前会话落到已启用项
      view.value = enabledViews.value[0]
    }
    persistUiPrefs()
    status.value = '已保存默认视图'
  }

  function setDefaultEditorMode(m: EditorMode) {
    if (!isEditorMode(m)) return
    defaultEditorMode.value = m
    editorMode.value = m
    persistUiPrefs()
    status.value = '已保存默认编辑模式'
  }

  function setEnabledViews(list: AppView[]) {
    const next = (list || []).filter(isAppView)
    const uniq = Array.from(new Set<AppView>(next))
    // 至少保留一个导航入口；Markdown 真源不依赖视图开关
    if (!uniq.length) {
      status.value = '请至少保留一个工作视图'
      return
    }
    enabledViews.value = uniq
    if (!uniq.includes(view.value)) view.value = uniq[0]
    // 默认视图可指向已关闭项（下次开启仍记得）；当前会话不会落到关闭项
    persistUiPrefs()
    status.value = '已更新启用视图'
  }

  function toggleEnabledView(v: AppView) {
    if (!isAppView(v)) return
    const set = new Set(enabledViews.value)
    if (set.has(v)) {
      if (set.size <= 1) {
        status.value = '请至少保留一个工作视图'
        return
      }
      set.delete(v)
    } else {
      set.add(v)
    }
    setEnabledViews(Array.from(set))
  }

  function setLibraryDefaultOpen(on: boolean) {
    libraryDefaultOpen.value = !!on
    persistUiPrefs()
  }

  function setUiDensity(d: UiDensity) {
    if (!isUiDensity(d)) return
    uiDensity.value = d
    applyDensityToDom(d)
    persistUiPrefs()
    status.value = d === 'compact' ? '已切换为紧凑显示' : '已切换为舒适显示'
  }

  function completeOnboarding() {
    onboardingCompleted.value = true
    onboardingOpen.value = false
    persistUiPrefs()
    status.value = '已完成引导'
  }

  function skipOnboarding() {
    completeOnboarding()
    status.value = '已跳过引导'
  }

  function restartOnboarding() {
    onboardingCompleted.value = false
    onboardingOpen.value = true
    settingsOpen.value = false
    persistUiPrefs()
    status.value = '已重新开始引导'
  }

  function dismissOnboardingSession() {
    onboardingOpen.value = false
  }

  async function ensureDemoSamples() {
    try {
      const date = todayIso()
      const d = new Date(`${date}T12:00:00`)
      const addDays = (n: number) => {
        const x = new Date(d)
        x.setDate(x.getDate() + n)
        const y = x.getFullYear()
        const m = String(x.getMonth() + 1).padStart(2, '0')
        const day = String(x.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      const yest = addDays(-1)
      const in2 = addDays(2)
      const in4 = addDays(4)
      const in7 = addDays(7)
      const in14 = addDays(14)

      // 多级目录
      if (window.services?.createFolder) {
        for (const [name, parent] of [
          ['示例', '工作'],
          ['本周', '今日待办'],
        ] as const) {
          try {
            ;(window.services as any).createFolder(name, parent)
          } catch {
            /* ignore */
          }
        }
      }

      const seeds: Array<{ folder: string; title: string; body: string; match: (n: NoteMeta) => boolean }> = [
        {
          folder: '工作',
          title: '快速开始',
          body: demoContent(date),
          match: (n) => n.name === '快速开始.md' || n.path.endsWith('/快速开始.md') || n.path.endsWith('\\快速开始.md'),
        },
        {
          folder: '工作/示例',
          title: '示例-待办甘特',
          body: sampleProjectBody(date, yest, in2, in4, in7, in14),
          match: (n) => n.name === '示例-待办甘特.md',
        },
        {
          folder: '今日待办',
          title: `今日计划-${date}`,
          body: todayPlanBodyRich(date, yest, in2),
          match: (n) => n.folder === '今日待办' && n.name.replace(/\.md$/i, '') === `今日计划-${date}`,
        },
        {
          folder: '个人',
          title: '购物与琐事',
          body: samplePersonalBody(),
          match: (n) => n.name === '购物与琐事.md',
        },
        {
          folder: '长期待办',
          title: '季度目标',
          body: sampleLongBody(date, in14, addDays(45)),
          match: (n) => n.name === '季度目标.md',
        },
        {
          folder: '记录',
          title: `灵感-${date}`,
          body: `# 灵感-${date}\n\n日期：${date}\n\n- 便签小窗应像磨砂便签，而不是缩小的主窗口\n- 任务只从显式 Task Block 投影\n`,
          match: (n) => n.folder === '记录' && n.name.startsWith('灵感-'),
        },
      ]

      let created = 0
      let skipped = 0
      let repaired = 0
      for (const seed of seeds) {
        const existing = notes.value.find(seed.match)
        if (existing) {
          // 修复被排版往返弄坏的示例（多余任务组边界会触发诊断条）
          try {
            const disk = window.services?.readNote?.(existing.path)
            const text = typeof disk === 'string' ? disk : ''
            const openN = (text.match(/<!--\s*mdw:tasks\b/gi) || []).length
            const closeN = (text.match(/<!--\s*\/mdw:tasks\s*-->/gi) || []).length
            const broken = !text || openN !== closeN || openN === 0 || text.includes('@id(tmr')
            if (broken && window.services?.writeNote) {
              window.services.writeNote(existing.path, seed.body)
              if (existing.path === activePath.value) {
                content.value = seed.body
                dirty.value = false
              }
              demoStore.set(existing.path, seed.body)
              repaired += 1
              continue
            }
          } catch { /* ignore repair failure */ }
          skipped += 1
          continue
        }
        await createNote(seed.folder, { title: seed.title, body: seed.body })
        created += 1
      }
      await refreshNotes()
      // 打开今日计划，方便立刻看到待办投影
      const todayNote = notes.value.find(
        (n) => n.folder === '今日待办' && n.name.replace(/\.md$/i, '') === `今日计划-${date}`
      )
      let openedTodo = false
      if (todayNote) {
        await openNote(todayNote.path)
        setView('todo')
        openedTodo = true
      }
      if (created === 0 && repaired === 0) {
        status.value = skipped
          ? openedTodo
            ? `示例已齐全（${skipped} 篇），已打开今日计划 → 待办`
            : `示例已齐全（${skipped} 篇）`
          : '示例笔记已存在'
      } else {
        const bits: string[] = []
        if (created) bits.push(`新建 ${created}`)
        if (repaired) bits.push(`修复 ${repaired}`)
        if (skipped) bits.push(`跳过 ${skipped}`)
        const base = `示例：${bits.join(' · ')}`
        status.value = openedTodo ? `${base}，已切换到待办视图` : base
      }
    } catch (e) {
      console.warn(e)
      status.value = '创建示例失败'
    }
  }

  function openMiniWindow() {
    try {
      if (typeof window.ztools?.createBrowserWindow !== 'function') {
        status.value = '当前宿主不支持桌面小窗'
        return
      }
      if (miniWindowRef) {
        try {
          if (typeof miniWindowRef.isDestroyed === 'function' && miniWindowRef.isDestroyed()) {
            miniWindowRef = null
          } else if (typeof miniWindowRef.focus === 'function') {
            miniWindowRef.focus()
            if (typeof miniWindowRef.show === 'function') miniWindowRef.show()
            if (typeof miniWindowRef.moveTop === 'function') miniWindowRef.moveTop()
            return
          }
        } catch {
          miniWindowRef = null
        }
      }
      // 小窗：无标题栏、透明磨砂、置顶、不占任务栏
      const url = 'index.html?mode=mini'
      miniWindowRef = window.ztools.createBrowserWindow(
        url,
        {
          width: 300,
          height: 420,
          minWidth: 240,
          minHeight: 280,
          resizable: true,
          maximizable: false,
          minimizable: false,
          fullscreenable: false,
          title: '稿笺 · 今日',
          frame: false,
          transparent: true,
          hasShadow: false,
          backgroundColor: '#00000000',
          skipTaskbar: true,
          alwaysOnTop: true,
          webPreferences: {
            zoomFactor: 1,
          },
        } as any,
        () => {
          try {
            if (miniWindowRef && typeof miniWindowRef.setAlwaysOnTop === 'function') {
              miniWindowRef.setAlwaysOnTop(true)
            }
            if (miniWindowRef && typeof miniWindowRef.setSkipTaskbar === 'function') {
              miniWindowRef.setSkipTaskbar(true)
            }
            if (miniWindowRef && typeof miniWindowRef.setBackgroundColor === 'function') {
              miniWindowRef.setBackgroundColor('#00000000')
            }
            applyMiniWindowOpacity()
          } catch {
            /* ignore host quirks */
          }
        }
      )
      miniWindowEnabled.value = true
      persistUiPrefs()
      status.value = '已打开桌面稿笺'
    } catch (e) {
      console.warn('[garben] openMiniWindow failed', e)
      status.value = '打开小窗失败'
    }
  }

  function closeMiniWindow() {
    try {
      if (miniWindowRef && typeof miniWindowRef.close === 'function') miniWindowRef.close()
    } catch {
      /* ignore */
    }
    miniWindowRef = null
    miniWindowEnabled.value = false
    persistUiPrefs()
  }

  function toggleMiniWindow(on?: boolean) {
    const next = typeof on === 'boolean' ? on : !miniWindowEnabled.value
    if (next) openMiniWindow()
    else closeMiniWindow()
  }

  function applyMiniWindowOpacity(opacity?: number) {
    const o = typeof opacity === 'number' ? opacity : miniWindowOpacity.value
    const clamped = Math.min(1, Math.max(0.35, o))
    try {
      if (miniWindowRef && typeof miniWindowRef.setOpacity === 'function') {
        miniWindowRef.setOpacity(clamped)
      }
    } catch { /* ignore */ }
    try {
      if (miniWindowRef && typeof miniWindowRef.webContents?.executeJavaScript === 'function') {
        miniWindowRef.webContents.executeJavaScript(
          `document.documentElement.style.setProperty('--mini-opacity', '${clamped}');`
        )
      }
    } catch { /* ignore */ }
  }

  function setMiniWindowOpacity(opacity: number) {
    const clamped = Math.min(1, Math.max(0.35, Number(opacity) || 0.88))
    miniWindowOpacity.value = clamped
    applyMiniWindowOpacity(clamped)
    persistUiPrefs()
    status.value = `小窗透明度 ${Math.round(clamped * 100)}%`
  }

  function focusMainPluginWindow() {
    try {
      const z = window.ztools as any
      if (typeof z?.showMainWindow === 'function') {
        z.showMainWindow()
        return true
      }
      if (typeof z?.showPlugin === 'function') {
        z.showPlugin()
        return true
      }
      if (typeof z?.openPlugin === 'function') {
        z.openPlugin()
        return true
      }
      if (typeof z?.getCurrentWindow === 'function') {
        const w = z.getCurrentWindow()
        w?.show?.()
        w?.focus?.()
        return true
      }
      // 主页面监听 BroadcastChannel('mdw-plugin')
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('mdw-plugin')
        ch.postMessage({ type: 'focus-main' })
        ch.close()
        // broadcast 不保证主窗仍存活，返回 false 让调用方提示用户
        return false
      }
    } catch { /* ignore */ }
    return false
  }


  function pushUndoSnapshot(prev: string) {
    if (applyingHistory) return
    if (undoStack.value.length && undoStack.value[undoStack.value.length - 1] === prev) return
    undoStack.value = [...undoStack.value.slice(-40), prev]
    redoStack.value = []
  }

  function undoContent(): boolean {
    if (!undoStack.value.length) {
      status.value = '没有可撤销的编辑'
      return false
    }
    const prev = undoStack.value[undoStack.value.length - 1]
    undoStack.value = undoStack.value.slice(0, -1)
    redoStack.value = [...redoStack.value, content.value]
    applyingHistory = true
    content.value = prev
    if (activePath.value.startsWith('demo://')) demoStore.set(activePath.value, prev)
    dirty.value = true
    saveError.value = ''
    scheduleSave()
    applyingHistory = false
    status.value = '已撤销'
    return true
  }

  function redoContent(): boolean {
    if (!redoStack.value.length) {
      status.value = '没有可重做的编辑'
      return false
    }
    const next = redoStack.value[redoStack.value.length - 1]
    redoStack.value = redoStack.value.slice(0, -1)
    undoStack.value = [...undoStack.value, content.value]
    applyingHistory = true
    content.value = next
    if (activePath.value.startsWith('demo://')) demoStore.set(activePath.value, next)
    dirty.value = true
    saveError.value = ''
    scheduleSave()
    applyingHistory = false
    status.value = '已重做'
    return true
  }

  /** 扫描与打开笔记严格只读；绝不自动补写任务 ID。 */
  function maybeStamp(md: string): { text: string; changed: boolean } {
    return { text: md, changed: false }
  }

  const activeTaskDocument = computed(() => parseTaskDocument(content.value))
  const tasks = computed(() => activeTaskDocument.value.tasks)
  const taskBlocks = computed(() => activeTaskDocument.value.blocks)
  const taskDiagnostics = computed(() => activeTaskDocument.value.diagnostics)
  const preferredTaskBlockId = computed(() => taskBlocks.value.find((block) => block.isValid)?.id || '')
  const scheduledTasks = computed(() => parseScheduledTasks(content.value))
  const taskStats = computed(() => countTasks(content.value))
  const activeNote = computed(() => notes.value.find((n) => n.path === activePath.value) || null)
  const isEmptyWorkspace = computed(() => notes.value.length === 0)

  /** 当前文件夹最近 3 篇：优先最近打开，不足用 mtime 补齐 */
  const recentNotes = computed<NoteMeta[]>(() => {
    const folder = activeFolder.value || ''
    const inFolder = notes.value.filter((n) => (n.folder || '') === folder)
    const byPath = new Map(inFolder.map((n) => [n.path, n]))
    const picked: NoteMeta[] = []
    for (const path of recentPaths.value) {
      const note = byPath.get(path)
      if (!note) continue
      picked.push(note)
      if (picked.length >= 3) return picked
    }
    for (const note of sortNotesByMtime(inFolder)) {
      if (picked.some((n) => n.path === note.path)) continue
      picked.push(note)
      if (picked.length >= 3) break
    }
    return picked
  })

  function readNoteMarkdown(filePath: string): string {
    if (!filePath) return ''
    if (filePath.startsWith('demo://')) return demoStore.get(filePath) || ''
    if (!window.services?.readNote) return ''
    return window.services.readNote(filePath)
  }

  /** 跨笔记全部显式待办（mtime 缓存；当前笔记用内存 content） */
  const allTasks = computed<GlobalTask[]>(() => {
    void allTasksBump.value
    return collectGlobalTasks(notes.value, {
      readContent: readNoteMarkdown,
      cache: allTasksCache,
      activePath: activePath.value,
      activeContent: content.value,
    })
  })

  const allTaskStats = computed(() => countGlobalTasks(allTasks.value))

  /**
   * 跨笔记可写目标索引。即使一个合法 Task Block 仍为空，也必须出现在选择器中；
   * 这使新建任务始终是“用户选择笔记 + Block”的显式写入，而不是隐式兜底。
   */
  const taskBlockTargets = computed<TaskBlockTarget[]>(() => {
    void allTasksBump.value
    const targets: TaskBlockTarget[] = []
    for (const note of notes.value) {
      let markdown = ''
      try {
        markdown = note.path === activePath.value ? content.value : readNoteMarkdown(note.path)
      } catch {
        continue
      }
      const parsed = parseTaskDocument(markdown || '')
      for (const block of parsed.blocks) {
        if (!block.isValid || !block.id) continue
        targets.push({
          notePath: note.path,
          noteName: note.name.replace(/\.md$/i, '') || '未命名笔记',
          folder: note.folder || '',
          blockId: block.id,
          blockName: block.name || block.id,
          color: block.color,
        })
      }
    }
    return targets.sort((a, b) => {
      const byNote = a.noteName.localeCompare(b.noteName, 'zh-CN')
      return byNote || a.blockName.localeCompare(b.blockName, 'zh-CN')
    })
  })

  function invalidateTaskCache(filePath?: string) {
    if (filePath) allTasksCache.delete(filePath)
    else allTasksCache.clear()
    allTasksBump.value++
  }

  function touchNoteMeta(filePath: string, md: string) {
    const note = notes.value.find((n) => n.path === filePath)
    if (note) {
      note.mtime = Date.now()
      note.size = md.length
    }
  }

  function writeNoteMarkdown(filePath: string, md: string) {
    if (filePath.startsWith('demo://')) {
      demoStore.set(filePath, md)
      touchNoteMeta(filePath, md)
      invalidateTaskCache(filePath)
      return
    }
    if (!window.services?.writeNote) return
    window.services.writeNote(filePath, md)
    touchNoteMeta(filePath, md)
    invalidateTaskCache(filePath)
  }

  /** 对任意笔记应用文本变换（当前笔记走 setContent） */
  function applyToNote(filePath: string, transform: (md: string) => string) {
    if (!filePath) return
    if (filePath === activePath.value) {
      setContent(transform(content.value))
      return
    }
    const md = readNoteMarkdown(filePath)
    const next = transform(md)
    if (next !== md) writeNoteMarkdown(filePath, next)
  }


  /** 侧栏：按文件夹分组的笔记列表 */
  const noteGroups = computed<NoteGroup[]>(() => {
    const folderList = ensureFolderList(folders.value)
    const byFolder = new Map<string, NoteMeta[]>()
    for (const n of notes.value) {
      const key = n.folder || ''
      if (!byFolder.has(key)) byFolder.set(key, [])
      byFolder.get(key)!.push(n)
    }
    const groups: NoteGroup[] = []
    const seen = new Set<string>()

    for (const f of folderList) {
      seen.add(f.path)
      groups.push({
        folder: f.path,
        label: f.path,
        kind: f.kind,
        notes: sortNotesByMtime(byFolder.get(f.path) || []),
      })
    }

    // 根目录笔记
    if ((byFolder.get('') || []).length) {
      groups.unshift({
        folder: '',
        label: '未分类',
        kind: 'note',
        notes: sortNotesByMtime(byFolder.get('') || []),
      })
      seen.add('')
    }

    // 其它未登记文件夹
    for (const [key, list] of byFolder) {
      if (seen.has(key)) continue
      groups.push({
        folder: key,
        label: key || '未分类',
        kind: folderKindOf(key),
        notes: sortNotesByMtime(list),
      })
    }

    return groups
  })

  const syncStatus = computed(() => getSyncProviderStatus(syncProvider.value))

  function loadSettingsFromConfig() {
    try {
      const cfg = (window.services?.readConfig?.() || {}) as Record<string, unknown>
      syncProvider.value = loadSyncProvider(cfg)

      const cfgView = isAppView(cfg.defaultView) ? cfg.defaultView : 'editor'
      const cfgMode = isEditorMode(cfg.defaultEditorMode) ? cfg.defaultEditorMode : 'wysiwyg'
      defaultView.value = cfgView
      defaultEditorMode.value = cfgMode

      if (!prefsApplied) {
        view.value = cfgView
        editorMode.value = cfgMode
        prefsApplied = true
      }
    } catch {
      syncProvider.value = DEFAULT_SYNC_PROVIDER
      if (!prefsApplied) {
        defaultView.value = 'editor'
        defaultEditorMode.value = 'wysiwyg'
        view.value = 'editor'
        editorMode.value = 'wysiwyg'
        prefsApplied = true
      }
    }
  }

  async function setSyncProvider(provider: SyncProvider) {
    if (provider === 'webdiv') {
      const st = getSyncProviderStatus('webdiv')
      if (!st.ready) {
        status.value = 'WebDIV 尚未接通，无法启用'
        return
      }
    }
    syncProvider.value = provider
    try {
      if (window.services && typeof window.services.writeConfig === 'function') {
        saveSyncProvider((partial) => window.services.writeConfig(partial), provider)
      } else {
        writeUserConfig({ syncProvider: provider })
      }
      status.value =
        provider === 'webdiv' ? '已选择 WebDIV（预留，未接通）' : '已使用本地文件'
    } catch (e) {
      status.value = '保存同步设置失败'
      console.error(e)
    }
  }

  async function refreshNotes() {
    loadUiPrefs()
    if (!window.services?.listNotes) {
      demoInit()
      notes.value = sortNotesByMtime(notes.value)
      if (!activePath.value || !notes.value.find((n) => n.path === activePath.value)) {
        const first = notes.value[0]
        if (first) await openNote(first.path)
      }
      return
    }

    loadSettingsFromConfig()
    const res = window.services.listNotes()
    notesRoot.value = res.root
    notes.value = sortNotesByMtime(
      (res.files || []).map((f) => ({
        ...f,
        folder: f.folder || '',
        kind: f.kind || folderKindOf(f.folder || ''),
      }))
    )
    if (res.folders && res.folders.length) {
      folders.value = ensureFolderList(
        res.folders.map((f) => ({
          name: f.name,
          path: f.path,
          fullPath: f.fullPath,
          kind: f.kind || folderKindOf(f.path),
        }))
      )
    } else if (window.services.listFolders) {
      const lf = window.services.listFolders()
      folders.value = ensureFolderList(
        (lf.folders || []).map((f) => ({
          name: f.name,
          path: f.path,
          fullPath: f.fullPath,
          kind: f.kind || folderKindOf(f.path),
        }))
      )
    } else {
      folders.value = ensureFolderList([])
    }

    if (!activePath.value && res.files[0]) {
      await openNote(res.files[0].path)
    } else if (activePath.value && !res.files.find((f) => f.path === activePath.value)) {
      if (res.files[0]) await openNote(res.files[0].path)
      else {
        activePath.value = ''
        content.value = ''
      }
    }
  }

  async function openNote(filePath: string) {
    if (!filePath) return
    if (filePath === activePath.value) {
      rememberRecent(filePath)
      return
    }

    const seq = ++openSeq
    clearSaveTimer()

    // 切换前先落盘；失败则中止，避免未保存内容被覆盖丢失
    if (dirty.value && activePath.value) {
      const ok = await flushSave()
      if (!ok) {
        status.value = '保存失败，请重试后再切换'
        return
      }
    }
    if (seq !== openSeq) return

    activePath.value = filePath
    const meta = notes.value.find((n) => n.path === filePath)
    if (meta) activeFolder.value = meta.folder || ''

    let next = ''
    if (filePath.startsWith('demo://')) {
      if (!demoStore.has(filePath)) {
        if (filePath === DEMO_PLAN_PATH) {
          demoStore.set(filePath, demoContent())
        } else {
          const note = notes.value.find((n) => n.path === filePath)
          const title = note ? note.name.replace(/\.md$/i, '') : '新笔记'
          demoStore.set(filePath, `# ${title}\n\n`)
        }
      }
      next = demoStore.get(filePath) || ''
    } else {
      next = window.services?.readNote ? window.services.readNote(filePath) : ''
    }

    if (seq !== openSeq) return

    // 可选：仅对显式任务行补 ID；关闭后纯浏览不落盘改写
    undoStack.value = []
    redoStack.value = []
    const { text: stamped, changed } = maybeStamp(next)
    content.value = stamped
    if (filePath.startsWith('demo://')) {
      demoStore.set(filePath, stamped)
    }
    dirty.value = changed
    saveError.value = ''
    status.value = changed ? '已补全任务 ID' : ''
    rememberRecent(filePath)
    if (changed) scheduleSave()
  }

  function setContent(next: string, markDirty = true) {
    const { text: stamped } = maybeStamp(next)
    if (markDirty && !applyingHistory && stamped !== content.value) {
      pushUndoSnapshot(content.value)
    }
    content.value = stamped
    if (activePath.value.startsWith('demo://')) {
      demoStore.set(activePath.value, stamped)
    }
    if (markDirty) {
      dirty.value = true
      saveError.value = ''
      scheduleSave()
    }
  }

  function scheduleSave() {
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      void flushSave()
    }, 450)
  }

  /**
   * 将当前脏内容写入磁盘/内存。
   * @returns true 表示目标快照已成功落盘（或本就无需保存）
   */
  async function flushSave(): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      clearSaveTimer()
      if (!dirty.value || !activePath.value) {
        if (!dirty.value && activePath.value && !saveError.value) status.value = '已保存'
        return true
      }

      // 冻结路径与内容，避免切换/连点导致写错文件或清错 dirty
      const path = activePath.value
      const body = content.value

      if (path.startsWith('demo://')) {
        demoStore.set(path, body)
        if (activePath.value === path && content.value === body) {
          dirty.value = false
          saveError.value = ''
          status.value = '已保存'
        } else if (activePath.value === path) {
          // 保存期间又改了：保持 dirty，稍后自动再存
          saveError.value = ''
          scheduleSave()
        }
        const note = notes.value.find((n) => n.path === path)
        if (note) note.mtime = Date.now()
        notes.value = sortNotesByMtime(notes.value)
        invalidateTaskCache(path)
        return true
      }

      if (!window.services?.writeNote) {
        saveError.value = '当前环境无法写入文件'
        status.value = '保存失败'
        return false
      }

      saving.value = true
      try {
        window.services.writeNote(path, body)
        if (activePath.value === path) {
          if (content.value === body) {
            dirty.value = false
            saveError.value = ''
            status.value = '已保存'
          } else {
            // 写入成功但之后又编辑了
            saveError.value = ''
            status.value = '未保存'
            scheduleSave()
          }
        } else {
          // 已切到其他笔记：旧笔记内容已落盘
          saveError.value = saveError.value
        }
        invalidateTaskCache(path)
        // 仅刷新列表元数据，不重载当前正文
        try {
          await refreshNotes()
        } catch (e) {
          console.warn('[garben] refresh after save failed', e)
        }
        return true
      } catch (e) {
        saveError.value = formatSaveError(e)
        status.value = '保存失败'
        console.error(e)
        return false
      } finally {
        saving.value = false
      }
    }

    const next = flushChain.then(run, run)
    flushChain = next.then(
      () => true,
      () => false
    )
    return next
  }

  async function retrySave(): Promise<boolean> {
    if (!activePath.value) return false
    if (!dirty.value && !saveError.value) {
      status.value = '已保存'
      return true
    }
    // 失败后 dirty 仍为 true；若异常清空则强制再写一次当前内容
    if (!dirty.value && saveError.value) dirty.value = true
    status.value = '正在重试保存…'
    return flushSave()
  }

  /**
   * @param folder 目标文件夹相对路径；省略时用当前 activeFolder
   */
  async function createNote(folder?: string, options?: { title?: string; body?: string }) {
    let targetFolder = folder !== undefined ? folder : activeFolder.value || ''
    // 兼容「工作/示例」这类把路径误塞进 title 的调用：若 options 里无 title 且 folder 含 /
    // 仍按 folder 建目录
    const kind = folderKindOf(targetFolder)
    const date = todayIso()
    const title = options?.title || (kind === 'record' ? `记录-${date}` : `笔记-${date}`)
    const body =
      options?.body !== undefined
        ? options.body
        : kind === 'record'
          ? `# ${title}\n\n日期：${date}\n\n`
          : `# ${title}\n\n`

    if (dirty.value && activePath.value) {
      const ok = await flushSave()
      if (!ok) {
        status.value = '保存失败，请重试后再新建'
        return
      }
    }

    if (!window.services?.createNote) {
      const path = `demo://${targetFolder ? targetFolder + '/' : ''}${Date.now()}`
      const stamped = body
      demoStore.set(path, stamped)
      notes.value = sortNotesByMtime([
        {
          name: title + '.md',
          path,
          mtime: Date.now(),
          size: stamped.length,
          folder: targetFolder,
          kind,
        },
        ...notes.value,
      ])
      activeFolder.value = targetFolder
      activePath.value = path
      content.value = stamped
      dirty.value = false
      saveError.value = ''
      status.value = ''
      rememberRecent(path)
      invalidateTaskCache()
      return
    }

    const note = window.services.createNote(title, targetFolder || undefined, body)
    if (typeof options?.body === 'string' && window.services.writeNote && note.path) {
      try {
        window.services.writeNote(note.path, options.body)
      } catch {
        /* ignore */
      }
    }
    activeFolder.value = note.folder || targetFolder
    await refreshNotes()
    await openNote(note.path)
  }

  async function createTodayPlan() {
    const date = todayIso()
    const title = `今日计划-${date}`
    const existing = notes.value.find(
      (n) => n.folder === '今日待办' && n.name.replace(/\.md$/i, '') === title
    )
    if (existing) {
      await openNote(existing.path)
      status.value = '已打开今日计划'
      return
    }
    await createNote('今日待办', { title, body: todayPlanBody(date) })
    status.value = '已新建今日计划'
  }

  async function openSampleNote() {
    const sample = notes.value.find(
      (n) =>
        n.name === '快速开始.md' ||
        n.path.endsWith('/快速开始.md') ||
        n.path.endsWith('\\快速开始.md') ||
        n.path === DEMO_PLAN_PATH
    )
    if (sample) {
      await openNote(sample.path)
      status.value = '已打开示例笔记'
      return
    }
    await createNote('工作', { title: '快速开始', body: demoContent() })
    status.value = '已创建示例笔记'
  }

  async function createFolder(name?: string, parentFolder?: string) {
    const parent = parentFolder !== undefined ? parentFolder : activeFolder.value || ''
    const raw =
      name ||
      (await askPrompt({
        title: parent ? '新建子文件夹' : '新建文件夹',
        message: parent
          ? `在「${parent}」下新建子文件夹。也可用 父/子 路径一次建多级。`
          : '支持多级路径，例如：工作/项目A',
        placeholder: parent ? '子文件夹名' : '例如：个人 · 工作/项目A',
        confirmText: '创建',
      }))
    if (!raw) return
    const input = String(raw).replace(/\\/g, '/').trim()
    if (!input) return

    if (!window.services?.createFolder) {
      const rel = [parent, ...input.split('/').map((s) => s.trim()).filter(Boolean)]
        .filter(Boolean)
        .join('/')
      if (!folders.value.find((f) => f.path === rel)) {
        folders.value = ensureFolderList([
          ...folders.value,
          { name: rel.split('/').pop() || rel, path: rel, kind: folderKindOf(rel) },
        ])
      }
      activeFolder.value = rel
      status.value = '已新建文件夹（演示）'
      return
    }

    try {
      const folder = (window.services as any).createFolder(input, parent)
      activeFolder.value = folder.path
      status.value = folder.existed ? '文件夹已存在' : '已新建文件夹'
      await refreshNotes()
    } catch (e) {
      status.value = '新建文件夹失败'
      console.error(e)
    }
  }

  function setActiveFolder(folder: string) {
    activeFolder.value = folder
  }

  function toggleFolderCollapse(folder: string) {
    collapsedFolders.value = {
      ...collapsedFolders.value,
      [folder]: !collapsedFolders.value[folder],
    }
  }

  function isFolderCollapsed(folder: string) {
    return !!collapsedFolders.value[folder]
  }

  async function renameNote(filePath: string, newTitle: string) {
    const safe = sanitizeTitle(newTitle)
    if (!safe) return

    if (filePath.startsWith('demo://') || !window.services?.renameNote) {
      const note = notes.value.find((n) => n.path === filePath)
      if (!note) return
      note.name = safe + '.md'
      note.mtime = Date.now()
      notes.value = sortNotesByMtime(notes.value)
      status.value = '已重命名'
      return
    }

    try {
      if (dirty.value && activePath.value === filePath) {
        const ok = await flushSave()
        if (!ok) {
          status.value = '保存失败，请重试后再重命名'
          return
        }
      }
      const result = window.services.renameNote(filePath, safe)
      if (activePath.value === filePath) activePath.value = result.path
      status.value = '已重命名'
      await refreshNotes()
    } catch (e) {
      status.value = '重命名失败'
      console.error(e)
    }
  }

    async function removeNote(filePath: string) {
    const ok = await askConfirm({
      title: '删除笔记',
      message: '确定删除这篇笔记？\n删除后可在 30 秒内撤销。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    const note = notes.value.find((n) => n.path === filePath)
    let body = ''
    try {
      if (filePath === activePath.value) body = content.value
      else body = readNoteMarkdown(filePath)
    } catch {
      body = ''
    }
    lastDeleted.value = {
      path: filePath,
      name: note?.name || '笔记.md',
      content: body,
      folder: note?.folder || '',
      kind: note?.kind || 'note',
      expires: Date.now() + 30_000,
    }
    if (window.services?.deleteNote && !filePath.startsWith('demo://')) {
      window.services.deleteNote(filePath)
    }
    demoStore.delete(filePath)
    notes.value = notes.value.filter((n) => n.path !== filePath)
    invalidateTaskCache(filePath)
    status.value = '已删除，30 秒内可撤销'
    if (activePath.value === filePath) {
      activePath.value = ''
      content.value = ''
      dirty.value = false
      undoStack.value = []
      redoStack.value = []
      if (notes.value[0]) await openNote(notes.value[0].path)
    }
  }

  async function undoDeleteNote() {
    const item = lastDeleted.value
    if (!item || Date.now() > item.expires) {
      status.value = '没有可撤销的删除'
      lastDeleted.value = null
      return
    }
    lastDeleted.value = null
    if (item.path.startsWith('demo://') || !window.services?.writeNote) {
      demoStore.set(item.path, item.content)
      notes.value = sortNotesByMtime([
        {
          name: item.name,
          path: item.path,
          mtime: Date.now(),
          size: item.content.length,
          folder: item.folder,
          kind: item.kind,
        },
        ...notes.value.filter((n) => n.path !== item.path),
      ])
      await openNote(item.path)
      status.value = '已恢复删除的笔记'
      return
    }
    // 写回原路径
    window.services.writeNote(item.path, item.content)
    await refreshNotes()
    await openNote(item.path)
    status.value = '已恢复删除的笔记'
  }

  async function changeNotesRoot(dirPath?: string | null) {
    if (dirty.value) {
      const ok = await flushSave()
      if (!ok) {
        status.value = '保存失败，请重试后再切换目录'
        return
      }
    }
    invalidateTaskCache()

    let target = dirPath || null
    if (!target && window.services?.chooseNotesRoot) {
      target = window.services.chooseNotesRoot()
      if (!target) return
    } else if (!target && window.ztools?.showOpenDialog) {
      const result = window.ztools.showOpenDialog({
        title: '选择笔记目录',
        defaultPath: notesRoot.value || undefined,
        properties: ['openDirectory', 'createDirectory'],
      })
      if (!result || !result[0]) return
      target = result[0]
    } else if (!target) {
      const input = await askPrompt({
        title: '笔记目录',
        message: '请输入本机笔记根目录路径（正式环境请用选择文件夹）。',
        defaultValue: notesRoot.value || '',
        placeholder: '例如 D:\\Notes',
        confirmText: '切换',
      })
      if (!input) return
      target = input
    }

    try {
      if (window.services?.setNotesRoot) {
        notesRoot.value = window.services.setNotesRoot(target)
      } else {
        notesRoot.value = target
        notes.value = []
      }
      activePath.value = ''
      content.value = ''
      dirty.value = false
      status.value = '已切换目录'
      await refreshNotes()
      settingsOpen.value = false
    } catch (e) {
      status.value = '切换目录失败'
      console.error(e)
    }
  }

  function openInFolder(filePath?: string) {
    const target = filePath || activePath.value || notesRoot.value
    if (!target || target.startsWith('demo://') || target === '(demo)') {
      if (window.services?.openInFolder && notesRoot.value && notesRoot.value !== '(demo)') {
        const ok = window.services.openInFolder(notesRoot.value)
        status.value = ok ? '已在资源管理器打开' : '打开失败'
        return
      }
      status.value = '演示模式无法打开文件夹'
      return
    }
    if (!window.services?.openInFolder) {
      status.value = '当前环境不支持打开文件夹'
      return
    }
    const ok = window.services.openInFolder(target)
    status.value = ok ? '已在资源管理器打开' : '打开失败'
  }

  function setView(v: AppView, opts?: { force?: boolean }) {
    if (!isAppView(v)) return
    if (!opts?.force && !enabledViews.value.includes(v)) {
      const fallback = enabledViews.value[0]
      if (fallback) view.value = fallback
      return
    }
    // force：从任务「在源码中打开」等路径临时进入笔记，即使导航关闭
    if (opts?.force && !enabledViews.value.includes(v) && v === 'editor') {
      view.value = v
      return
    }
    if (!enabledViews.value.includes(v) && !opts?.force) return
    view.value = v
  }

  function setEditorMode(m: EditorMode) {
    editorMode.value = m
  }

  function setSettingsOpen(open: boolean) {
    settingsOpen.value = open
  }

  function patchTask(task: Task, patch: TaskPatch) {
    setContent(applyTaskPatch(content.value, task, patch))
  }

  function onToggleTask(taskId: string) {
    setContent(toggleTaskDone(content.value, taskId))
  }

  function onScheduleChange(taskId: string, start?: string | null, end?: string | null) {
    setContent(updateTaskSchedule(content.value, taskId, start, end))
  }

  /** 新任务只能写入用户明确选择的笔记与合法 Task Block，绝不隐式创建“今日计划”。 */
  async function onAddTask(
    input: {
      title: string
      date?: string
      due?: string
      start?: string
      end?: string
      type?: Task['type']
      priority?: Task['priority']
      color?: Task['color']
      tags?: string[]
    },
    target?: { notePath?: string; blockId?: string }
  ): Promise<boolean> {
    const path = target?.notePath
    const blockId = target?.blockId
    if (!path || !blockId) {
      status.value = '请选择目标笔记和 Task Block 后再新建任务'
      return false
    }
    const append = (md: string) => appendTask(md, { ...input, blockId })
    if (path === activePath.value) {
      const next = append(content.value)
      if (next === content.value) {
        status.value = '目标 Task Block 不存在、不可写或任务日期无效'
        return false
      }
      setContent(next)
      return true
    }
    const before = readNoteMarkdown(path)
    const next = append(before)
    if (next === before) {
      status.value = '目标 Task Block 不存在、不可写或任务日期无效'
      return false
    }
    writeNoteMarkdown(path, next)
    status.value = '已添加任务'
    return true
  }

  function onRemoveTask(taskId: string) {
    setContent(removeTask(content.value, taskId))
  }

  function onToggleGlobalTask(task: GlobalTask) {
    applyToNote(task.notePath, (md) => toggleTaskDone(md, task.id))
  }

  function onScheduleGlobalTask(task: GlobalTask, start?: string | null, end?: string | null) {
    applyToNote(task.notePath, (md) => updateTaskSchedule(md, task.id, start, end))
  }

  function patchGlobalTask(task: GlobalTask, patch: TaskPatch) {
    applyToNote(task.notePath, (md) => applyTaskPatch(md, task, patch))
  }

  function onRemoveGlobalTask(task: GlobalTask) {
    applyToNote(task.notePath, (md) => removeTask(md, task.id))
  }

  /** 打开源笔记并切到待办视图（便于定位） */
  /** 打开源笔记；可选切到编辑视图便于改原文 */
  async function openGlobalTask(task: GlobalTask, opts?: { view?: AppView }) {
    if (task.notePath && task.notePath !== activePath.value) {
      await openNote(task.notePath)
    }
    const target = opts?.view || 'editor'
    setView(target, { force: target === 'editor' })
  }

  return reactive({
    notes,
    folders,
    noteGroups,
    notesRoot,
    activePath,
    activeFolder,
    content,
    dirty,
    view,
    editorMode,
    status,
    saving,
    saveError,
    recentNotes,
    settingsOpen,
    syncProvider,
    syncStatus,
    defaultView,
    defaultEditorMode,
    enabledViews,
    libraryDefaultOpen,
    uiDensity,
    onboardingCompleted,
    onboardingOpen,
    miniWindowEnabled,
    miniWindowOpacity,
    lastDeleted,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    collapsedFolders,
    activeTaskDocument,
    taskBlocks,
    taskDiagnostics,
    taskBlockTargets,
    preferredTaskBlockId,
    tasks,
    scheduledTasks,
    taskStats,
    allTasks,
    allTaskStats,
    activeNote,
    isEmptyWorkspace,
    refreshNotes,
    openNote,
    setContent,
    flushSave,
    retrySave,
    createNote,
    createTodayPlan,
    openSampleNote,
    createFolder,
    setActiveFolder,
    toggleFolderCollapse,
    isFolderCollapsed,
    renameNote,
    removeNote,
    changeNotesRoot,
    openInFolder,
    setView,
    setEditorMode,
    setSettingsOpen,
    setSyncProvider,
    setDefaultView,
    setDefaultEditorMode,
    setEnabledViews,
    toggleEnabledView,
    setLibraryDefaultOpen,
    setUiDensity,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
    dismissOnboardingSession,
    openMiniWindow,
    closeMiniWindow,
    toggleMiniWindow,
    setMiniWindowOpacity,
    applyMiniWindowOpacity,
    focusMainPluginWindow,
    ensureDemoSamples,
    undoContent,
    redoContent,
    undoDeleteNote,
    patchTask,
    onToggleTask,
    onScheduleChange,
    onAddTask,
    onRemoveTask,
    onToggleGlobalTask,
    onScheduleGlobalTask,
    patchGlobalTask,
    onRemoveGlobalTask,
    openGlobalTask,
    invalidateTaskCache,
  })
}

function demoContent(baseDate?: string) {
  const date = baseDate || todayIso()
  const d = new Date(`${date}T12:00:00`)
  const add = (n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const end = add(4)
  const due = add(2)
  return `# 快速开始

这里可以写任意 Markdown。普通的 \`- [ ]\`、代码块和会议记录不会自动变成项目任务；只有显式 Task Block 中的条目会同步到待办、日历和甘特视图。

- [ ] 这是一条普通清单，不会被稿笺收录

<!-- mdw:tasks id="release-plan" name="发布计划" color="violet" -->

## 示例任务

- [ ] 写产品需求 @id(requirements) @start(${date}) @end(${end}) @priority(high) #工作
  - [ ] 整理评审材料 @id(review-kit) @due(${due}) #协作
- [ ] 发布里程碑 @id(release) @type(milestone) @date(${end}) @color(green)

<!-- /mdw:tasks -->

## 记录

任务的来源、层级、日期和颜色均保留在 Markdown 真源中。需要新建任务时，请先选择目标笔记和 Task Block。
`
}

function todayPlanBodyRich(date: string, yest: string, in2: string) {
  return `# 日程页 — ${date}

早上路径示例：收件箱 / 今日 / 即将到来 / 全部 会从各笔记的 Task Block 聚合。

<!-- mdw:tasks id="daily-${date}" name="${date} 日程" color="blue" -->

## 今日焦点

- [ ] 完成一项重要工作 @id(focus-${date}) @date(${date}) @priority(high) #工作
- [ ] 回复客户邮件 @id(mail-${date}) @due(${date}) #琐事
- [ ] 站会纪要 @id(standup-${date}) @date(${date}) #协作

## 逾期与即将

- [ ] 补交周报 @id(overdue-report) @due(${yest}) @priority(urgent) #工作
- [ ] 预约牙医 @id(dentist) @due(${in2}) #个人

## 未排期（进收件箱）

- [ ] 整理下载文件夹 @id(inbox-downloads) #琐事
- [ ] 想一个周末去处 @id(inbox-weekend) #个人

<!-- /mdw:tasks -->

## 记录

`
}

function sampleProjectBody(date: string, yest: string, in2: string, in4: string, in7: string, in14: string) {
  return `# 示例 · 产品迭代

跨日任务会出现在甘特；单日 / 截止日出现在日历与待办。

<!-- mdw:tasks id="sprint-demo" name="迭代示例" color="orange" -->

## 进行中

- [ ] 设计便签小窗 @id(mini-sticky) @start(${yest}) @end(${in4}) @priority(high) #工作 @color(violet)
- [ ] 完善示例数据 @id(seed-samples) @start(${date}) @end(${in2}) #工作
- [ ] 写验收清单 @id(qa-list) @due(${in2}) @priority(medium) #协作

## 里程碑

- [ ] 内测发布 @id(beta) @type(milestone) @date(${in7}) @color(green)
- [ ] 正式上线 @id(ga) @type(milestone) @date(${in14}) @color(blue)

## 收件箱条目

- [ ] 调研 Windows 亚克力效果 @id(acrylic-research) #工作

<!-- /mdw:tasks -->
`
}

function samplePersonalBody() {
  return `# 购物与琐事

<!-- mdw:tasks id="personal-errands" name="个人琐事" color="green" -->

- [ ] 买牛奶 @id(buy-milk) #个人
- [ ] 交电费 @id(pay-power) @priority(low) #琐事
- [x] 取快递 @id(parcel-done) #个人

<!-- /mdw:tasks -->
`
}

function sampleLongBody(date: string, mid: string, far: string) {
  return `# 季度目标

长期跨日条适合放在「长期待办」夹，甘特上会拉得很长。

<!-- mdw:tasks id="quarter-goals" name="季度目标" color="blue" -->

- [ ] 完成知识库迁移 @id(kb-migrate) @start(${date}) @end(${far}) @priority(medium) #工作
- [ ] 健身计划坚持 @id(fitness) @start(${date}) @end(${mid}) #个人 @color(green)
- [ ] 季度回顾 @id(q-review) @type(milestone) @date(${far}) @color(orange)

<!-- /mdw:tasks -->
`
}
