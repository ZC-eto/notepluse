# 产品经理上线判定（更新）

**日期：** 2026-07-20  
**版本意图：** v0.2.1 工作副本  
**源码：** work/md-workspace  
**正式目录：** D:\Code\ZTools_Plugin\md-workspace 仍为 0.1.0（未同步）

## 结论

| 层 | 判定 |
|----|------|
| 产品功能源码 | **GO（可上线试投）** |
| 交付安装包 | **NO-GO**（无法写入正式目录 / 无 zip 真机验收） |

## 源码已具备
- 本地笔记：新建/搜索/重命名/删除/换目录/打开文件夹
- 快捷键 Ctrl+S/N/1/2/3
- 所见即所得 + 源码 + 工具条
- 待办：勾选、改标题、**行内改日期**、删除、标签、过期
- 甘特：拖拽/拉伸、空态添加、删除
- 稳定 @id（打开补全、写回保留）
- 保存态：未保存/保存中/已保存/失败
- 核心测试 **19/19 通过**

## 上线阻断（交付）
1. 同步到 D:\Code\ZTools_Plugin\md-workspace
2. npm run test:core && npm run pack
3. ZTools 导入 zip 冒烟

## 用户动作
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\outputs\apply-md-workspace-v0.2.ps1"
```

完成后产品判定自动升为 **全量 GO**。