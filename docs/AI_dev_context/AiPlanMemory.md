 ai自用文档，按条目记录行动进度（甚至拆分小任务，以及记录小任务进度）

## Known Issues & Learnings
- **MV3 Popup Message Retrieval**: 获取当前选中的邮件在 MV3 Popup 中非常不稳定。
  - `browser.messageDisplay.getDisplayedMessage(tabId)` (单数) 常返回 null。
  - `browser.messageDisplay.getDisplayedMessages(tabId)` (复数) 是官方推荐，但也可能失效。
  - `activeTab` 权限在 Popup 中可能未正确指向 Main Window Tab。
  - 当前尝试的解决方案：
    1. 优先使用 `browser.mailTabs.getSelectedMessages()` (直接获取选中项，不依赖 Tab ID)。
    2. 回退方案：后台遍历所有 `browser.mailTabs`，查找 `getDisplayedMessages` 返回非空的 Tab。