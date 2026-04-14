import { SessionService } from '../services/SessionService.js';

export class AgentCore {
    constructor(llmService, toolManager, ui) {
        this.llm = llmService;
        this.tools = toolManager;
        this.ui = ui;
        this.sessionService = new SessionService();
        this.maxIterations = 15;
        this.isStopped = false;
        this.currentUiSession = null;
    }

    async startNewChat() {
        this.sessionService.currentSessionId = null;
        this.ui.resetChat();
        await this.loadHistoryToSidebar();
    }

    async loadHistoryToSidebar() {
        const sessions = await this.sessionService.getAllSessions();
        this.ui.renderSidebarList(sessions, (sessionId) => {
            this.switchSession(sessionId);
        });
    }

    async clearHistory() {
        await this.sessionService.clearAll();
        await this.startNewChat();
    }

    stop() {
        this.isStopped = true;
        this.llm.abort();
        this.ui.updateStatus("已停止");
        if (this.currentUiSession) {
            this.currentUiSession.finish();
            this.currentUiSession = null;
        }
    }

    async _ensureSession() {
        let session = await this.sessionService.getCurrentSession();
        if (!session) {
            session = await this.sessionService.createSession();
            await this.loadHistoryToSidebar();
        }
        return session;
    }

    async _loadCurrentConversation(sessionId) {
        const messages = await this.sessionService.getDisplayMessages(sessionId);
        this.ui.loadMessages(messages);
    }

    async switchSession(sessionId) {
        const session = await this.sessionService.getSession(sessionId);
        if (!session) return;
        this.sessionService.currentSessionId = sessionId;
        await this._loadCurrentConversation(sessionId);
    }

    async navigateBranch(nodeId, direction) {
        const session = await this.sessionService.getCurrentSession();
        if (!session) return;
        await this.sessionService.switchToSibling(session.id, nodeId, direction);
        await this._loadCurrentConversation(session.id);
    }

    async editUserMessage(nodeId, newText) {
        if (!newText || !newText.trim()) return;
        const session = await this.sessionService.getCurrentSession();
        if (!session) return;

        const targetNode = await this.sessionService.getNode(session.id, nodeId);
        if (!targetNode || targetNode.role !== 'user' || !targetNode.parentId) return;

        const newUserNode = await this.sessionService.addMessage(
            session.id,
            { role: 'user', content: newText.trim() },
            { parentId: targetNode.parentId }
        );
        if (!newUserNode) return;

        await this.loadHistoryToSidebar();
        await this._loadCurrentConversation(session.id);

        const contextMessages = await this.sessionService.getContextMessages(session.id, newUserNode.id);
        await this._generateAssistantReply(session.id, contextMessages, newUserNode.id);
        await this.loadHistoryToSidebar();
    }

    async regenerateAssistant(nodeId) {
        const session = await this.sessionService.getCurrentSession();
        if (!session) return;

        const targetNode = await this.sessionService.getNode(session.id, nodeId);
        if (!targetNode || (targetNode.role !== 'assistant' && targetNode.role !== 'ai') || !targetNode.parentId) return;

        await this.sessionService.setCurrentLeaf(session.id, targetNode.parentId);
        await this._loadCurrentConversation(session.id);

        const contextMessages = await this.sessionService.getContextMessages(session.id, targetNode.parentId);
        await this._generateAssistantReply(session.id, contextMessages, targetNode.parentId);
        await this.loadHistoryToSidebar();
    }

    async sendMessage(userText) {
        const trimmed = (userText || '').trim();
        if (!trimmed) return;

        const session = await this._ensureSession();
        const parentId = (session.tree && session.tree.currentLeafId) || 'root';
        const userNode = await this.sessionService.addMessage(
            session.id,
            { role: 'user', content: trimmed },
            { parentId }
        );
        if (!userNode) return;

        await this.loadHistoryToSidebar();
        await this._loadCurrentConversation(session.id);

        const contextMessages = await this.sessionService.getContextMessages(session.id, userNode.id);
        await this._generateAssistantReply(session.id, contextMessages, userNode.id);
        await this.loadHistoryToSidebar();
    }

