<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { NoteMeta } from '../core/types'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>
const q = ref('')
const searchOpen = ref(false)
const renamingPath = ref('')
const renameDraft = ref('')

type SortField = 'name' | 'mtime'
type SortDir = 'asc' | 'desc'
const sortField = ref<SortField>('name')
const sortDir = ref<SortDir>('asc')

type CtxMenu =
  | { kind: 'blank'; x: number; y: number }
  | { kind: 'note'; x: number; y: number; path: string; name: string }
  | { kind: 'folder'; x: number; y: number; folder: string; label: string; groupKind: string }

const ctx = ref<CtxMenu | null>(null)

type Group = {
  folder: string
  label: string
  kind: string
  notes: NoteMeta[]
}

const FOLDER_ICONS: Record<string, string> = {
  个人: 'user',
  工作: 'briefcase',
  今日待办: 'check',
  长期待办: 'flag',
  记录: 'pen',
}

const allGroups = computed(() => {
  return ((ws.noteGroups || []) as Group[]).map((g) => ({
    ...g,
    notes: sortNotes(g.notes.slice()),
  }))
})

const filteredGroups = computed(() => {
  const key = q.value.trim().toLowerCase()
  if (!key) return allGroups.value
  return allGroups.value
    .map((g) => ({
      ...g,
      notes: g.notes.filter(
        (n) =>
          n.name.toLowerCase().includes(key) ||
          g.label.toLowerCase().includes(key) ||
          g.folder.toLowerCase().includes(key)
      ),
    }))
    .filter((g) => g.notes.length > 0 || g.label.toLowerCase().includes(key))
})

/** 笔记区：个人 / 工作 / 记录 及其子目录 */
const docGroups = computed(() =>
  filteredGroups.value.filter((g) => g.kind === 'note' || g.kind === 'record')
)
/** 待办区：今日待办 / 长期待办 */
const todoGroups = computed(() => filteredGroups.value.filter((g) => g.kind === 'todo'))
/** 其它（极少） */
const otherGroups = computed(() =>
  filteredGroups.value.filter((g) => g.kind !== 'note' && g.kind !== 'record' && g.kind !== 'todo')
)

function sortNotes(notes: NoteMeta[]): NoteMeta[] {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return notes.slice().sort((a, b) => {
    if (sortField.value === 'mtime') {
      const d = (a.mtime || 0) - (b.mtime || 0)
      if (d) return d * dir
      return a.name.localeCompare(b.name, 'zh-CN') * dir
    }
    const byName = a.name.localeCompare(b.name, 'zh-CN')
    if (byName) return byName * dir
    return ((a.mtime || 0) - (b.mtime || 0)) * dir
  })
}

function setSortField(field: SortField) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = field === 'mtime' ? 'desc' : 'asc'
  }
}

function sortLabel(): string {
  const f = sortField.value === 'name' ? '名称' : '时间'
  const d = sortDir.value === 'asc' ? '升序' : '降序'
  return `${f} · ${d}`
}

function titleOf(name: string) {
  return name.replace(/\.md$/i, '')
}

function isQuickStart(name: string) {
  return titleOf(name) === '快速开始'
}

function fmtMtime(ms: number) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function folderIconKey(group: { folder: string; kind: string }) {
  const top = (group.folder || '').split('/')[0] || ''
  if (FOLDER_ICONS[top]) return FOLDER_ICONS[top]
  if (group.kind === 'todo') return 'check'
  if (group.kind === 'record') return 'pen'
  return 'folder'
}

function startRename(path: string, name: string) {
  closeCtx()
  renamingPath.value = path
  renameDraft.value = titleOf(name)
}

async function commitRename() {
  const path = renamingPath.value
  const title = renameDraft.value.trim()
  renamingPath.value = ''
  if (!path || !title) return
  if (typeof ws.renameNote === 'function') {
    await ws.renameNote(path, title)
  }
}

function onRootChange() {
  if (typeof ws.changeNotesRoot === 'function') void ws.changeNotesRoot()
}

function onOpenFolder() {
  if (typeof ws.openInFolder === 'function') ws.openInFolder()
}

function onCreateInFolder(folder: string) {
  closeCtx()
  ws.setActiveFolder(folder)
  void ws.createNote(folder)
}

function onSelectFolder(folder: string) {
  ws.setActiveFolder(folder)
  if (typeof ws.toggleFolderCollapse === 'function' && ws.isFolderCollapsed?.(folder)) {
    ws.toggleFolderCollapse(folder)
  }
}

function onToggleGroup(folder: string) {
  ws.toggleFolderCollapse(folder)
}

