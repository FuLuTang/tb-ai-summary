# Thunderbird AI Summary Extension

[English](README.md) | [中文](README.zh-CN.md) | [Dev Guide](MODIFICATION_GUIDE.md)

## What is this?

A Thunderbird extension that allows you to summarize emails using AI.
It can summarize a **single email**, add **tags**, **urgency score**, auto generate **mount of summaries on one click**, and generate a **smart briefing** by your existing email summaries cached in local storage.

## 🚀 How to Install Temporarily in Thunderbird (Debug Mode)

If you want to test or develop this extension, you can load it temporarily via Thunderbird's debug features.

1.  **Open Thunderbird**.
2.  Click the menu button (≡) in the top-right corner, then select **"Add-ons and Themes"**.
3.  On the Add-ons Manager page, click the **gear icon (⚙️)** in the top-right corner.
4.  Select **"Debug Add-ons"**.
5.  On the debug page that opens, click the **"Load Temporary Add-on..."** button.
6.  Navigate to this project's directory in the file selection dialog and select the **`manifest.json`** file.
7.  Click "Open".

You should now see the extension icon in the Thunderbird toolbar.

> **Note**: Temporarily loaded extensions are removed when Thunderbird is closed. You will need to repeat these steps the next time you launch it.

---

## 🛠 Internal Logic Explained

This extension consists of two main parts: **Popup (Frontend UI)** and **Background (Backend Service)**. They communicate via messaging.

### 1. Core Architecture

*   **Popup (`popup.html` / `popup.js`)**:
    *   **Role**: Handles user interaction, displaying buttons, progress bars, and the final summary results.
    *   **Interaction**: When the user clicks a button (e.g., "Summarize", "Batch Summarize"), it sends a message (`sendMessage`) to the background.
    *   **Listening**: It listens for real-time messages from the background (e.g., progress updates, error alerts) and dynamically updates the UI.

*   **Background (`background.js`)**:
    *   **Role**: Handles core logic, including calling the Thunderbird API to read emails, calling the OpenAI API to generate summaries, and managing caching.
    *   **Persistence**: Uses `browser.storage.local` to store API settings and email summary caches to avoid wasting tokens.

### 2. Feature Logic Breakdown

#### A. Single Email Summary
1.  **Trigger**: User clicks the extension icon while reading an email. The Popup initializes and gets the currently displayed message ID.
2.  **Request**: User clicks "Summarize", and the Popup sends a `START_SUMMARY` message.
3.  **Process**:
    *   Background checks for existing cache. If it exists and force refresh is not requested, the cached result is returned directly.
    *   If no cache, the background calls `browser.messages.getFull` to get the full email text.
    *   Parses the email body (removes HTML tags).
    *   Constructs a Prompt (including sender, subject, body) and calls the OpenAI API.
4.  **Response**: AI returns a summary in JSON format (including summary, tags, urgency score). Background saves the result to cache and broadcasts a `SUMMARY_UPDATE` message to the Popup for rendering.

#### B. Batch Summary
1.  **Trigger**: User enters a quantity (e.g., 40) in the Popup and clicks "Batch Summarize".
2.  **Fetch Emails**:
    *   Background iterates through the inboxes (`inbox`) of all accounts.
    *   Queries emails from the last N days until the target quantity (e.g., 40 emails) is collected.
3.  **Concurrent Queue**:
    *   To prevent hitting API rate limits, the background uses a token bucket algorithm (`createRateLimitedRunner`) to control concurrent requests (default 5 requests per second).
    *   Executes the "Single Email Summary" logic independently for each email.
4.  **Feedback**: Upon completion of each email, the background sends a `BATCH_PROGRESS` message, and the Popup updates the progress indicator.

#### C. Smart Briefing
1.  **Trigger**: User clicks "New Briefing".
2.  **Filter**: Background reads all summary records from the last 30 days from the local cache.
3.  **Select**: Filters for high-priority emails with **Urgency Score > 6**.
4.  **Generate**:
    *   Concatenates summaries of these high-priority emails into a new Prompt.
    *   Asks the AI to act as an "Executive Assistant" and generate a concise daily/weekly report.
5.  **Display**: The generated result is saved locally. When the user clicks "View Existing Briefing", a new Tab (`briefing.html`) is opened to display the Markdown-rendered briefing.

---

## 🧠 Agent Architecture (ReAct)

Beyond basic summarization, this project includes a smart Email Agent based on the **ReAct (Reasoning and Acting)** pattern (located in the `agent/` directory).

### 1. Core Design

The Agent mimics the human decision-making process: **Thought -> Action -> Observation**. It solves complex mail tasks through iterative cycles:

*   **AgentCore (`agent/core/AgentCore.js`)**: The "Brain" of the system. It manages conversation context, initializes system prompts, and drives the `While` loop.
*   **LLMService (`agent/services/LLMService.js`)**: The Reasoning Layer. Sends context to the AI and parses the **Thought** (logic) and **Action** (tool to call).
*   **ToolManager & EmailTools (`agent/tools/`)**: The Execution Layer. Contains all "skills" available to the Agent, such as searching emails, querying tags, getting thread context, etc.

### 2. Execution Flow (Pseudocode)

```cpp
// ReAct Core Logic: Thought -> Action -> Observation
while (step < max_iterations) {
    // 1. Planning
    plan = midModel("user_input" + "Decompose task, provide steps");
    
    // 2. Thought: Analyze progress
    query = "user_input" + plan + "Is current info complete?";
    context += midModel(query);
    ai_needs_tool = lowModel(context);

    // 3. Action: If tool call needed
    if (ai_needs_tool) {
        [action, params] = lowModel(context + "Which tool to call?");
        observation = tool_manager.use(action, params);
        
        // 4. Observation: Feed result back and iterate
        tool_manager.wait();
        context += observation;
    } 
    else {
        // 5. Final Answer: Task finished, output result
        final_answer = midModel(context + "Task finished, output result");
        return final_answer;
    }
}
```

### 3. UI Interaction

*   **ChatInterface**: Provides a LibreChat-like interactive experience.
*   **Thought Process**: The UI displays the AI's internal reasoning (via a "Thinking" badge), allowing users to inspect tool calls and logic for each step.
