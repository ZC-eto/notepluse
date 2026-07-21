<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { NoteMeta } from '../core/types'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>
const q = ref('')
const searchOpen = ref(false)
const renamingPath = ref('')
const renameDraft = ref('')

/** 行内新建文件夹（非弹窗） */
const creatingFolder = ref(false)
const newFolderName = ref('')
const newFolderIcon = ref('folder')
const newFolderParent = ref('')
const folderNameInput = ref<HTMLInputElement | null>(null)

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
  icon?: string
}

const ICON_KEYS = ['folder', 'user', 'briefcase', 'check', 'flag', 'pen'] as const

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

function folderIconKey(group: { folder: string; kind: string; icon?: string }) {
  if (group.icon && ICON_KEYS.includes(group.icon as any)) return group.icon
  const top = (group.folder || '').split('/')[0] || ''
  // 用户自建：默认 folder；kind 仅作弱提示
  if (group.kind === 'todo') return 'check'
  if (group.kind === 'record') return 'pen'
  if (/个人|user|me/i.test(top)) return 'user'
  if (/工作|work|job/i.test(top)) return 'briefcase'
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
  if (typeof ws.renameNote === 'function') await ws.renameNote(path, title)
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

async function beginCreateFolder(parent = '') {
  closeCtx()
  creatingFolder.value = true
  newFolderParent.value = parent
  newFolderName.value = ''
  newFolderIcon.value = 'folder'
  await nextTick()
  folderNameInput.value?.focus()
}

function cancelCreateFolder() {
  creatingFolder.value = false
  newFolderName.value = ''
}

async function confirmCreateFolder() {
  const name = newFolderName.value.trim()
  if (!name) {
    folderNameInput.value?.focus()
    return
  }
  const parent = newFolderParent.value
  creatingFolder.value = false
  await ws.createFolder(name, parent)
  // icon 暂存到 config（若 host 支持）；演示列表用 label 前缀弱表现
  newFolderName.value = ''
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

function folderPanelId(folder: string, index: number) {
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'root'
  return `note-folder-${index}-${safeFolder}`
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
  return notes.filter((n) => !isQuickStart(n.name))
}

function openBlankCtx(ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  if (t?.closest?.('.note-item, .folder-head, .sidebar-chrome, .sidebar-foot, .folder-inline-create, button, input')) {
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
    if (creatingFolder.value) {
      cancelCreateFolder()
      return
    }
    if (searchOpen.value && !q.value) searchOpen.value = false
    closeCtx()
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
    <div class="sidebar-chrome">
      <button
        type="button"
        class="chrome-btn"
        :class="{ active: searchOpen || !!q.trim() }"
        title="搜索 · Ctrl+P"
        aria-label="搜索笔记"
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
      <button type="button" class="chrome-btn" title="新建文件夹" aria-label="新建文件夹" @click="beginCreateFolder('')">
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

    <!-- 行内新建文件夹：选图标 + 名称，无弹窗 -->
    <div v-if="creatingFolder" class="folder-inline-create">
      <div class="icon-pick" role="listbox" aria-label="文件夹图标">
        <button
          v-for="key in ICON_KEYS"
          :key="key"
          type="button"
          :class="{ active: newFolderIcon === key }"
          :title="key"
          @click="newFolderIcon = key"
        >
          <span class="folder-glyph" :data-icon="key" aria-hidden="true" />
        </button>
      </div>
      <input
        ref="folderNameInput"
        v-model="newFolderName"
        type="text"
        :placeholder="newFolderParent ? '子文件夹名称' : '文件夹名称'"
        @keydown.enter.prevent="confirmCreateFolder"
        @keydown.esc.prevent="cancelCreateFolder"
      />
      <button type="button" class="text-link" @click="cancelCreateFolder">取消</button>
      <button type="button" class="text-link strong" @click="confirmCreateFolder">创建</button>
    </div>

    <div v-if="!ws.notes.length && !filteredGroups.length && !creatingFolder" class="lib-empty-hero">
      <p>还没有文件夹</p>
      <button type="button" class="text-link strong" @click="beginCreateFolder('')">新建文件夹</button>
      <span class="text-link" style="margin-left: 10px" @click="ws.createNote()">新建笔记</span>
    </div>

    <div v-if="(ws as any).lastDeleted && (ws as any).lastDeleted.expires > Date.now()" class="undo-delete-bar" role="status">
      <span>已删除「{{ ((ws as any).lastDeleted.name || '').replace(/\.md$/i, '') }}」</span>
      <button type="button" class="btn-ghost sm" @click="(ws as any).undoDeleteNote?.()">撤销</button>
    </div>

    <div class="note-list">
      <section
        v-for="(group, groupIndex) in filteredGroups"
        :key="group.folder || '__root__'"
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
            :aria-controls="folderPanelId(group.folder, groupIndex)"
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

        <div :id="folderPanelId(group.folder, groupIndex)" v-show="!isCollapsed(group.folder)" class="folder-notes">
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
              </span>
            </button>
          </article>
          <div v-if="!visibleNotes(group.notes).length" class="folder-empty">空 · 右键新建笔记</div>
        </div>
      </section>

      <div v-if="q && !filteredGroups.length" class="side-empty">无匹配</div>
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
            <button type="button" role="menuitem" @click="beginCreateFolder('')">新建文件夹</button>
          </template>
          <template v-else-if="ctx.kind === 'folder'">
            <button type="button" role="menuitem" @click="onCreateInFolder(ctx.folder)">在此新建笔记</button>
            <button type="button" role="menuitem" @click="beginCreateFolder(ctx.folder)">新建子文件夹</button>
            <button type="button" role="menuitem" @click="onRenameFolder(ctx.folder)">重命名</button>
            <button type="button" role="menuitem" class="is-danger" @click="onDeleteFolder(ctx.folder)">删除</button>
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
