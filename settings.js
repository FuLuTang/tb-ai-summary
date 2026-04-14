// settings.js - 处理配置加载和全局变量

console.log("Loading settings.js...");

// 全局变量
var appSettings = {
    maxCacheEntries: 500,
    maxRequestsPerSecond: 5,
    maxConcurrentRequests: 20,
    popupWidth: 400,
    autoTagging: false,
    maxTagsPerEmail: 3,
    temperature: 1.0,
    briefingUrgency: 5,
    displayLanguage: "en",
    outputLanguage: "English",
    lowModel: "gpt-5-nano",
    lowModelTemperature: 1.0, // Default 1.0 for O1 compatibility
    midModel: "gpt-5-mini",
    midModelTemperature: 1.0,
    highModel: "gpt-5.1",
    highModelTemperature: 1.0,
    promptProfile: "default",
    customPrompts: {
        agentPersona: "",
        agentPlan: "",
        agentReview: "",
        agentThought: "",
        agentFinal: "",
        agentCompress: "",
        summary: "",
        briefing: ""
    }
};

const DEFAULT_PROMPTS = {
    agentPersona: "你是一个强大的雷鸟邮件助手。你可以通过思考 (Thought)、行动 (Action) 和观察 (Observation) 的方式来解决用户的问题。\n\n你可以使用的工具：{{tools}}\n\n输出格式要求：\n如果你需要思考，请输出：\nThought: [你的思考过程]\nAction: [工具名](\"[参数]\")\n\n当你得到 Observation 后，继续思考，直到得出结论。\n最终回答请直接输出结果。\n\n核心原则：\n1. **识别意图**：如果是简单的寒暄（如“你好”、“在吗”），请礼貌回应并简要介绍自己能做什么（如总结邮件、查找信息等），**不要调用任何工具**。只有当用户有明确的需求（如“看看邮件”、“总结一下”、“找某人”）时，才开始使用工具。\n2. **回答风格**：最终回答要精炼简洁，开门见山。\n3. **避免废话**：除非用户明确要求，否则不要在结尾询问“还有什么可以帮您的？”之类的客套话。",
    agentPlan: "基于当前的对话，请创建一个简洁的文本计划（3-5步）来解决用户的最新请求。如果请求很简单（例如“你好”），只需说“无需复杂计划”。",
    agentReview: "根据最近的观察，这个计划仍然有效吗？如果需要，请提供修订后的计划。如果有效，只需说“计划看起来不错”。",
    agentThought: "任务：分析当前情况。我们需要使用工具来获取更多信息，还是现在就可以回答用户？",
    agentFinal: "请对用户的请求提供最终回答。",
    agentCompress: "你是一个内存管理助手。请将以下对话历史总结为一段简洁的摘要，保留所有关键事实、检索到的邮件信息和当前进度，以便助手能够继续工作。",
    briefing: "你是一位行政秘书。根据过去 24 小时内的以下邮件摘要，生成一份“每日简报”。\n\n格式要求：\n1. **概览**：1-2 句总体情况说明。\n2. **最高优先级**：列出 3 个最紧急的项目（紧急分数高）。\n3. **关键主题**：按主题（如工作、新闻、个人）对其他项目进行归类。\n4. **行动计划**：建议的处理顺序。\n\n请使用 ${outputLang} 回答。使用 Markdown 格式。",
    summary: "你是一个智能邮件助手。请分析用户提供的邮件，并输出一个具有以下结构的 JSON 对象：\n{\n    \"summary\": \"字符串 (使用 ${outputLang} 总结内容，少于 100 字)\",\n    \"keywords\": [\"字符串 (短关键词，每个 2-4 字，使用 ${outputLang}，例如 [发票], [会议])\"],\n    \"urgency_score\": 数字 (1-10),\n    \"urgency_reason\": \"字符串 (解释打分原因（非复述内容），一句话，最多1次逗号1次句号,简述即可。使用 ${outputLang})\"\n}\n\n紧急程度评分规则 (1-10)：\n- 10（危急）：需要立即采取行动。存在财务损失风险，由高层下达的命令，或重要的私人对话。\n- 8-9（高）：需要在 48 小时内处理。重要的漏洞、截止日期临近的任务或提醒。\n- 5-7（中）：正常工作任务。在本周内处理即可。标准请求、代码审查或常规会议邀请。\n- 3-4（低）：可能有用的信息，但无需立即采取措施。周报、课程提醒、新登录提醒等。\n- 1-2（无）：仅供参考。新闻简报、广告、垃圾邮件、推广消息或验证码等。\n\n得分增强点：\n- 如果主题包含“紧急”、“急件”、“尽快”或“重要”，分数 +2。\n- 如果发件人是已知的 VIP 或管理人员，分数 +2。\n- 如果发件人是 noreply，分数 -1。\n- 如果是验证码，标记为无重要性。\n\n约束：\n- 仅输出有效的 JSON。\n- 不要包含 markdown ' ```json ' 代码块标记。\n- summary, keywords 和 urgency_reason 必须使用 ${outputLang}。"
};

var activeTasks = {}; // { headerMessageId: { status: 'loading' | 'success' | 'error', data: ..., error: ... } }

// 加载设置
async function loadSettings() {
    try {
        const result = await browser.storage.local.get("app_settings");

        if (result.app_settings) {
            // Use Object.assign to update the existing object reference, 
            // so that other modules holding a reference (like LLMService) see the updates.
            Object.assign(appSettings, result.app_settings);
        } else {
            // 尝试兼容旧的存储方式 (以防万一)
            const legacyResult = await browser.storage.local.get([
                "apiKey", "apiUrl", "temperature",
                "maxCacheEntries", "maxRequestsPerSecond", "maxConcurrentRequests",
                "popupWidth", "autoTagging", "maxTagsPerEmail",
                "briefingUrgency", "displayLanguage", "outputLanguage"
            ]);
            if (legacyResult.apiKey) {
                Object.assign(appSettings, legacyResult);
            }
        }
        console.log("Settings loaded:", appSettings);
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}