function onNewFolder(parent?: string) {
  closeCtx()
  void ws.createFolder(undefined, parent !== undefined ? parent : ws.activeFolder || '')
}

function onNewNote() {
  closeCtx()
  void ws.createNote(ws.activeFolder || '')
}

function onDeleteNote(path: string) {
  closeCtx()
  void ws.removeNote(path)
}

function onRenameFolder(folder: string) {
  closeCtx()
  void (ws as any).renameFolder?.(folder)
}

function onDeleteFolder(folder: string) {
  closeCtx()
  void (ws as any).removeFolder?.(folder)
}

function isCollapsed(folder: string) {
  return !!ws.isFolderCollapsed?.(folder)
}

function folderPanelId(folder: string, index: number, prefix: string) {
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'root'
  return `note-folder-${prefix}-${index}-${safeFolder}`
}

function depthOf(folder: string) {
  if (!folder) return 0
  return Math.max(0, folder.split('/').filter(Boolean).length - 1)
}

function displayFolderLabel(group: { folder: string; label: string }) {
  if (!group.folder) return group.label
  const parts = group.folder.split('/').filter(Boolean)
  return parts[parts.length - 1] || group.label
}

function visibleNotes(notes: NoteMeta[]) {
  // 隐藏系统示例「快速开始」
  return notes.filter((n) => !isQuickStart(n.name))
}

function openBlankCtx(ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  if (t?.closest?.('.note-item, .folder-head, .sidebar-chrome, .sidebar-foot, button, input')) {
    return
  }
  ev.preventDefault()
  ctx.value = { kind: 'blank', x: ev.clientX, y: ev.clientY }
}

function openNoteCtx(ev: MouseEvent, path: string, name: string) {
  ev.preventDefault()
  ev.stopPropagation()
  ctx.value = { kind: 'note', x: ev.clientX, y: ev.clientY, path, name }
}

function openFolderCtx(ev: MouseEvent, folder: string, label: string, groupKind: string) {
  ev.preventDefault()
  ev.stopPropagation()
  ctx.value = { kind: 'folder', x: ev.clientX, y: ev.clientY, folder, label, groupKind }
}

function closeCtx() {
  ctx.value = null
}

function onGlobalPointer(ev: MouseEvent) {
  if (!ctx.value) return
  const el = ev.target as HTMLElement | null
  if (el?.closest?.('.lib-ctx-menu')) return
  closeCtx()
}

function onGlobalKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    if (searchOpen.value && !q.value) searchOpen.value = false
    closeCtx()
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f' && !ev.shiftKey) {
    // 库内快捷：Ctrl+F 展开搜索（全局 Ctrl+P 仍走 App）
    const t = ev.target as HTMLElement | null
    if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return
  }
}

function focusSearch() {
  searchOpen.value = true
  requestAnimationFrame(() => {
    document.getElementById('note-search')?.focus()
  })
}

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointer, true)
  document.addEventListener('keydown', onGlobalKey, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointer, true)
  document.removeEventListener('keydown', onGlobalKey, true)
})
</script>

