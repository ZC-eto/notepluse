<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView } from '../core/types'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

type Step = {
  id: string
  title: string
  body: string
  /** CSS selector for spotlight hole; empty = center card only */
  target?: string
  view?: AppView
  forceEditor?: boolean
  /** Optional secondary action under body */
  tip?: string
}

const steps: Step[] = [
  {
    id: 'welcome',
    title: '从笔记开始',
    body: '稿笺先是本地写作。内容存在你的笔记文件夹里，不是云端数据库。',
    target: '.work-rail .rail-nav-item.is-editor, .rail-nav .rail-nav-item.is-editor, nav.work-rail button.rail-nav-item:first-of-type, .work-rail button:nth-child(1)',
    view: 'editor',
    forceEditor: true,
    tip: '请看左侧导航的「笔记」',
  },
  {
    id: 'task-block',
    title: '用「任务组」声明可管理任务',
    body: '只有任务组里的 - [ ] 会进待办 / 日历 / 甘特。普通清单、代码示例不会被收录。',
    target: 'button.editor-tool-block, .editor-tool-block, .editor-toolbar button[aria-label*="任务组"], .editor-toolbar button[title*="任务组"]',
    view: 'editor',
    forceEditor: true,
    tip: '请看工具条上的「任务组」按钮（或 Ctrl+Alt+T）',
  },
  {
    id: 'todo',
    title: '待办按时间看',
    body: '收件箱=未排期；今日=今天相关；即将=未来承诺；全部=查找。标签和优先级写在任务属性里，会回写 Markdown。',
    target: '[aria-label="待办范围"], .todo-view .view-toolbar, .todo-view header, .todo-view .scope-seg, .todo-view',
    view: 'todo',
    tip: '请看待办顶部的「收件箱 / 今日 / 即将 / 全部」',
  },
  {
    id: 'dates',
    title: '四种日期，含义不同',
    body: '@date 单日 · @due 截止 · @start+@end 跨日 · 里程碑 @type(milestone)+@date。甘特只收跨日和里程碑。',
    target: '[aria-label="日历工具栏"], .calendar-view .view-toolbar, .calendar-view header, .calendar-view',
    view: 'calendar',
    tip: '请看日历顶部工具栏；改日期会写回源笔记',
  },
  {
    id: 'finish',
    title: '随时可再学一遍',
    body: '设置里可改默认首页、显示密度，并「重新开始引导」。准备好了就开始写。',
    target: 'button[aria-label="打开设置"], button[title="打开设置"], .top-actions .settings-btn, .top-actions button[aria-label*="设置"]',
    view: 'editor',
    forceEditor: true,
    tip: '请看右上角齿轮「设置」→ 使用引导',
  },
]

const index = ref(0)
const hole = ref({ top: 0, left: 0, width: 0, height: 0, visible: false })
const step = computed(() => steps[index.value] || steps[0])
const isLast = computed(() => index.value >= steps.length - 1)
const progress = computed(() => `${index.value + 1} / ${steps.length}`)
const progressPct = computed(() => ((index.value + 1) / steps.length) * 100)

let ro: ResizeObserver | null = null
let measureTimer: ReturnType<typeof setTimeout> | null = null

function pickTarget(selector?: string): HTMLElement | null {
  if (!selector) return null
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean)
  for (const sel of parts) {
    try {
      const el = document.querySelector(sel) as HTMLElement | null
      if (el && el.getClientRects().length) return el
    } catch {
      /* ignore invalid selector */
    }
  }
  return null
}

function measure() {
  const el = pickTarget(step.value.target)
  if (!el) {
    hole.value = { top: 0, left: 0, width: 0, height: 0, visible: false }
    return
  }
  const r = el.getBoundingClientRect()
  const pad = 8
  hole.value = {
    top: Math.max(8, r.top - pad),
    left: Math.max(8, r.left - pad),
    width: Math.min(window.innerWidth - 16, r.width + pad * 2),
    height: Math.min(window.innerHeight - 16, r.height + pad * 2),
    visible: r.width > 2 && r.height > 2,
  }
}

function scheduleMeasure() {
  if (measureTimer) clearTimeout(measureTimer)
  measureTimer = setTimeout(() => {
    measure()
    // second pass after layout settle
    requestAnimationFrame(measure)
  }, 60)
}

function goView(s: Step) {
  if (!s.view) return
  ;(ws as any).setView?.(s.view, s.forceEditor ? { force: true } : undefined)
}

