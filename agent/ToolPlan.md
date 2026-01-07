# Tool Expansion Plan

此文档列出了除了修改数据（写操作）之外，旨在增强 AI **感知力**、**全局信息获取能力**和**上下文理解能力**的工具规划。

## 1. 高级搜索与过滤 (Enhanced Discovery)

### `search_by_tag(tagName, limit)`
*   **功能**: 根据 Thunderbird 标签（如 "Important", "To Do", "Work"）筛选邮件。
*   **价值**: AI 可以快速聚焦特定类别的邮件（例如：“看看待办事项里还有什么没做”）。
*   **实现**: `browser.messages.query({ tags: [tagName] })`

## 2. 缓存与元数据利用 (Cache & Metadata Intelligence)

### `list_cached_summaries(limit, filterType)`
*   **功能**: 获取插件已经生成过摘要的邮件列表。
*   **返回**: 包含 `summary` (摘要), `keywords` (关键词), `urgency_score` (紧急度), `tags` (特别是 AI 自动打的标签), `generated_at` (生成时间)。
*   **价值**:
    *   **极速响应**: 不需要现场读邮件内容，直接查数据库。
    *   **全局洞察**: AI 可以基于这些摘要回答宏观问题，如“最近我的邮件主要都在讨论什么？”“哪几封邮件最紧急？”。
*   **实现**: 读取 `browser.storage.local` 中的 `cache_index` 或遍历 `cache_*` 键。

## 3. 上下文与关系 (Context & Relationships)

### `get_thread_context(messageId)`
*   **功能**: 获取某封邮件所在的**完整对话线程 (Thread)**。
*   **价值**: 单封邮件往往断章取义。此工具能拉取前后文（上一封谁发的、下一封回复了什么），让 AI 理解对话全貌。
*   **实现**: 使用 `messages.query({ threadId: ... })` 或通过 `references` 头递归查找。

---

读取已生成简报
get_existing_briefing()

4 用户、系统信息
get_time() //获取时间 日期
get_user_identities() // 获取当前用户自己的邮箱身份

5 其他概览
list_all_tags() // 获取系统中所有可用的标签名
count_unread_messages() // 统计未读邮件数量

