# Modification & Development Guide

This guide is designed to help developers (and AI assistants) quickly understand the project structure and locate the code responsible for specific features.

## 📂 Project Structure

| File | Type | Responsibility |
| :--- | :--- | :--- |
| **`manifest.json`** | Config | Extension configuration, permissions (`messagesRead`, `storage`, etc.), and entry points. |
| **`background.js`** | Backend | **Core Logic**. Handles email fetching, OpenAI API calls, caching, batch processing, and briefing generation. |
| **`popup.html`** | UI | The main small window when you click the extension icon. Contains the "Summarize" and "Batch" buttons. |
| **`popup.js`** | Frontend | Logic for `popup.html`. Sends commands (`START_SUMMARY`) to background and listens for updates. |
| **`options.html`** | UI | Settings page (API Key, Language, Model, etc.). |
| **`options.js`** | Frontend | Logic for saving/loading settings to `local.storage`. |
| **`briefing.html`** | UI | The full-page report view for the "Briefing" feature. |
| **`briefing.js`** | Frontend | Loads the briefing content from storage and displays it. |
| **`i18n.js`** | Utils | Centralized translation strings (En, Zh, Fr, Ja). Used by all frontend files. |

---

## 🛠 Common Modification Tasks

### 1. Changing the AI Prompts
All Prompt Engineering logic resides in **`background.js`**.

*   **Single Email Summary Prompt**:
    *   Locate function: `callAI(...)`
    *   It defines the `systemPrompt` (Rules, JSON schema, Urgency scoring) and `userPrompt` (Email content).
    *   *Tip*: If you want to change how tags are generated or how urgency is scored, edit the `systemPrompt` here.

*   **Briefing Prompt**:
    *   Locate function: `callAIBriefing(...)`
    *   It defines the `systemPrompt` (Executive assistant persona) and `userPrompt` (List of summaries).

### 2. Modifying UI Styles
*   **Popup Window Size**:
    *   Go to **`popup.html`** -> `<style>` -> `body { width: ... }`.
*   **Briefing Page Style**:
    *   Go to **`briefing.html`** -> `<style>`.

### 3. Adding/Changing Translations
*   Go to **`i18n.js`**.
*   Add a new key to the `translations` object for each language.
*   In your JS file, use `getText("yourKey", lang)` to retrieve it.

### 4. Adjusting Batch Processing Logic
*   Go to **`background.js`**.
*   Locate `handleBatchSummary(...)`.
*   You can tweak:
    *   How many emails are fetched (`targetCount`).
    *   The search range (`ranges = [7, 30, 90]`).
    *   Concurrency limits (`createRateLimitedRunner`).

### 5. Debugging
*   **Frontend Logs**: Right-click the Popup -> Inspect.
*   **Background Logs**: In Thunderbird, go to Add-ons -> Gear Icon -> Debug Add-ons -> "Inspect" on this extension. Console logs from `background.js` appear here.

---

## 🔄 Data Flow

1.  **User Action** (Popup) -> `browser.runtime.sendMessage({ type: "START..." })`
2.  **Controller** (Background) -> Receives message in `onMessage` listener.
3.  **Processing**:
    *   Checks Cache (`browser.storage.local`).
    *   If miss, fetches email (`browser.messages.getFull`).
    *   Calls AI (`callAI`).
4.  **Storage**: Saves result to `browser.storage.local` (Key: `cache_{id}`).
5.  **Feedback**: Broadcasts `SUMMARY_UPDATE` message.
6.  **UI Update** (Popup/Options) -> Listens for message and updates DOM.