async function activateStep(i: number) {
  index.value = i
  goView(steps[i])
  await nextTick()
  scheduleMeasure()
  // 布局/视图切换后再量一次，避免 selector 过早 miss
  setTimeout(() => scheduleMeasure(), 180)
  setTimeout(() => {
    scheduleMeasure()
    const btn = document.querySelector('.coach-card .btn-solid') as HTMLButtonElement | null
    btn?.focus?.()
  }, 320)
}

watch(
  () => (ws as any).onboardingOpen,
  async (open) => {
    if (open) await activateStep(0)
  },
  { immediate: true }
)

watch(index, () => scheduleMeasure())

function next() {
  if (isLast.value) {
    ;(ws as any).completeOnboarding?.()
    return
  }
  void activateStep(index.value + 1)
}

function prev() {
  if (index.value <= 0) return
  void activateStep(index.value - 1)
}

function skip() {
  ;(ws as any).skipOnboarding?.()
}

function onKey(ev: KeyboardEvent) {
  if (!(ws as any).onboardingOpen) return
  if (ev.key === 'Escape') {
    ev.preventDefault()
    skip()
  } else if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
    if ((ev.target as HTMLElement)?.tagName === 'BUTTON') return
    ev.preventDefault()
    next()
  } else if (ev.key === 'ArrowLeft') {
    ev.preventDefault()
    prev()
  }
}

onMounted(() => {
  window.addEventListener('resize', scheduleMeasure)
  window.addEventListener('keydown', onKey)
  ro = new ResizeObserver(() => scheduleMeasure())
  ro.observe(document.documentElement)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleMeasure)
  window.removeEventListener('keydown', onKey)
  if (measureTimer) clearTimeout(measureTimer)
  ro?.disconnect()
})

const cardStyle = computed(() => {
  if (!hole.value.visible) {
    return { bottom: '28px', left: '50%', transform: 'translateX(-50%)' } as Record<string, string>
  }
  const h = hole.value
  const cardW = Math.min(400, window.innerWidth - 24)
  const spaceBelow = window.innerHeight - (h.top + h.height)
  const placeBelow = spaceBelow > 200 || h.top < 160
  let left = h.left + h.width / 2 - cardW / 2
  left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12))
  if (placeBelow) {
    return {
      top: `${Math.min(window.innerHeight - 200, h.top + h.height + 14)}px`,
      left: `${left}px`,
      transform: 'none',
      width: `${cardW}px`,
    }
  }
  return {
    top: `${Math.max(12, h.top - 14)}px`,
    left: `${left}px`,
    transform: 'translateY(-100%)',
    width: `${cardW}px`,
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="(ws as any).onboardingOpen"
      class="coach-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-title"
    >
      <!-- four-panel dim so the hole stays interactive-looking -->
      <div class="coach-dim coach-dim-top" :style="hole.visible ? { height: hole.top + 'px' } : { height: '100%' }" />
      <div
        v-if="hole.visible"
        class="coach-dim coach-dim-left"
        :style="{ top: hole.top + 'px', height: hole.height + 'px', width: hole.left + 'px' }"
      />
      <div
        v-if="hole.visible"
        class="coach-dim coach-dim-right"
        :style="{
          top: hole.top + 'px',
          height: hole.height + 'px',
          left: hole.left + hole.width + 'px',
          right: '0',
        }"
      />
      <div
        v-if="hole.visible"
        class="coach-dim coach-dim-bottom"
        :style="{ top: hole.top + hole.height + 'px', bottom: '0' }"
      />

      <div
        v-if="hole.visible"
        class="coach-hole"
        :style="{
          top: hole.top + 'px',
          left: hole.left + 'px',
          width: hole.width + 'px',
          height: hole.height + 'px',
        }"
        aria-hidden="true"
      />

      <div class="coach-card" :style="cardStyle">
        <div class="coach-progress-bar" aria-hidden="true">
          <span class="coach-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <header class="coach-head">
          <span class="coach-step">{{ progress }}</span>
          <h2 id="coach-title" class="coach-title">{{ step.title }}</h2>
        </header>
        <p class="coach-body">{{ step.body }}</p>
        <p v-if="step.tip" class="coach-tip">{{ step.tip }}</p>
        <p v-if="!hole.visible" class="coach-fallback">
          当前界面未找到可高亮的控件（可能未打开对应视图）。请按上方提示操作，或点「下一步」继续。
        </p>
        <footer class="coach-actions">
          <button type="button" class="btn-ghost sm" @click="skip">跳过</button>
          <div class="coach-nav">
            <button type="button" class="btn-ghost sm" :disabled="index === 0" @click="prev">上一步</button>
            <button type="button" class="btn-solid sm" @click="next">
              {{ isLast ? '开始使用' : '下一步' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
