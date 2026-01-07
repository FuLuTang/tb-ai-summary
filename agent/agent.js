// agent.js - Entry Point

import { ChatInterface } from './components/ChatInterface.js';
import { LLMService } from './services/LLMService.js';
import { ToolManager } from './tools/ToolManager.js';
import { AgentCore } from './core/AgentCore.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Settings (Global)
    if (window.loadSettings) {
        await window.loadSettings();
    } else {
        console.error("loadSettings not found!");
    }

    // 2. Initialize Components
    const ui = new ChatInterface({
        onSend: async (text) => {
            await agent.sendMessage(text);
        },
        onClearHistory: async () => {
            await agent.clearHistory();
        }
    });

    const llm = new LLMService();
    const tools = new ToolManager();
    const agent = new AgentCore(llm, tools, ui);

    // Initialize/Load Session
    await agent.startNewChat();

    console.log("Agent initialized.");
});
