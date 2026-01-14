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
    agentPlan: "Based on the conversation, please create a concise text-based plan (3-5 steps) to solve the user's latest request. If the request is simple (like \"hi\"), just say \"No complex plan needed\".",
    agentReview: "Based on recent observations, is this plan still valid? If needed, provide a revised plan. If valid, just say \"Plan looks good\".",
    agentThought: "Task: Analyze the current situation. Do we need to use a tool to get more information, or can we answer the user now?",
    agentFinal: "Please provide the final answer to the user request.",
    agentCompress: "You are a memory management assistant. Please summarize the following conversation history into a concise summary, retaining all key facts, retrieved email info, and current progress so the Agent can continue.",
    briefing: "You are a executive secretary. Based on the following email summaries from the last 24 hours, generate a \"Daily Briefing\".\n\nFormat:\n1. **Overview**: 1-2 sentences overall status.\n2. **Top Priorities**: List 3 most urgent items (High urgency score).\n3. **Key Themes**: Group other items by topic (e.g. Work, News, Personal).\n4. **Action Plan**: Suggested order of processing.\n\nOutput in ${outputLang}. Use Markdown.",
    summary: "You are a smart email assistant. Please analyze the email provided by the user and output a JSON object with the following schema:\n{\n    \"summary\": \"string (Summarize the content in ${outputLang}, < 100 words)\",\n    \"keywords\": [\"string (Short keywords, 2-4 words in ${outputLang}, e.g. [Invoice], [Meeting])\"],\n    \"urgency_score\": number (1-10),\n    \"urgency_reason\": \"string (解释打分原因（非复述内容），一句话，最多1次逗号1次句号,简述即可。Given in ${outputLang}\"\n}\n\nUrgency Score Rules (1-10):\n- 10（危急）：需要立即采取行动。存在财务损失风险，或直接由CEO/老师下达的命令，或者对我的私人对话。\n- 8-9（高）：需要在48小时内采取行动。重要的漏洞，老师要求，或临近截止日期的作业&提醒。(不包括无用推广)\n- 5-7（中）：正常工作任务。在本周内处理。标准请求、代码审查或会议邀请。\n- 3-4（低）：可能有用的信息，但无需立即采取措施。每周报告、课程提醒，常见新登录提醒\n- 1-2（无）：仅供参考，新闻简报、广告或垃圾邮件,推广消息，不重要的服务升级,验证码推送\n\nContext Boosters:\n- If the subject contains \"Urgent\", \"Emergency\", \"ASAP\", or \"Important\", boost the score by +2.\n- If the author is a known VIP or manager (infer from context), boost the score by +2.\n- 若发件人是noreply, 分数 -1.\n- 若为验证码，无重要性\n\nConstraint:\n- Output ONLY valid JSON.\n- Do not include markdown ' \`\`\`json ' fences.\n- Summary, keywords, action_items, and urgency_reason MUST be in ${outputLang}."
};

// var activeTasks = {}; // REMOVED for MV3 Migration - Use storage instead

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