<template>
  <aside id="note-library" class="sidebar" aria-label="笔记库" @contextmenu="openBlankCtx">
    <!-- 极简 chrome：一行图标，默认不抢视觉 -->
    <div class="sidebar-chrome">
      <button
        type="button"
        class="chrome-btn"
        :class="{ active: searchOpen || !!q.trim() }"
        title="搜索 · Ctrl+P"
        aria-label="搜索笔记"
        :aria-expanded="searchOpen || !!q.trim()"
        @click="focusSearch"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
      <button
        type="button"
        class="chrome-btn"
        :title="`排序 ${sortLabel()}`"
        :aria-label="`排序 ${sortLabel()}`"
        @click="setSortField(sortField === 'name' ? 'mtime' : 'name')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11M8 12h7M8 17h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
      <span class="chrome-spacer" />
      <button type="button" class="chrome-btn" title="新建文件夹" aria-label="新建文件夹" @click="onNewFolder()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7h6l1.5 2H20a1 1 0 0 1 1 1v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V8a1 1 0 0 1 .5-1Z" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M12 12v5M9.5 14.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
      </button>
      <button type="button" class="chrome-btn primary" title="新建笔记 · Ctrl+N" aria-label="新建笔记" @click="ws.createNote()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
      </button>
    </div>

    <div v-if="searchOpen || q.trim()" class="sidebar-search-row">
      <label class="sr-only" for="note-search">搜索笔记</label>
      <input
        id="note-search"
        v-model="q"
        class="search-input quiet"
        type="search"
        placeholder="搜索笔记…"
        @keydown.esc.prevent="q = ''; searchOpen = false"
      />
    </div>

    <div v-if="!ws.notes.length" class="onboard-card quiet">
      <div class="onboard-title">还没有笔记</div>
      <button type="button" class="btn-solid sm" @click="ws.createNote(ws.activeFolder)">新建笔记</button>
    </div>

    <div v-if="(ws as any).lastDeleted && (ws as any).lastDeleted.expires > Date.now()" class="undo-delete-bar" role="status">
      <span>已删除「{{ ((ws as any).lastDeleted.name || '').replace(/\.md$/i, '') }}」</span>
      <button type="button" class="btn-ghost sm" @click="(ws as any).undoDeleteNote?.()">撤销</button>
    </div>

    <div class="note-list">
      <!-- 文档区 -->
      <div v-if="docGroups.length" class="lib-section">
        <div class="lib-section-label">文档</div>
        <section
          v-for="(group, groupIndex) in docGroups"
          :key="'doc-' + (group.folder || '__root__')"
          class="folder-group"
          :class="{ active: ws.activeFolder === group.folder }"
          :style="{ '--folder-depth': Math.max(0, depthOf(group.folder)) }"
        >
          <div
            class="folder-head"
            :style="{ paddingLeft: `${Math.max(0, depthOf(group.folder)) * 10}px` }"
            @contextmenu="openFolderCtx($event, group.folder, displayFolderLabel(group), group.kind)"
          >
            <button
              type="button"
              class="folder-toggle"
              :aria-label="isCollapsed(group.folder) ? `展开 ${displayFolderLabel(group)}` : `折叠 ${displayFolderLabel(group)}`"
              :aria-expanded="!isCollapsed(group.folder)"
              :aria-controls="folderPanelId(group.folder, groupIndex, 'doc')"
              @click="onToggleGroup(group.folder)"
            >
              <span aria-hidden="true" />
            </button>
            <button
              type="button"
              class="folder-select"
              :aria-pressed="ws.activeFolder === group.folder"
              :title="group.folder || '根目录'"
              @click="onSelectFolder(group.folder)"
            >
              <span class="folder-glyph" :data-icon="folderIconKey(group)" aria-hidden="true" />
              <span class="folder-label">{{ displayFolderLabel(group) }}</span>
              <span class="folder-count">{{ visibleNotes(group.notes).length }}</span>
            </button>
          </div>

          <div :id="folderPanelId(group.folder, groupIndex, 'doc')" v-show="!isCollapsed(group.folder)" class="folder-notes">
            <article
              v-for="note in visibleNotes(group.notes)"
              :key="note.path"
              class="note-item"
              :class="{ active: note.path === ws.activePath }"
              @contextmenu="openNoteCtx($event, note.path, note.name)"
            >
              <div v-if="renamingPath === note.path" class="note-open">
                <span class="note-dot" aria-hidden="true" />
                <span class="note-main">
                  <input
                    v-model="renameDraft"
                    class="rename-input"
                    aria-label="笔记名称"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="renamingPath = ''"
                    @blur="commitRename"
                  />
                </span>
              </div>
              <button v-else type="button" class="note-open" :title="`打开 ${titleOf(note.name)}`" @click="ws.openNote(note.path)">
                <span class="note-dot" aria-hidden="true" />
                <span class="note-main">
                  <span class="note-name">{{ titleOf(note.name) }}</span>
                  <span class="note-mtime">{{ fmtMtime(note.mtime) }}</span>
                </span>
              </button>
            </article>
            <div v-if="!visibleNotes(group.notes).length" class="folder-empty">空文件夹 · 右键可新建</div>
          </div>
        </section>
      </div>

      <!-- 待办区 -->
      <div v-if="todoGroups.length" class="lib-section">
        <div class="lib-section-label">待办库</div>
        <section
          v-for="(group, groupIndex) in todoGroups"
          :key="'todo-' + (group.folder || '__root__')"
          class="folder-group is-todo"
          :class="{ active: ws.activeFolder === group.folder }"
          :style="{ '--folder-depth': Math.max(0, depthOf(group.folder)) }"
        >
          <div
            class="folder-head"
            :style="{ paddingLeft: `${Math.max(0, depthOf(group.folder)) * 10}px` }"
            @contextmenu="openFolderCtx($event, group.folder, displayFolderLabel(group), group.kind)"
          >
            <button
              type="button"
              class="folder-toggle"
              :aria-label="isCollapsed(group.folder) ? `展开 ${displayFolderLabel(group)}` : `折叠 ${displayFolderLabel(group)}`"
              :aria-expanded="!isCollapsed(group.folder)"
              :aria-controls="folderPanelId(group.folder, groupIndex, 'todo')"
              @click="onToggleGroup(group.folder)"
            >
              <span aria-hidden="true" />
            </button>
            <button
              type="button"
              class="folder-select"
              :aria-pressed="ws.activeFolder === group.folder"
              :title="group.folder || '根目录'"
              @click="onSelectFolder(group.folder)"
            >
              <span class="folder-glyph" :data-icon="folderIconKey(group)" aria-hidden="true" />
              <span class="folder-label">{{ displayFolderLabel(group) }}</span>
              <span class="folder-count">{{ visibleNotes(group.notes).length }}</span>
            </button>
          </div>

          <div :id="folderPanelId(group.folder, groupIndex, 'todo')" v-show="!isCollapsed(group.folder)" class="folder-notes">
            <article
              v-for="note in visibleNotes(group.notes)"
              :key="note.path"
              class="note-item"
              :class="{ active: note.path === ws.activePath }"
              @contextmenu="openNoteCtx($event, note.path, note.name)"
            >
              <div v-if="renamingPath === note.path" class="note-open">
                <span class="note-dot" aria-hidden="true" />
                <span class="note-main">
                  <input
                    v-model="renameDraft"
                    class="rename-input"
                    aria-label="笔记名称"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="renamingPath = ''"
                    @blur="commitRename"
                  />
                </span>
              </div>
              <button v-else type="button" class="note-open" :title="`打开 ${titleOf(note.name)}`" @click="ws.openNote(note.path)">
                <span class="note-dot" aria-hidden="true" />
                <span class="note-main">
                  <span class="note-name">{{ titleOf(note.name) }}</span>
                  <span class="note-mtime">{{ fmtMtime(note.mtime) }}</span>
                </span>
              </button>
            </article>
            <div v-if="!visibleNotes(group.notes).length" class="folder-empty">在任务组中写任务，才会出现在待办视图。</div>
          </div>
        </section>
      </div>

      <section
        v-for="(group, groupIndex) in otherGroups"
        :key="'other-' + (group.folder || '__root__')"
        class="folder-group"
      >
        <div class="folder-head" @contextmenu="openFolderCtx($event, group.folder, displayFolderLabel(group), group.kind)">
          <button type="button" class="folder-select" @click="onSelectFolder(group.folder)">
            <span class="folder-glyph" data-icon="folder" aria-hidden="true" />
            <span class="folder-label">{{ displayFolderLabel(group) }}</span>
            <span class="folder-count">{{ visibleNotes(group.notes).length }}</span>
          </button>
        </div>
      </section>

      <div v-if="q && !filteredGroups.length" class="side-empty">无匹配笔记</div>
    </div>

    <div class="sidebar-foot quiet">
      <button type="button" class="foot-link" :title="ws.notesRoot || '本地笔记'" @click="onRootChange">
        {{ ws.notesRoot ? '更换目录' : '选择目录' }}
      </button>
      <button type="button" class="foot-link" @click="onOpenFolder">打开文件夹</button>
    </div>

    <Teleport to="body">
      <div v-if="ctx" class="lib-ctx-layer" @contextmenu.prevent="closeCtx">
        <div
          class="lib-ctx-menu rail-ctx-menu"
          role="menu"
          :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
          @click.stop
        >
          <template v-if="ctx.kind === 'blank'">
            <button type="button" role="menuitem" @click="onNewNote">新建笔记</button>
            <button type="button" role="menuitem" @click="onNewFolder()">新建文件夹</button>
          </template>
          <template v-else-if="ctx.kind === 'folder'">
            <button type="button" role="menuitem" @click="onCreateInFolder(ctx.folder)">在此新建笔记</button>
            <button type="button" role="menuitem" @click="onNewFolder(ctx.folder)">新建子文件夹</button>
            <button type="button" role="menuitem" @click="onRenameFolder(ctx.folder)">重命名文件夹</button>
            <button
              type="button"
              role="menuitem"
              class="is-danger"
              :disabled="['个人', '工作', '今日待办', '长期待办', '记录'].includes(ctx.folder)"
              @click="onDeleteFolder(ctx.folder)"
            >
              删除文件夹
            </button>
          </template>
          <template v-else>
            <button type="button" role="menuitem" @click="ws.openNote(ctx.path); closeCtx()">打开</button>
            <button type="button" role="menuitem" @click="startRename(ctx.path, ctx.name)">重命名</button>
            <button type="button" role="menuitem" class="is-danger" @click="onDeleteNote(ctx.path)">删除</button>
          </template>
        </div>
      </div>
    </Teleport>
  </aside>
</template>
