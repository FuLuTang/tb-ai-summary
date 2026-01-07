import { SessionService } from '../services/SessionService.js';

export class AgentCore {
    constructor(llmService, toolManager, ui) {
        this.llm = llmService;
        this.tools = toolManager;
        this.ui = ui;
        this.sessionService = new SessionService();
        this.maxIterations = 15;
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
            this.loadHistoryToSidebar();
        }

        // 2. Persist User Message
        this.sessionService.addMessage(session.id, { role: 'user', content: userText });

        // 3. Prepare Context
        const toolDescriptions = this.tools.getToolDescriptions();
        const outputLang = appSettings.outputLanguage || "Simplified Chinese";
        const baseSystemPrompt = `You are an intelligent Thunderbird Email Agent.
Available Tools:
${toolDescriptions}
Current Date: ${new Date().toLocaleString()}

Your goal is to assist the user with email tasks. Please respond in ${outputLang}.
`;

        const contextMessages = session.messages.map(m => ({ role: m.role, content: m.content }));

        // UI Initialization
        const agentUiSession = this.ui.createAgentSession();
        const timerId = setInterval(() => agentUiSession.updateTimer(), 1000);
        this.ui.updateStatus("正在制定计划 (HighModel)...");

        let currentPlan = "";
        let finalAnswer = "";
        let thoughtLog = [];
        let executionContext = [...contextMessages]; // Working memory for the loop

