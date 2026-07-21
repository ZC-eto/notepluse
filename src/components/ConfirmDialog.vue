<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()
const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const panelEl = ref<HTMLElement | null>(null)
const cancelEl = ref<HTMLButtonElement | null>(null)
const confirmEl = ref<HTMLButtonElement | null>(null)
let returnFocus: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  if (!panelEl.value) return []
  return Array.from(
    panelEl.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key !== 'Tab') return

  const targets = focusableElements()
  if (!targets.length) {
    event.preventDefault()
    panelEl.value?.focus()
    return
  }

  const first = targets[0]
  const last = targets[targets.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      // Destructive decisions always start on Cancel; normal confirmation starts on Confirm.
      ;(props.danger ? cancelEl.value : confirmEl.value)?.focus()
      return
    }

    const previous = returnFocus
    returnFocus = null
    await nextTick()
    if (previous?.isConnected) previous.focus()
  }
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-overlay"
      :role="danger ? 'alertdialog' : 'dialog'"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      @click.self="emit('cancel')"
      @keydown="onKeydown"
    >
      <div ref="panelEl" class="confirm-panel quiet" tabindex="-1">
        <h3 id="confirm-dialog-title" class="confirm-title quiet">{{ title || '确认' }}</h3>
        <p id="confirm-dialog-message" class="confirm-msg quiet">{{ message }}</p>
        <div class="confirm-actions quiet">
          <button ref="cancelEl" type="button" class="text-link" @click="emit('cancel')">{{ cancelText || '取消' }}</button>
          <button
            ref="confirmEl"
            type="button"
            class="text-link strong"
            :class="{ danger: danger }"
            @click="emit('confirm')"
          >
            {{ confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
