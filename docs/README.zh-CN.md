# Thunderbird AI Summary Extension

[English](../README.md) | [中文](README.zh-CN.md) | [开发指南](MODIFICATION_GUIDE.md) | [Agent 工具说明](AGENT_TOOLS.zh-CN.md)

## 这是什么？

这是一个允许你使用 AI 总结邮件的 Thunderbird 扩展。
它可以总结**单封邮件**，添加**标签**、**紧急度评分**，**一键自动批量生成总结**，并根据本地缓存的邮件摘要生成**智能简报**。

## 🚀 如何在 Thunderbird 中临时安装 (调试模式)

如果你想测试或开发此扩展，可以通过 Thunderbird 的调试功能临时加载它。

1.  **打开 Thunderbird**。
2.  点击右上角的菜单按钮 (≡)，选择 **“附加组件和主题” (Add-ons and Themes)**。
3.  在附加组件管理器页面的右上角，点击 **齿轮图标 (⚙️)**。
4.  选择 **“调试附加组件” (Debug Add-ons)**。
5.  在打开的调试页面中，点击 **“临时载入附加组件...” (Load Temporary Add-on...)** 按钮。
6.  在文件选择对话框中，导航到本项目的目录，并选择 **`manifest.json`** 文件。
7.  点击“打开”。

现在，你应该能在 Thunderbird 的工具栏上看到扩展的图标了。

> **注意**: 临时加载的扩展在关闭 Thunderbird 后会被移除。下次启动时需要重复上述步骤。

---

## 🛠 运行逻辑详解

此扩展主要由两部分组成：**Popup (前端界面)** 和 **Background (后台服务)**。它们通过消息机制进行通信。

### 1. 核心架构

*   **Popup (`popup.html` / `popup.js`)**:
    *   **职责**: 负责与用户交互，显示按钮、进度条和最终的总结结果。
    *   **交互**: 当用户点击按钮（如“开始总结”、“一键总结邮件”）时，它会向后台发送消息（`sendMessage`）。
    *   **监听**: 它会监听来自后台的实时消息（如进度更新、错误提示），并动态更新 UI。

*   **Background (`background.js`)**:
    *   **职责**: 处理核心逻辑，包括调用 Thunderbird API 读取邮件、调用 OpenAI API 生成总结、以及管理缓存。
    *   **持久化**: 使用 `browser.storage.local` 存储 API 设置 and 邮件总结缓存，避免重复消耗 Token。

### 2. 功能逻辑拆解

#### A. 单封邮件总结
1.  **触发**: 用户在阅读邮件时点击扩展图标，Popup 初始化并获取当前显示的邮件 ID。
2.  **请求**: 用户点击“开始总结”，Popup 发送 `START_SUMMARY` 消息。
3.  **处理**:
    *   后台检查是否存在缓存。如果有且未强制刷新，直接返回缓存结果。
    *   如果没有缓存，后台调用 `browser.messages.getFull` 获取邮件全文。
    *   解析邮件正文（去除 HTML 标签）。
    *   构建 Prompt（包含发件人、主题、正文），调用 OpenAI API。
4.  **响应**: AI 返回 JSON 格式的总结（包含摘要、标签、紧迫度评分）。后台将结果存入缓存，并广播 `SUMMARY_UPDATE` 消息给 Popup 进行渲染。

#### B. 一键批量总结 (Batch Summary)
1.  **触发**: 用户在 Popup 中输入数量（如 40）并点击“一键总结邮件”。
2.  **获取邮件**:
    *   后台遍历所有账户的收件箱 (`inbox`)。
    *   查询最近 N 天的邮件，直到收集到目标数量（如 40 封）。
3.  **并发队列**:
    *   为了防止触发 API 速率限制，后台使用令牌桶算法 (`createRateLimitedRunner`) 控制并发请求（默认每秒 5 个请求）。
    *   对每封邮件独立执行“单封邮件总结”的逻辑。
4.  **反馈**: 每完成一封，后台发送 `BATCH_PROGRESS` 消息，Popup 更新进度提示。

#### C. 智能简报 (Briefing)
1.  **触发**: 用户点击“新简报”。
2.  **筛选**: 后台从本地缓存中读取过去 30 天的所有总结记录。
3.  **过滤**: 筛选出 **紧迫度 (Urgency Score) > 6** 的高优先级邮件。
4.  **生成**:
    *   将这些高优先级邮件的摘要拼接成一个新的 Prompt。
    *   要求 AI 扮演“行政助理”，生成一份简明扼要的日报/周报。
5.  **展示**: 生成结果保存到本地，用户点击“查看已有简报”时，打开一个新的 Tab (`briefing.html`) 展示 Markdown 渲染后的简报。

---

## 🧠 Agent 架构 (ReAct)

除了基础的摘要功能，本项目还包含一个基于 **ReAct (Reasoning and Acting)** 模式的智能邮件 Agent（位于 `agent/` 目录）。

### 1. 核心设计

Agent 模拟了人类“思考 -> 行动 -> 观察”的决策过程，通过多轮循环解决复杂的邮件处理任务：

*   **AgentCore (`agent/core/AgentCore.js`)**: 整个系统的“大脑”。它负责维护对话上下文，初始化系统提示词，并驱动 `While` 循环。
*   **LLMService (`agent/services/LLMService.js`)**: 推理层。将当前上下文发送给 AI，解析出 AI 的 **Thought**（思考过程）和 **Action**（准备调用的工具）。
*   **ToolManager & EmailTools (`agent/tools/`)**: 执行层。包含 Agent 可以使用的所有“技能”，如搜索邮件、查询标签、获取对话上下文、统计未读数等。

### 2. 运行流程 (伪代码)

```cpp
// --- 初始化: HighModel 制定宏观计划 (长时记忆) ---
plan = highModel(user_input + "制定任务拆解计划");

while (step < max_iterations) {
    // 1. 内存管理: 如果上下文过长，MidModel 执行压缩总结
    if (context.too_long) context = midModel(context + "压缩历史信息");

    // 2. 思考 (Thought): MidModel 结合 Plan 和上下文，决定下一步行动
    thought = midModel(user_input + plan + context + "进行推理");

    // 3. 行动 (Action): LowModel 极速解析工具参数 (降低延迟与成本)
    if (thought.needs_tool) {
        [action, params] = lowModel(thought + "提取工具指令");
        observation = tool_manager.use(action, params);
        
        // 4. 观察 (Observation): 反馈结果并存入上下文
        context += (thought + observation);

        // 5. 计划修正: HighModel 定期回顾并更新 Plan (长时记忆动态调整)
        if (step % 3 == 0) plan = highModel(plan + observation + "修正计划");
    } 
    else {
        // 最终回答: 任务圆满完成
        return midModel(context + "生成最终答案");
    }
    step++;
}

// --- 优雅退场: 如果步数耗尽，HighModel 根据现状做最后汇报 ---
return highModel(context + "步数耗尽，总结目前进展与失败原因");
```

### 3. 界面交互

*   **ChatInterface**: 提供类似 LibreChat 的交互体验。
*   **思考过程展示**: 界面会展示 AI 的“心路历程”（Thinking 徽章），点击可查看每一步调用的工具和思考逻辑。
