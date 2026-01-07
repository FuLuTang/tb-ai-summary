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
        },
        onNewChat: async () => {
            await agent.startNewChat();
        },
        onStop: () => {
            agent.stop();
        }
    });

    const llm = new LLMService();
    const tools = new ToolManager();
    const agent = new AgentCore(llm, tools, ui);

    // Initialize/Load Session
    await agent.startNewChat();

    // 3. Listen for Settings Updates
    browser.runtime.onMessage.addListener(async (message) => {
        if (message.type === "SETTINGS_UPDATED") {
            console.log("Settings updated message received. Reloading...");
            if (window.loadSettings) {
                await window.loadSettings();
                // Re-localize UI
                ui.localize();
            }
        }
    });

    console.log("Agent initialized.");
});