    async _generateAssistantReply(sessionId, contextMessages, assistantParentId) {
        let thoughtLog = [];
        const startTime = Date.now();
        const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
        const toolDescriptions = this.tools.getToolDescriptions();

        // Get the custom persona from settings, or fallback to the rich default defined in settings.js
        const customPersona = appSettings.customPrompts ? appSettings.customPrompts.agentPersona : "";
        const persona = customPersona || DEFAULT_PROMPTS.agentPersona;

        const baseSystemPrompt = `${persona}
可用工具：
${toolDescriptions}
当前时间：${new Date().toLocaleString()}
`;

        const agentUiSession = this.ui.createAgentSession();
        this.currentUiSession = agentUiSession;
        const timerId = setInterval(() => agentUiSession.updateTimer(), 1000);
        this.ui.updateStatus("正在制定计划 (HighModel)...");

        let currentPlan = '';
        let finalAnswer = '';
        let executionContext = [...contextMessages];
        this.isStopped = false;

        try {
            const defaultPlan = '基于当前的对话，请创建一个简洁的文本计划（3-5步）来解决用户的最新请求。如果请求很简单（例如“你好”），只需回复“无需复杂计划”。';
            const customPlan = appSettings.customPrompts ? appSettings.customPrompts.agentPlan : "";
            const planInstr = customPlan || defaultPlan;

            const planPrompt = [
                { role: 'system', content: baseSystemPrompt + "\n你的目标是满足用户的需求。" },
                ...contextMessages,
                { role: 'user', content: planInstr }
            ];

            const planRes = await this.llm.callHigh(planPrompt);
            currentPlan = planRes.choices[0].message.content;

            agentUiSession.addStep('plan', getText("agentPlan", lang), currentPlan);
            thoughtLog.push({ type: 'plan', content: currentPlan });

            let iterations = 0;

            while (iterations < this.maxIterations && !this.isStopped) {
                iterations++;

                const contextLength = executionContext.reduce((acc, m) => acc + m.content.length, 0);
                if (contextLength > 12000) {
                    this.ui.updateStatus(`${getText("agentMemoryCompressed", lang)} (${contextLength})...`);
                    const defaultCompress = "你是一个内存管理助手。请将以下对话历史总结为一段简洁的摘要，保留所有关键事实、检索到的邮件信息和当前进度，以便助手能够继续工作。";
                    const customCompress = appSettings.customPrompts ? appSettings.customPrompts.agentCompress : "";
                    const compressInstr = customCompress || defaultCompress;

                    const compressPrompt = [
                        { role: 'system', content: compressInstr },
                        { role: 'user', content: JSON.stringify(executionContext) }
                    ];
                    const compressRes = await this.llm.callMid(compressPrompt);
                    const compressedContent = compressRes.choices[0].message.content;
                    executionContext = [
                        { role: 'system', content: `内存已压缩（之前的上下文）： \n${compressedContent}` }
                    ];
                    agentUiSession.addStep('memory', getText("agentMemoryCompressed", lang), "Long context summarized to save tokens.");
                }

                this.ui.updateStatus(`${getText("agentThinking", lang)} (${iterations})...`);

                const defaultThought = "任务：分析当前情况。我们需要使用工具来获取更多信息，还是现在就可以回答用户？";
                const customThought = appSettings.customPrompts ? appSettings.customPrompts.agentThought : "";
                const thoughtInstr = customThought || defaultThought;

                const thoughtPrompt = [
                    { role: 'system', content: baseSystemPrompt },
                    ...executionContext,
                    { role: 'system', content: `当前计划：\n${currentPlan}\n\n${thoughtInstr}\n输出格式：\nThought: [你的思考过程]\nDecision: [CALL_TOOL 或 ANSWER]` }
                ];

                const midRes = await this.llm.callMid(thoughtPrompt);
                const midContent = midRes.choices[0].message.content;

                let thought = midContent;
                let decision = "ANSWER";
                if (midContent.includes("Thought:")) {
                    thought = midContent.split("Thought:")[1].split("Decision:")[0].trim();
                }
                if (midContent.includes("Decision:")) {
                    decision = midContent.split("Decision:")[1].trim().toUpperCase();
                }

                agentUiSession.addStep('thought', getText("agentThought", lang), thought);
                thoughtLog.push({ type: 'thought', content: thought, step: iterations });
                executionContext.push({ role: 'assistant', content: midContent });

                if (decision.includes("CALL_TOOL") || midContent.includes("CALL_TOOL")) {
                    this.ui.updateStatus(`Round ${iterations}: Tool Parsing (LowModel)...`);

                    const actionPrompt = [
                        { role: 'system', content: `你是一个严格的 JSON 解析器。可用工具：\n${toolDescriptions}` },
                        { role: 'user', content: `基于此思考：“${thought}”，应该调用哪个工具？\n严格按此格式输出：Action: 工具名("参数")` }
                    ];

                    const lowRes = await this.llm.callLow(actionPrompt);
                    const lowContent = lowRes.choices[0].message.content;

                    const actionMatch = lowContent.match(/Action:\s*(\w+)\((?:["']([^"']*)["'])?\)/i);

                    if (actionMatch) {
                        const toolName = actionMatch[1];
                        const toolParam = actionMatch[2] || "";

                        agentUiSession.addStep('action', getText("agentAction", lang), `${toolName}("${toolParam}")`);
                        thoughtLog.push({ type: 'action', tool: toolName, param: toolParam });

                        this.ui.updateStatus(`Executing ${toolName}...`);
                        const observation = await this.tools.execute(toolName, toolParam);
                        const observationStr = `观察结果: ${JSON.stringify(observation)}`;

                        executionContext.push({ role: 'user', content: observationStr });
                        thoughtLog.push({ type: 'observation', content: observation });
                        agentUiSession.addStep('observation', 'Tool Output', observation);

                        if (iterations % 3 === 0) {
                            this.ui.updateStatus(`Reviewing Plan (HighModel)...`);

                            const defaultReview = '根据最近的观察结果，此计划是否仍然有效？如果需要，请提供修订后的计划。如果有效，只需回复“计划看起来不错”。';
                            const customReview = appSettings.customPrompts ? appSettings.customPrompts.agentReview : "";
                            const reviewInstr = customReview || defaultReview;

                            const reviewPrompt = [
                                ...executionContext,
                                { role: 'user', content: `当前计划: ${currentPlan}\n\n${reviewInstr}` }
                            ];
                            const reviewRes = await this.llm.callHigh(reviewPrompt);
                            const reviewContent = reviewRes.choices[0].message.content;
                            if (!reviewContent.toLowerCase().includes("looks good")) {
                                currentPlan = reviewContent;
                                agentUiSession.addStep('plan', `🔄 Plan Updated`, currentPlan);
                            }
                        }
                    } else {
                        const errorMsg = "Observation: Failed to parse tool action from LowModel.";
                        executionContext.push({ role: 'user', content: errorMsg });
                        agentUiSession.addStep('error', getText("agentError", lang), "LowModel parse failed");
                    }
                } else {
                    this.ui.updateStatus(`Generating Answer...`);
                    const defaultFinal = "请对用户的请求提供最终回答。";
                    const customFinal = appSettings.customPrompts ? appSettings.customPrompts.agentFinal : "";
                    const finalInstr = customFinal || defaultFinal;

                    const finalPrompt = [
                        ...executionContext,
                        { role: 'user', content: finalInstr }
                    ];

                    const finalRes = await this.llm.callMid(finalPrompt);
                    finalAnswer = finalRes.choices[0].message.content;
                    break;
                }
            }

            if (!finalAnswer && this.isStopped) {
                finalAnswer = lang === 'zh' ? '已停止生成。' : 'Generation stopped.';
            } else if (!finalAnswer) {
                this.ui.updateStatus(`Finalizing progress after exhaustion...`);
                const exitPrompt = [
                    ...executionContext,
                    { role: 'user', content: "你目前已经耗尽了所有思考步数（15步）。请基于目前的进展，总结你已经完成了哪些部分，哪些部分失败了，并给出目前能提供的最好结论。使用中文。" }
                ];
                const finalRes = await this.llm.callHigh(exitPrompt);
                finalAnswer = "【自动总结：思考步数已耗尽】\n" + finalRes.choices[0].message.content;
            }

            clearInterval(timerId);
            agentUiSession.finish();
            this.currentUiSession = null;
            this.ui.updateStatus("完成");

            const endTime = Date.now();
            const durationSec = Math.floor((endTime - startTime) / 1000);
            const metaData = {
                thoughts: thoughtLog,
                duration: durationSec
            };

            await this.sessionService.addMessage(
                sessionId,
                { role: 'assistant', content: finalAnswer, meta: metaData },
                { parentId: assistantParentId }
            );
            await this._loadCurrentConversation(sessionId);
        } catch (err) {
            console.error(err);
            clearInterval(timerId);
            agentUiSession.finish();
            this.currentUiSession = null;
            this.ui.appendMessage('system', `Error: ${err.message}`);
            this.ui.updateStatus("Error Occurred");
            await this._loadCurrentConversation(sessionId);
        }
    }
}
