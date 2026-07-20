<script setup lang="ts">
import { nextTick, watch, ref } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  message?: string
  modelValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'confirm', v: string): void
  (e: 'cancel'): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
  }
)

function onConfirm() {
  emit('confirm', (props.modelValue || '').trim())
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="emit('cancel')"
      @keydown.esc.prevent="emit('cancel')"
    >
      <div class="confirm-panel prompt-panel">
        <h3 class="confirm-title">{{ title || '请输入' }}</h3>
        <p v-if="message" class="confirm-msg">{{ message }}</p>
        <input
          ref="inputEl"
          class="prompt-input"
          type="text"
          :value="modelValue"
          :placeholder="placeholder || ''"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="onConfirm"
        />
        <div class="confirm-actions">
          <button type="button" class="btn-ghost" @click="emit('cancel')">{{ cancelText || '取消' }}</button>
          <button type="button" class="btn-solid" @click="onConfirm">{{ confirmText || '确定' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
