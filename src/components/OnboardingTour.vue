<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView } from '../core/types'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

type Step = {
  id: string
  title: string
  body: string
  view?: AppView
  forceEditor?: boolean
}

const steps: Step[] = [
  {
    id: 'welcome',
    title: '欢迎使用 Markdown 工作台',
    body: '笔记保存在本地 Markdown 文件。你可以先写字；需要可管理任务时，再插入「任务组」。普通清单不会进入待办。',
    view: 'editor',
    forceEditor: true,
  },
  {
    id: 'task-block',
    title: '用「任务组」声明任务',
    body: '在笔记工具条点「任务组」（或 Ctrl+Alt+T）。只有任务组里的 - [ ] 才会同步到待办 / 日历 / 甘特。排版模式里任务组边界显示为细线标记「任务组 / 结束」。',
    view: 'editor',
    forceEditor: true,
  },
  {
    id: 'todo',
    title: '待办：收件箱 · 今日 · 即将',
    body: '无日期任务进收件箱；@date / 进行中的区间 / 今日截止进「今日」。添加任务时请选择写入的任务组，避免写错笔记。',
    view: 'todo',
  },
  {
    id: 'dates',
    title: '日期语义（改期前请看清）',
    body: '单日 @date、截止 @due、跨日 @start+@end、里程碑 @type(milestone)+@date 含义不同。甘特只收跨日与里程碑；单日与截止请看日历或待办。改日期会写回源 Markdown。',
    view: 'calendar',
  },
  {
    id: 'gantt',
    title: '甘特与收尾',
    body: '甘特适合看跨日排期；可拖条改期。设置里可改「启动默认视图」、显示密度，并可随时「重新开始引导」。准备好了就完成引导开始书写。',
    view: 'gantt',
  },
]

const index = ref(0)
const step = computed(() => steps[index.value] || steps[0])
const isLast = computed(() => index.value >= steps.length - 1)
const progress = computed(() => `${index.value + 1} / ${steps.length}`)

function goView(s: Step) {
  if (!s.view) return
  ;(ws as any).setView?.(s.view, s.forceEditor ? { force: true } : undefined)
}

watch(
  () => (ws as any).onboardingOpen,
  (open) => {
    if (open) {
      index.value = 0
      goView(steps[0])
    }
  },
  { immediate: true }
)

function next() {
  if (isLast.value) {
    ;(ws as any).completeOnboarding?.()
    return
  }
  index.value += 1
  goView(steps[index.value])
}

function prev() {
  if (index.value <= 0) return
  index.value -= 1
  goView(steps[index.value])
}

function skip() {
  ;(ws as any).skipOnboarding?.()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="(ws as any).onboardingOpen"
      class="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div class="onboarding-scrim" aria-hidden="true" />
      <div class="onboarding-card">
        <header class="onboarding-head">
          <span class="onboarding-progress">{{ progress }}</span>
          <h2 id="onboarding-title" class="onboarding-title">{{ step.title }}</h2>
        </header>
        <p class="onboarding-body">{{ step.body }}</p>
        <footer class="onboarding-actions">
          <button type="button" class="btn-ghost sm" @click="skip">跳过引导</button>
          <div class="onboarding-nav">
            <button type="button" class="btn-ghost sm" :disabled="index === 0" @click="prev">上一步</button>
            <button type="button" class="btn-solid sm" @click="next">
              {{ isLast ? '完成' : '下一步' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
