// AgentCore.js - The ReAct Logic Loop

export class AgentCore {
    constructor(llmService, toolManager, ui) {
        this.llm = llmService;
        this.tools = toolManager;
        this.ui = ui;
        this.history = [];
        this.maxIterations = 15;
    }

    initSystemPrompt() {
        const toolDescriptions = this.tools.getToolDescriptions();
        const prompt = `你是一个强大的雷鸟邮件助手。你可以通过思考 (Thought)、行动 (Action) 和观察 (Observation) 的方式来解决用户的问题。

你可以使用的工具：${toolDescriptions}

输出格式要求：
如果你需要思考，请输出：
Thought: [你的思考过程]
Action: [工具名]("[参数]")

当你得到 Observation 后，继续思考，直到得出结论。
最终回答请直接输出结果。

注意事项：
1. 最终回答要精炼简洁，开门见山展示结果。
2. 除非用户明确要求，否则不要在结尾询问“还有什么可以帮您的？”或“下一步让我做什么？”之类的客套话。
`;
        return prompt;
    }

    async startSession(userText) {
        // Reset or Initialize History
        // 这里简化处理，每次新会话可能需要重置，或者保留上下文。
        // 为了演示 ReAct，我们暂且每次请求一个独立的 Loop，但保留历史记录会更好。
        // 目前 agent.js 的逻辑是每次 runAgentLoop 重新构建 history (System + User).
        // 我们改为维护一个持续的 Session history? 
        // 之前的 agent.js 逻辑是无状态的（每次只有 System + User）。
        // 让我们保持一致，或者稍微改进。

        const systemPrompt = this.initSystemPrompt();

        let currentLoopHistory = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
        ];

        // 创建全局思考 Session 并启动总计时器
        const agentSession = this.ui.createAgentSession();
        const timerId = setInterval(() => {
            agentSession.updateTimer();
        }, 1000);

        this.ui.updateStatus("正在启动思考...");

        try {
            let iterations = 0;

            while (iterations < this.maxIterations) {
                iterations++;
                this.ui.updateStatus(`正在进行第 ${iterations} 轮分析...`);

                const response = await this.llm.call(currentLoopHistory);
                const content = response.choices[0].message.content;

                // 1. 更鲁棒的解析
                const actionMatch = content.match(/Action:\s*(\w+)\((?:"([^"]*)")?\)/i);
                const hasAction = !!actionMatch;

                let thought = "";
                if (hasAction) {
                    thought = content.split(/Action:/i)[0];
                } else if (content.includes("Final Answer:")) {
                    thought = content.split(/Final Answer:/i)[0];
                } else {
                    thought = content;
                }
                thought = thought.replace(/Thought:/i, "").trim();

                // 记录步骤
                if (thought || hasAction) {
                    agentSession.addStep(thought, hasAction ? actionMatch[1] : "");
                }

                if (hasAction) {
                    const toolName = actionMatch[1];
                    const toolParam = actionMatch[2] || "";

                    const observation = await this.tools.execute(toolName, toolParam);
                    const observationStr = `Observation: ${JSON.stringify(observation)}`;

                    currentLoopHistory.push({ role: 'assistant', content: content });
                    currentLoopHistory.push({ role: 'user', content: observationStr });
                } else {
                    // 没有 Action 了，处理最终回答
                    let finalAnswer = content;
                    if (content.includes("Final Answer:")) {
                        finalAnswer = content.split("Final Answer:")[1].trim();
                    } else {
                        finalAnswer = content.replace(/Thought:/i, "").trim();
                    }

                    // 停止计时并标记 Session 完成
                    clearInterval(timerId);
                    agentSession.finish();
                    agentSession.removeIfEmpty();

                    this.ui.appendMessage('ai', finalAnswer);
                    this.ui.updateStatus("分析完成");
                    break;
                }
            }

            if (iterations >= this.maxIterations) {
                clearInterval(timerId);
                agentSession.finish();
                this.ui.appendMessage('ai', "抱歉，任务过于复杂（已达 15 轮思考上限），已停止。");
                this.ui.updateStatus("处理超时");
            }

        } catch (err) {
            console.error(err);
            this.ui.appendMessage('system', `错误: ${err.message}`);
            this.ui.updateStatus("发生错误");
        }
    }
}
