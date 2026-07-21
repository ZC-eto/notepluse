<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { NoteMeta, SyncProvider } from '../core/types'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>
const q = ref('')
const renamingPath = ref('')
const renameDraft = ref('')

/** 名称 | 修改时间；方向升/降 */
type SortField = 'name' | 'mtime'
type SortDir = 'asc' | 'desc'
const sortField = ref<SortField>('name')
const sortDir = ref<SortDir>('asc')

type CtxMenu =
  | { kind: 'blank'; x: number; y: number }
  | { kind: 'note'; x: number; y: number; path: string; name: string }

const ctx = ref<CtxMenu | null>(null)

const filteredGroups = computed(() => {
  const key = q.value.trim().toLowerCase()
  const groups = (ws.noteGroups || []) as {
    folder: string
    label: string
    kind: string
    notes: NoteMeta[]
  }[]

  const sorted = groups.map((g) => ({
    ...g,
    notes: sortNotes(
      key
        ? g.notes.filter((n) => n.name.toLowerCase().includes(key))
        : g.notes.slice()
    ),
  }))

  if (!key) return sorted
  return sorted.filter((g) => g.notes.length > 0 || g.label.toLowerCase().includes(key))
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

function kindBadge(kind: string) {
  if (kind === 'record') return '记录'
  if (kind === 'todo') return '任务'
  return ''
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
  if (typeof ws.changeNotesRoot === 'function') {
    void ws.changeNotesRoot()
  }
}

function onOpenFolder() {
  if (typeof ws.openInFolder === 'function') {
    ws.openInFolder()
  }
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

function onNewFolder() {
  closeCtx()
  void ws.createFolder(undefined, ws.activeFolder || '')
}

function onNewNote() {
  closeCtx()
  void ws.createNote(ws.activeFolder || '')
}

function onDeleteNote(path: string) {
  closeCtx()
  void ws.removeNote(path)
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

function openBlankCtx(ev: MouseEvent) {
  const t = ev.target as HTMLElement | null
  // 点在笔记行/按钮上时由行自己处理
  if (t?.closest?.('.note-item, .folder-head, .sidebar-top, .sidebar-search, .sidebar-foot, button, input')) {
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
  if (ev.key === 'Escape') closeCtx()
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
    <div class="sidebar-top">
      <div class="sidebar-search">
        <label class="sr-only" for="note-search">搜索笔记</label>
        <span class="search-glyph" aria-hidden="true" />
        <input id="note-search" v-model="q" class="search-input" type="search" placeholder="搜索" />
      </div>
      <div class="sidebar-top-actions">
        <button
          class="icon-action"
          type="button"
          :title="`排序：${sortLabel()}，点击切换字段`"
          :aria-label="`排序 ${sortLabel()}`"
          @click="setSortField(sortField === 'name' ? 'mtime' : 'name')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h12M8 12h8M8 17h4M5 7v.01M5 12v.01M5 17v.01" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
        </button>
        <button class="icon-action" type="button" title="新建文件夹" aria-label="新建文件夹" @click="onNewFolder">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l1.7 2H20a1 1 0 0 1 1 1v8.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V7a.5.5 0 0 1 .5-.5Zm13 6v5m-2.5-2.5h5" /></svg>
        </button>
        <button
          class="icon-action primary"
          type="button"
          title="新建笔记 · Ctrl+N"
          aria-label="新建笔记"
          @click="ws.createNote()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>

    <div v-if="!ws.notes.length" class="onboard-card">
      <div class="onboard-title">还没有笔记</div>
      <button type="button" class="btn-solid" @click="ws.createNote(ws.activeFolder)">新建笔记</button>
    </div>
    <div v-if="(ws as any).lastDeleted && (ws as any).lastDeleted.expires > Date.now()" class="undo-delete-bar" role="status">
      <span>已删除「{{ ((ws as any).lastDeleted.name || '').replace(/\.md$/i,'') }}」</span>
      <button type="button" class="btn-ghost sm" @click="(ws as any).undoDeleteNote?.()">撤销</button>
    </div>

    <div v-if="!q.trim() && ws.recentNotes && ws.recentNotes.length" class="recent-block">
      <div class="recent-head"><span>最近</span></div>
      <button
        v-for="note in ws.recentNotes"
        :key="'recent-' + note.path"
        type="button"
        class="note-item recent-item"
        :class="{ active: note.path === ws.activePath }"
        :aria-current="note.path === ws.activePath ? 'page' : undefined"
        @click="ws.openNote(note.path)"
        @contextmenu="openNoteCtx($event, note.path, note.name)"
      >
        <span class="note-dot" aria-hidden="true" />
        <span class="note-name">{{ titleOf(note.name) }}</span>
      </button>
    </div>

    <div class="note-list">
      <section
        v-for="(group, groupIndex) in filteredGroups"
        :key="group.folder || '__root__'"
        class="folder-group"
        :class="{ active: ws.activeFolder === group.folder }"
        :style="{ '--folder-depth': Math.max(0, depthOf(group.folder)) }"
      >
        <div class="folder-head" :style="{ paddingLeft: `${Math.max(0, depthOf(group.folder)) * 12}px` }">
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
          <button type="button" class="folder-select" :aria-pressed="ws.activeFolder === group.folder" :title="group.folder || '根目录'" @click="onSelectFolder(group.folder)">
            <span class="folder-icon" aria-hidden="true"><i /></span>
            <span class="folder-label">{{ displayFolderLabel(group) }}</span>
            <span v-if="kindBadge(group.kind)" class="folder-badge" :data-kind="group.kind">{{ kindBadge(group.kind) }}</span>
            <span class="folder-count">{{ group.notes.length }}</span>
          </button>
          <button
            type="button"
            class="folder-add"
            :aria-label="`在 ${displayFolderLabel(group)} 新建笔记`"
            title="在此文件夹新建笔记"
            @click="onCreateInFolder(group.folder)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div :id="folderPanelId(group.folder, groupIndex)" v-show="!isCollapsed(group.folder)" class="folder-notes">
          <article
            v-for="note in group.notes"
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
            <div class="note-actions">
              <button type="button" class="note-del" :aria-label="`重命名 ${titleOf(note.name)}`" title="重命名" @click="startRename(note.path, note.name)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L18.7 8.8 15.2 5.3 4 16.5Zm9.8-11.2 3.5 3.5" /></svg>
              </button>
              <button type="button" class="note-del" :aria-label="`删除 ${titleOf(note.name)}`" title="删除" @click="ws.removeNote(note.path)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14m-9 3v6m4-6v6M9 7l1-2h4l1 2m-8 0 1 13h8l1-13" /></svg>
              </button>
            </div>
          </article>

          <div v-if="!group.notes.length" class="folder-empty">
            <template v-if="group.kind === 'record'">在这里写下正文、想法或记录。</template>
            <template v-else-if="group.kind === 'todo'">在任务组中写任务，才会出现在待办视图。</template>
            <template v-else>此文件夹暂时为空。</template>
          </div>
        </div>
      </section>

      <div v-if="ws.isEmptyWorkspace && !q && ws.notes.length" class="side-onboarding">
        <div class="side-onboarding-title">开始书写</div>
        <p class="side-onboarding-desc">需要待办时再插入任务组即可。</p>
        <button type="button" class="btn-solid sm" @click="ws.createNote()">新建笔记</button>
        <button type="button" class="btn-ghost sm" @click="ws.openSampleNote()">查看示例</button>
      </div>

      <div v-if="!filteredGroups.length" class="side-empty">
        <template v-if="q">无匹配笔记</template>
      </div>
    </div>

    <div class="sidebar-foot">
      <div class="root-path" :title="ws.notesRoot">{{ ws.notesRoot || '本地笔记' }}</div>
      <div class="foot-actions">
        <button type="button" class="btn-ghost sm" @click="onRootChange">更换目录</button>
        <button type="button" class="btn-ghost sm" @click="onOpenFolder">打开文件夹</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="ctx"
        class="lib-ctx-layer"
        @contextmenu.prevent="closeCtx"
      >
        <div
          class="lib-ctx-menu rail-ctx-menu"
          role="menu"
          :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
          @click.stop
        >
          <template v-if="ctx.kind === 'blank'">
            <button type="button" role="menuitem" @click="onNewNote">新建笔记</button>
            <button type="button" role="menuitem" @click="onNewFolder">新建文件夹</button>
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
