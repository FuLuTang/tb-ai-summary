import { SessionService } from '../services/SessionService.js';

export class AgentCore {
    constructor(llmService, toolManager, ui) {
        this.llm = llmService;
        this.tools = toolManager;
        this.ui = ui;
        this.sessionService = new SessionService();
        this.maxIterations = 15;
    }

    initSystemPrompt() {
        const toolDescriptions = this.tools.getToolDescriptions();
        return `你是一个强大的雷鸟邮件助手。你可以通过思考 (Thought)、行动 (Action) 和观察 (Observation) 的方式来解决用户的问题。

你可以使用的工具：${toolDescriptions}

输出格式要求：
如果你需要思考，请输出：
Thought: [你的思考过程]
Action: [工具名]("[参数]")

当你得到 Observation 后，继续思考，直到得出结论。
最终回答请直接输出结果。

核心原则：
1. **识别意图**：如果是简单的寒暄（如“你好”、“在吗”），请礼貌回应并简要介绍自己能做什么（如总结邮件、查找信息等），**不要调用任何工具**。只有当用户有明确的需求（如“看看邮件”、“总结一下”、“找某人”）时，才开始使用工具。
2. **回答风格**：最终回答要精炼简洁，开门见山。
3. **避免废话**：除非用户明确要求，否则不要在结尾询问“还有什么可以帮您的？”之类的客套话。
`;
    }

    // Initialize a new chat
    async startNewChat() {
        // Lazy creation: Don't create session yet, just reset UI
        this.sessionService.currentSessionId = null;
        this.ui.resetChat();
        this.loadHistoryToSidebar();
        // return session; // No session yet
    }

    // Load sidebar history
    loadHistoryToSidebar() {
        const sessions = this.sessionService.getAllSessions();
        this.ui.renderSidebarList(sessions, (sessionId) => {
            this.switchSession(sessionId);
        });
    }

    async clearHistory() {
        this.sessionService.clearAll();
        await this.startNewChat();
    }

    // Switch to a specific session
    async switchSession(sessionId) {
        const session = this.sessionService.getSession(sessionId);
        if (!session) return;

        // 1. Set current session cursor
        this.sessionService.currentSessionId = sessionId;

        // 2. Load messages into UI
        this.ui.loadMessages(session.messages);
    }

    // Main entry point for user messages
    async sendMessage(userText) {
        // 1. Ensure Session Exists (Lazy Create)
        let session = this.sessionService.getCurrentSession();
        if (!session) {
            session = this.sessionService.createSession();
            this.loadHistoryToSidebar(); // Refresh sidebar to show new chat
        }

        // 2. Persist User Message
        this.sessionService.addMessage(session.id, { role: 'user', content: userText });

        // 3. Prepare Context for LLM (System + History)
        const systemPrompt = this.initSystemPrompt();
        const contextMessages = [
            { role: 'system', content: systemPrompt },
            ...session.messages.map(m => ({ role: m.role, content: m.content })) // Only take role/content
        ];

        // 4. Start ReAct Loop
        // Create UI Session for Thoughts
        const agentUiSession = this.ui.createAgentSession();
        const timerId = setInterval(() => agentUiSession.updateTimer(), 1000);
        this.ui.updateStatus("正在启动思考...");

        let finalAnswer = "";
        let thoughtLog = []; // To store in metadata

        try {
            let iterations = 0;
            // The ephemeral loop history starts with Full Context
            let currentLoopMessages = [...contextMessages];

            while (iterations < this.maxIterations) {
                iterations++;
                this.ui.updateStatus(`正在进行第 ${iterations} 轮分析...`);

                const response = await this.llm.call(currentLoopMessages);
                const content = response.choices[0].message.content;

                // Parse Response
                const actionMatch = content.match(/Action:\s*(\w+)\((?:"([^"]*)")?\)/i);
                const hasAction = !!actionMatch;

                let thought = content;
                if (hasAction) {
                    thought = content.split(/Action:/i)[0];
                } else if (content.includes("Final Answer:")) {
                    thought = content.split(/Final Answer:/i)[0];
                }
                thought = thought.replace(/Thought:/i, "").trim();

                // UI Update
                if (thought || hasAction) {
                    agentUiSession.addStep(thought, hasAction ? actionMatch[1] : "");
                    thoughtLog.push({ step: iterations, thought, action: hasAction ? actionMatch[1] : null });
                }

                if (hasAction) {
                    const toolName = actionMatch[1];
                    const toolParam = actionMatch[2] || "";

                    const observation = await this.tools.execute(toolName, toolParam);
                    const observationStr = `Observation: ${JSON.stringify(observation)}`;

                    // Add to loop history
                    currentLoopMessages.push({ role: 'assistant', content: content });
                    currentLoopMessages.push({ role: 'user', content: observationStr });

                    thoughtLog.push({ step: iterations, observation: observation }); // Log observation meta
                } else {
                    // Final Answer Reached
                    if (content.includes("Final Answer:")) {
                        finalAnswer = content.split("Final Answer:")[1].trim();
                    } else {
                        finalAnswer = content.replace(/Thought:/i, "").trim();
                    }
                    break;
                }
            }

            if (iterations >= this.maxIterations) {
                finalAnswer = "抱歉，任务过于复杂（已达 15 轮思考上限），已停止。";
                agentUiSession.addStep("Error: Max iterations reached.", null);
            }

            // Cleanup UI
            clearInterval(timerId);
            agentUiSession.finish();
            agentUiSession.removeIfEmpty();
            this.ui.updateStatus("分析完成");

            // 5. Persist Assistant Answer
            const metaData = { thoughts: thoughtLog };
            this.sessionService.addMessage(session.id, {
                role: 'assistant',
                content: finalAnswer,
                meta: metaData // Save thoughts for debugging or re-rendering
            });

            // 6. Display Final Answer
            this.ui.appendMessage('ai', finalAnswer, metaData);

        } catch (err) {
            console.error(err);
            clearInterval(timerId);
            agentUiSession.finish();
            this.ui.appendMessage('system', `错误: ${err.message}`);
            this.ui.updateStatus("发生错误");
        }
    }
}
