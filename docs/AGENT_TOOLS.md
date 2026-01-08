# AI Agent Prompts & Tools Configuration Guide

This document explains how to view, modify, and extend the prompt configurations and tool capabilities of this Thunderbird AI Assistant.

---

## 1. Prompt Configuration

### UI Modification (Recommended)
For daily use and debugging, you can modify prompts directly in the settings page:
1. Open **Settings (Options)** -> **Prompts**.
2. Change **Prompt Profile** to **Custom**.
3. Edit the text boxes (Base Persona, Summary Instruction, Briefing Instruction, etc.).
4. Click **Save Settings**.

### Source Code Modification (Default Values)
To permanently change the initial default values for new installations, edit:
*   **File**: `settings.js`
*   **Variable**: `const DEFAULT_PROMPTS`
*   **Contents**: Includes `agentPersona`, `summary` logic, and `briefing` templates.

---

## 2. Tool Definitions

The set of tools that the Agent can call during task execution.

### Instruction Manual (AI Understanding Layer)
The "manual" that the AI sees to decide which tool to call is located at:
*   **File**: `agent/tools/ToolManager.js`
*   **Method**: `getToolDescriptions()`
*   **Role**: Defines tool names and parameter explanations.

### Execution Layer (Code Implementation Layer)
The actual parameter parsing and Thunderbird API call logic are located at:
*   **File**: `agent/tools/EmailTools.js`
*   **Role**: Defines the real JSON data structures returned to the AI.

---

## 3. Tool Technical Specifications

Detailed technical parameters and return structures for all currently supported tools:

### 1. Basic Email Operations
| Tool Name | Param Type | Description | Return Structure (Example) |
| :--- | :--- | :--- | :--- |
| **`search_emails`** | `string` | Search by keywords in subject or author | `[{id, subject, author, date}]` |
| **`list_recent_emails`** | `number` | Get the last X emails | `[{id, subject, author, date}]` |
| **`get_email_details`** | `number` | Get email body preview (500 chars) | `{subject, from, date, preview}` |

### 2. Context & Tags
| Tool Name | Param Type | Description | Return Structure (Example) |
| :--- | :--- | :--- | :--- |
| **`search_by_tag`** | `string` | Search by Thunderbird tag name | `[{id, subject, author, date, tags}]` |
| **`get_thread_context`** | `number` | Get conversation thread for an email | `[{id, subject, author, date, is_current}]` |
| **`list_all_tags`** | `void` | List all defined tags in Thunderbird | `[{key, tag, color}]` |
| **`count_unread_messages`** | `void` | Count unread messages in inbox | `{unread_count}` |

### 3. AI Cache & Tasks
| Tool Name | Param Type | Description | Return Structure (Example) |
| :--- | :--- | :--- | :--- |
| **`list_cached_summaries`** | `number` | View recently generated AI summaries | `[{id, subject, author, generated_at, keywords}]` |
| **`get_existing_briefing`** | `void` | Read today's generated briefing | `{content, generated_at}` |
| **`trigger_briefing`** | `void` | Start a new briefing generation in background | `"Task started..."` |
| **`trigger_batch_summary`** | `number` | Start batch summary for last X emails | `"Task started..."` |

### 4. System Helpers
| Tool Name | Param Type | Description | Return Structure (Example) |
| :--- | :--- | :--- | :--- |
| **`get_time`** | `void` | Get system time and timezone | `{current_time, weekday, timezone}` |
| **`get_user_identities`** | `void` | List all configured email accounts | `[{name, email, accountName}]` |

---

## 4. How to Add a New Tool?

1.  **Implement Logic**: Add a new async method to the `emailTools` object in `agent/tools/EmailTools.js`. Ensure it returns easy-to-understand JSON or string data.
2.  **Register Description**: Add the tool name and description to `getToolDescriptions()` in `agent/tools/ToolManager.js`.
3.  **Reload**: Reload the extension in Thunderbird.
