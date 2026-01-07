// LLMService.js - Handles communication with the AI provider

export class LLMService {
    constructor() {
        this.settings = window.appSettings;
    }

    // Generic internal call method
    async _callModel(modelName, messages, temperature = undefined) {
        if (!this.settings || !this.settings.apiKey) {
            throw new Error("请先在设置中配置 API Key");
        }

        const apiUrl = this.settings.apiUrl || "https://api.openai.com/v1/chat/completions";

        const body = {
            model: modelName,
            messages: messages,
            temperature: temperature !== undefined ? temperature : this.settings.temperature
        };

        console.log(`[LLMService] Calling model: ${body.model}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 错误: ${response.status} - ${errorText}`);
        }

        return await response.json();
    }

    // High Intelligence Model (Planning, Complex Reasoning) - Default: gpt-4o
    async callHigh(messages) {
        const model = this.settings.highModel || "gpt-4o";
        return this._callModel(model, messages);
    }

    // Mid Intelligence Model (Context Management, Orchestration) - Default: gpt-4o-mini
    async callMid(messages) {
        const model = this.settings.midModel || "gpt-4o-mini";
        return this._callModel(model, messages);
    }

    // Low Intelligence Model (Tool Parsing, Formating) - Default: gpt-4o-mini
    async callLow(messages) {
        const model = this.settings.lowModel || "gpt-4o-mini";
        // Low model usually needs lower temperature for deterministic parsing
        return this._callModel(model, messages, 0.3);
    }
}