        try {
            // --- Phase 1: Planning (High Model) ---
            const planPrompt = [
                { role: 'system', content: baseSystemPrompt + "\nYour goal is to satisfy the user request." },
                ...contextMessages,
                { role: 'user', content: `Based on the conversation, please create a concise text-based plan (3-5 steps) to solve the user's latest request. If the request is simple (like "hi"), just say "No complex plan needed".` }
            ];

            const planRes = await this.llm.callHigh(planPrompt);
            currentPlan = planRes.choices[0].message.content;

            const lang = appSettings.displayLanguage || "en";
            agentUiSession.addStep(getText("agentPlan", lang), currentPlan);
            thoughtLog.push({ type: 'plan', content: currentPlan });

            // --- Phase 2: ReAct Loop (Mid & Low Models) ---
            let iterations = 0;

            while (iterations < this.maxIterations) {
                iterations++;

                // --- Memory Management (README Step 1) ---
                const contextLength = executionContext.reduce((acc, m) => acc + m.content.length, 0);
                if (contextLength > 12000) {
                    this.ui.updateStatus(`${getText("agentMemoryCompressed", lang)} (${contextLength})...`);
                    const compressPrompt = [
                        { role: 'system', content: "你是一个记忆管理助手。请将以下对话历史压缩成一段简练的摘要，保留所有关键事实、已获取的邮件信息和目前的进展，以便 Agent 继续工作。" },
                        { role: 'user', content: JSON.stringify(executionContext) }
                    ];
                    const compressRes = await this.llm.callMid(compressPrompt);
                    executionContext = [
                        { role: 'system', content: `之前对话的压缩记忆：\n${compressRes.choices[0].message.content}` }
                    ];
                    agentUiSession.addStep(getText("agentMemoryCompressed", lang), "Long context summarized to save tokens.");
                }

                this.ui.updateStatus(`${getText("agentThinking", lang)} (${iterations})...`);

                // 2.1 Thought (Mid Model)
                // MidModel sees: System + History + Plan + Current Observation Loop
                const thoughtPrompt = [
                    { role: 'system', content: baseSystemPrompt },
                    ...executionContext,
                    { role: 'system', content: `Current Plan:\n${currentPlan}\n\nTask: Analyze the current situation. Do we need to use a tool to get more information, or can we answer the user now?\nOutput Format:\nThought: [Your reasoning]\nDecision: [CALL_TOOL or ANSWER]` }
                ];

                const midRes = await this.llm.callMid(thoughtPrompt);
                const midContent = midRes.choices[0].message.content;

                // Parse Thought
                let thought = midContent;
                let decision = "ANSWER";
                if (midContent.includes("Thought:")) {
                    thought = midContent.split("Thought:")[1].split("Decision:")[0].trim();
                }
                if (midContent.includes("Decision:")) {
                    decision = midContent.split("Decision:")[1].trim().toUpperCase();
                }

                agentUiSession.addStep(getText("agentThought", lang), thought);
                thoughtLog.push({ type: 'thought', content: thought, step: iterations });

                // Add thought to context for continuity
                executionContext.push({ role: 'assistant', content: midContent });

                // 2.2 Action or Answer?
                if (decision.includes("CALL_TOOL") || midContent.includes("CALL_TOOL")) {
                    // --- Action Extraction (Low Model) ---
                    this.ui.updateStatus(`Round ${iterations}: Tool Parsing (LowModel)...`);

                    const actionPrompt = [
                        { role: 'system', content: `You are a strict JSON parser. Available tools:\n${toolDescriptions}` },
                        { role: 'user', content: `Based on this thought: "${thought}", what tool should be called?\nOutput strictly in format: Action: ToolName("Param")` }
                    ];

                    const lowRes = await this.llm.callLow(actionPrompt);
                    const lowContent = lowRes.choices[0].message.content;

                    const actionMatch = lowContent.match(/Action:\s*(\w+)\((?:["']([^"']*)["'])?\)/i);

                    if (actionMatch) {
                        const toolName = actionMatch[1];
                        const toolParam = actionMatch[2] || "";

                        agentUiSession.addStep(getText("agentAction", lang), `${toolName}("${toolParam}")`);
                        thoughtLog.push({ type: 'action', tool: toolName, param: toolParam });

                        // Execute
                        this.ui.updateStatus(`Executing ${toolName}...`);
                        const observation = await this.tools.execute(toolName, toolParam);
                        const observationStr = `Observation: ${JSON.stringify(observation)}`;

                        // Feed back to context
                        executionContext.push({ role: 'user', content: observationStr });
                        thoughtLog.push({ type: 'observation', content: observation });

                        // --- Plan Review (High Model) - Every 3 steps ---
                        if (iterations % 3 === 0) {
                            this.ui.updateStatus(`Reviewing Plan (HighModel)...`);
                            const reviewPrompt = [
                                ...executionContext,
                                { role: 'user', content: `Current Plan: ${currentPlan}\n\nBased on recent observations, is this plan still valid? If needed, provide a revised plan. If valid, just say "Plan looks good".` }
                            ];
                            const reviewRes = await this.llm.callHigh(reviewPrompt);
                            const reviewContent = reviewRes.choices[0].message.content;
                            if (!reviewContent.toLowerCase().includes("looks good")) {
                                currentPlan = reviewContent;
                                agentUiSession.addStep(`🔄 Plan Updated`, currentPlan);
                            }
                        }

                    } else {
                        // Low model failed to parse
                        const errorMsg = "Observation: Failed to parse tool action from LowModel.";
                        executionContext.push({ role: 'user', content: errorMsg });
                        agentUiSession.addStep(getText("agentError", lang), "LowModel parse failed");
                    }

                } else {
                    // --- Final Answer Generation (Mid Model) ---
                    this.ui.updateStatus(`Generating Answer...`);
                    // We let MidModel generate the final conversational response based on the accumulated context
                    const finalPrompt = [
                        ...executionContext,
                        { role: 'user', content: "Please provide the final answer to the user request." }
                    ];

                    const finalRes = await this.llm.callMid(finalPrompt);
                    finalAnswer = finalRes.choices[0].message.content;
                    break;
                }
            }

            if (iterations >= this.maxIterations) {
                this.ui.updateStatus(`Finalizing progress after exhaustion...`);
                const exitPrompt = [
                    ...executionContext,
                    { role: 'user', content: "你目前已经耗尽了所有思考步数（15步）。请基于目前的进展，总结你已经完成了哪些部分，哪些部分失败了，并给出目前能提供的最好结论。使用中文。" }
                ];
                const finalRes = await this.llm.callHigh(exitPrompt);
                finalAnswer = "【自动总结：思考步数已耗尽】\n" + finalRes.choices[0].message.content;
            }

            // Cleanup & Save
            clearInterval(timerId);
            agentUiSession.finish();
            this.ui.updateStatus("完成");

            const metaData = { thoughts: thoughtLog };
            this.sessionService.addMessage(session.id, {
                role: 'assistant',
                content: finalAnswer,
                meta: metaData
            });

            this.ui.appendMessage('ai', finalAnswer, metaData);

        } catch (err) {
            console.error(err);
            clearInterval(timerId);
            agentUiSession.finish();
            this.ui.appendMessage('system', `Error: ${err.message}`);
            this.ui.updateStatus("Error Occurred");
        }
    }
}
