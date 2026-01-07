// LLMService.js - Handles communication with the AI provider

export class LLMService {
    constructor() {
        this.settings = window.appSettings;
        this.controller = null;
    }

    abort() {
        if (this.controller) {
            this.controller.abort();
            this.controller = null;
        }
    }

    // Generic internal call method
    async _callModel(modelName, messages, temperature = undefined) {
        if (!this.settings || !this.settings.apiKey) {
            throw new Error("请先在设置中配置 API Key");
        }

        const apiUrl = this.settings.apiUrl || "https://api.openai.com/v1/chat/completions";

        let finalTemp = temperature !== undefined ? temperature : this.settings.temperature;

        // Auto-fix for O-series models (o1-preview, o1-mini) which require temperature=1
        if (modelName.startsWith('o1') || modelName.startsWith('o3')) {
            finalTemp = 1;
            console.log(`[LLMService] Enforcing temperature=1 for reasoning model: ${modelName}`);
        }

        const body = {
            model: modelName,
            messages: messages,
            temperature: finalTemp
        };

        console.log(`[LLMService] Calling model: ${body.model}`);

        this.controller = new AbortController();
        const response = await fetch(apiUrl, {
            signal: this.controller.signal,
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
        // Use configured high temp or fallback to global/default
        const temp = this.settings.highModelTemperature !== undefined ? this.settings.highModelTemperature : undefined;
        this._injectLanguageInstruction(messages);
        return this._callModel(model, messages, temp);
    }

    // Mid Intelligence Model (Context Management, Orchestration) - Default: gpt-4o-mini
    async callMid(messages) {
        const model = this.settings.midModel || "gpt-4o-mini";
        const temp = this.settings.midModelTemperature !== undefined ? this.settings.midModelTemperature : undefined;
        this._injectLanguageInstruction(messages);
        return this._callModel(model, messages, temp);
    }

    // Helper to inject output language instruction into system prompt
    _injectLanguageInstruction(messages) {
        if (!messages || messages.length === 0) return;

        let outputLang = this.settings.outputLanguage || "English";
        // Map "中文" to "Simplified Chinese" if needed, though settings usually handle this
        if (outputLang === "中文") outputLang = "Simplified Chinese";

        const langInstruction = `\n\nIMPORTANT: Output in ${outputLang}.`;

        // Find the LAST system message, or append to the first one? usually specifically modifying the system prompt is best.
        // We will modify the first system prompt found, or add one if missing (less likely to be missing in agent).
        const systemMsg = messages.find(m => m.role === 'system');
        if (systemMsg) {
            // Check if we already injected it to avoid duplication if getting reused messages (though usually new arrays are passed)
            if (!systemMsg.content.includes("IMPORTANT: Output in")) {
                systemMsg.content += langInstruction;
            }
        }
    }

    // Low Intelligence Model (Tool Parsing, Formating) - Default: gpt-4o-mini
    async callLow(messages) {
        const model = this.settings.lowModel || "gpt-4o-mini";
        const temp = this.settings.lowModelTemperature !== undefined ? this.settings.lowModelTemperature : 0.3;
        // Low model usually needs lower temperature for deterministic parsing
        return this._callModel(model, messages, temp);
    }
}
