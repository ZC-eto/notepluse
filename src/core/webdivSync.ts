/**
 * WebDIV / 远程同步预埋层
 *
 * 查阅 E:\Tools\ZTools 后：
 * - 未发现名为 webdiv / WebDIV 的公开插件 API
 * - 宿主侧与「云数据」最接近的是 window.ztools.db / dbStorage，
 *   以及主程序内部的 SyncClient（设置同步，非插件笔记文件同步）
 *
 * 因此本模块只做：
 * 1) syncProvider 配置读写
 * 2) 对可能的宿主存储做能力探测
 * 3) 明确 TODO，禁止假装已完成云同步
 *
 * 详见 docs/webdiv-sync.md
 */

import type { SyncProvider } from './types'

export const DEFAULT_SYNC_PROVIDER: SyncProvider = 'local'
export const SYNC_PROVIDER_KEY = 'syncProvider'

export interface SyncProviderStatus {
  provider: SyncProvider
  /** 是否真正可用（webdiv 当前恒为 false） */
  ready: boolean
  label: string
  detail: string
}

export interface WebdivCapabilities {
  /** 宿主是否暴露 db（可随插件文档进云，若宿主开启同步） */
  hasDb: boolean
  /** 键值存储 */
  hasDbStorage: boolean
  /** 云复制状态 API（null=未开同步） */
  hasReplicateState: boolean
  /** 探测时的 replicate 状态 */
  replicateState: null | 0 | 1 | undefined
}

/** 从配置对象读取 provider，非法值回落 local */
export function loadSyncProvider(cfg: Record<string, unknown> | null | undefined): SyncProvider {
  const v = cfg?.[SYNC_PROVIDER_KEY]
  if (v === 'webdiv' || v === 'local') return v
  return DEFAULT_SYNC_PROVIDER
}

export function saveSyncProvider(
  writeConfig: (partial: Record<string, unknown>) => Record<string, unknown>,
  provider: SyncProvider
): SyncProvider {
  writeConfig({ [SYNC_PROVIDER_KEY]: provider })
  return provider
}

/**
 * 探测 ZTools 宿主是否具备「类 WebDIV」存储能力。
 * 不发起任何远程请求。
 */
export function probeWebdivCapabilities(): WebdivCapabilities {
  const z = typeof window !== 'undefined' ? (window as any).ztools : null
  const hasDb = !!(z && z.db && typeof z.db.put === 'function')
  const hasDbStorage = !!(z && z.dbStorage && typeof z.dbStorage.setItem === 'function')
  let hasReplicateState = false
  let replicateState: null | 0 | 1 | undefined
  try {
    if (hasDb && typeof z.db.replicateStateFromCloud === 'function') {
      hasReplicateState = true
      replicateState = z.db.replicateStateFromCloud()
    }
  } catch {
    hasReplicateState = true
    replicateState = undefined
  }
  return { hasDb, hasDbStorage, hasReplicateState, replicateState }
}

export function getSyncProviderStatus(provider: SyncProvider): SyncProviderStatus {
  if (provider === 'local') {
    return {
      provider: 'local',
      ready: true,
      label: '本地文件',
      detail: '笔记读写 notesRoot 下 Markdown 文件，无远程同步',
    }
  }

  const cap = probeWebdivCapabilities()
  // 实验：暴露宿主 db 能力状态，但仍不以「云已同步」承诺文件同步完成
  const cloudHint =
    cap.replicateState === null
      ? '宿主云同步未开启（请在 ZTools 设置中登录/启动同步）'
      : cap.replicateState === 1
        ? '宿主云复制进行中'
        : cap.replicateState === 0
          ? '宿主云复制空闲'
          : '无法读取宿主复制状态'
  return {
    provider: 'webdiv',
    ready: false,
    label: '宿主云同步（实验）',
    detail: cap.hasDb
      ? `宿主具备 ztools.db；笔记仍以本地 Markdown 为准。${cloudHint}`
      : '未检测到 ztools.db；可将笔记目录放到网盘同步文件夹作为替代',
  }
}

/**
 * 薄封装：未来把笔记镜像到宿主 db 时走这里。
 * 当前全部返回 not-implemented，避免误用。
 */
export const webdivSyncApi = {
  async pushNote(_payload: {
    id: string
    folder: string
    name: string
    content: string
    mtime: number
  }): Promise<{ ok: false; reason: string }> {
    // TODO(webdiv): 使用 ztools.db.put({ _id: `md-workspace/notes/${id}`, ... })
    // 并约定与本地文件的双向同步策略（冲突、删除、文件夹映射）
    return { ok: false, reason: 'webdiv push 未实现' }
  },

  async pullNotes(_since?: number): Promise<{ ok: false; reason: string; items: never[] }> {
    // TODO(webdiv): ztools.db.allDocs('md-workspace/notes/') 拉取远端投影
    return { ok: false, reason: 'webdiv pull 未实现', items: [] }
  },

  async listRemoteFolders(): Promise<{ ok: false; reason: string; folders: never[] }> {
    // TODO(webdiv): 远端文件夹清单
    return { ok: false, reason: 'webdiv listRemoteFolders 未实现', folders: [] }
  },
}