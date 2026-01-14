# AI Agent 提示词与工具配置指南

[English](AGENT_TOOLS.md) | [中文](AGENT_TOOLS.zh-CN.md) | [返回主页](README.zh-CN.md)

---

本文件旨在说明如何查看、修改以及扩展本雷鸟 AI 助手插件的提示词配置与工具能力。

---

## 一、 提示词配置 (Prompts)

### 1. 界面修改 (推荐)
对于日常使用和调试，可以直接在插件设置页面完成：
1. 打开 **设置 (Options)** -> **提示词 (Prompts)**。
2. 将 **提示词配置 (Prompt Profile)** 切换为 **自定义配置 (Custom)**。
3. 修改对应的文本框（基础人设、总结指令、简报生成等）。
4. 点击 **保存设置**。

### 2. 代码开发修改 (默认值)
如果你想永久修改插件安装后的初始默认值，请编辑：
*   **文件**: `settings.js`
*   **变量**: `const DEFAULT_PROMPTS`
*   **内容**: 包含 Agent 的基础人格 (`agentPersona`)、单封总结方案 (`summary`) 和 每日简报方案 (`briefing`)。

---

## 二、 工具定义 (Tools)

Agent 在执行任务时可以调用的工具集。

### 1. 说明书 (AI 理解层)
AI 看到并决定调用哪个工具的“说明书”存放在：
*   **文件**: `agent/tools/ToolManager.js`
*   **方法**: `getToolDescriptions()`
*   **作用**: 定义了工具名称及其参数解释。

### 2. 执行层 (代码实现层)
具体的参数解析和雷鸟 API 调用逻辑存放在：
*   **文件**: `agent/tools/EmailTools.js`
*   **作用**: 定义了工具返回给 AI 的真实 JSON 数据结构。

---

## 三、 Agent当前工具能力列表

以下是目前Agent可调用的工具能力列表：

| 工具名 | 传入参数 | 说明 | 返回结构 (示例) |
| :--- | :--- | :--- | :--- |
| **`search_emails`** | `string` | 按主题或作者搜索关键词 | `[{id, subject, author, date}]` |
| **`list_recent_emails`** | `number` | 获取最近 X 封邮件 | `[{id, subject, author, date}]` |
| **`get_email_details`** | `number` | 获取邮件正文预览(500字) | `{subject, from, date, preview}` |
| **`search_by_tag`** | `string` | 按标签名搜索 | `[{id, subject, author, date, tags}]` |
| **`get_thread_context`** | `number` | 获取同主题往来邮件列表 | `[{id, subject, author, date, is_current}]` |
| **`list_all_tags`** | `void` | 罗列已定义的标签 | `[{key, tag, color}]` |
| **`list_cached_summaries`** | `number` | 查看最近已生成的 AI 总结 | `[{id, subject, author, generated_at, keywords, tags}]` |
| **`get_existing_briefing`** | `void` | 读取已缓存的简报 | `{content, generated_at}` |
| **`trigger_briefing`** | `void` | 强制在后台重新生成一份简报 | `"任务已启动..."` |
| **`trigger_batch_summary`** | `number` | 强制对最近 X 封邮件批量总结 | `"任务已启动..."` |
| **`get_time`** | `void` | 获取当前系统时间与时区 | `{current_time, weekday, timezone}` |
| **`get_user_identities`** | `void` | 获取当前配置的所有邮箱账户 | `[{name, email, accountName}]` |

---

## 四、 如何添加新工具？

1.  **实现功能**: 在 `agent/tools/EmailTools.js` 的 `emailTools` 对象中添加一个新的异步方法，确保它返回易于 AI 理解的 JSON 或字符串。
2.  **注册描述**: 在 `agent/tools/ToolManager.js` 的 `getToolDescriptions()` 中添加对应的序号和功能描述。
3.  **刷新插件**: 在雷鸟中重新加载插件即可生效。
