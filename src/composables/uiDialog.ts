import { reactive, readonly } from 'vue'

export type ConfirmRequest = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export type PromptRequest = {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

type ConfirmState = ConfirmRequest & {
  open: boolean
  resolve: ((ok: boolean) => void) | null
}

type PromptState = PromptRequest & {
  open: boolean
  value: string
  resolve: ((value: string | null) => void) | null
}

const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null,
})

const promptState = reactive<PromptState>({
  open: false,
  title: '',
  message: '',
  defaultValue: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  value: '',
  resolve: null,
})

function closeConfirm(ok: boolean) {
  const resolve = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  resolve?.(ok)
}

function closePrompt(value: string | null) {
  const resolve = promptState.resolve
  promptState.open = false
  promptState.resolve = null
  promptState.value = ''
  resolve?.(value)
}

/** 应用内确认框，替代 window.confirm */
export function askConfirm(opts: ConfirmRequest): Promise<boolean> {
  // 若已有对话框打开，先取消前一个
  if (confirmState.open && confirmState.resolve) {
    confirmState.resolve(false)
  }
  return new Promise((resolve) => {
    confirmState.title = opts.title || '请确认'
    confirmState.message = opts.message
    confirmState.confirmText = opts.confirmText || '确定'
    confirmState.cancelText = opts.cancelText || '取消'
    confirmState.danger = !!opts.danger
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

/** 应用内输入框，替代 window.prompt */
export function askPrompt(opts: PromptRequest = {}): Promise<string | null> {
  if (promptState.open && promptState.resolve) {
    promptState.resolve(null)
  }
  return new Promise((resolve) => {
    promptState.title = opts.title || '请输入'
    promptState.message = opts.message || ''
    promptState.defaultValue = opts.defaultValue || ''
    promptState.placeholder = opts.placeholder || ''
    promptState.confirmText = opts.confirmText || '确定'
    promptState.cancelText = opts.cancelText || '取消'
    promptState.value = opts.defaultValue || ''
    promptState.resolve = resolve
    promptState.open = true
  })
}

export function useUiDialogState() {
  return {
    confirm: readonly(confirmState),
    prompt: readonly(promptState),
    /** 可变引用，供绑定 v-model */
    promptDraft: promptState,
    resolveConfirm: closeConfirm,
    resolvePrompt: closePrompt,
    setPromptValue(v: string) {
      promptState.value = v
    },
  }
}
