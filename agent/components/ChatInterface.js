// ChatInterface.js - Interact like LibreChat

export class ChatInterface {
    constructor(callbacks) {
        // Core elements
        this.messagesContainer = document.getElementById('messages-view');
        this.landingView = document.getElementById('landing-view');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.statusBar = document.getElementById('status-bar');

        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.sidebarCollapseBtn = document.querySelector('.sidebar-collapse-btn');

        this.userMenuBtn = document.querySelector('.user-menu-btn');
        this.userMenu = document.getElementById('user-menu');
        this.tempChatToggle = document.querySelector('.temp-chat-toggle input');

        this.onSend = callbacks.onSend;
        this.onClearHistory = callbacks.onClearHistory;
        this.onNewChat = callbacks.onNewChat;
        this.onStop = callbacks.onStop;
        this.onBranchNavigate = callbacks.onBranchNavigate;
        this.onRegenerate = callbacks.onRegenerate;
        this.onEditMessage = callbacks.onEditMessage;
        this.isChatActive = false;
        this.isGenerating = false;

        // Bind click outside to close menus
        this.bindGlobalEvents();
        this.initEvents();
        this.localize();
    }

    localize() {
        const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';

        // Update Static Elements in HTML
        const newChatSpan = document.querySelector('#new-chat-btn span');
        if (newChatSpan) newChatSpan.textContent = getText('agentNewChat', lang);

        const sideCollapse = document.querySelector('.sidebar-collapse-btn');
        if (sideCollapse) sideCollapse.title = lang === 'zh' ? '收起侧边栏' : 'Collapse sidebar';

        const userSpan = document.querySelector('.user-menu-btn span');
        if (userSpan) userSpan.textContent = lang === 'zh' ? '用户' : 'User';

        const greeting = document.querySelector('.landing-content h1');
        if (greeting) greeting.textContent = getText('agentGreeting', lang);

        if (this.userInput) this.userInput.placeholder = getText('agentInputPlaceholder', lang);
        if (this.statusBar) this.statusBar.textContent = getText('statusSaved', lang); // Placeholder

        // Suggestions
        const sTitles = document.querySelectorAll('.suggestion-card .s-title');
        const sTexts = document.querySelectorAll('.suggestion-card .s-text');
        if (sTitles.length >= 3) {
            sTitles[0].textContent = getText('agentSuggest1Title', lang);
            sTexts[0].textContent = getText('agentSuggest1Text', lang);
            sTitles[1].textContent = getText('agentSuggest2Title', lang);
            sTexts[1].textContent = getText('agentSuggest2Text', lang);
            sTitles[2].textContent = getText('agentSuggest3Title', lang);
            sTexts[2].textContent = getText('agentSuggest3Text', lang);
        }

        // User Menu
        const settingsItem = document.querySelector('.user-menu .dropdown-item:nth-child(1)');
        if (settingsItem) settingsItem.innerHTML = `<span class="m-icon">⚙️</span> ${getText('agentSettings', lang)}`;

        const clearItem = document.getElementById('clear-history-btn');
        if (clearItem) clearItem.innerHTML = `<span class="m-icon">🗑️</span> ${getText('agentClearChat', lang)}`;

        const logoutItem = document.querySelector('.user-menu .dropdown-item:last-child');
        if (logoutItem) logoutItem.innerHTML = `<span class="m-icon">🚪</span> ${getText('agentLogOut', lang)}`;

        // Thought Sidebar
        const tsLabel = document.querySelector('.ts-label');
        if (tsLabel) tsLabel.textContent = getText('agentActivity', lang);

        const tsEmpty = document.querySelector('.ts-empty');
        if (tsEmpty) tsEmpty.textContent = lang === 'zh' ? '选择“已思考”查看详细过程' : 'Select "Thinking" to view details';
    }

    initEvents() {
        // Input handling with Auto-Resize
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.userInput.addEventListener('input', () => {
            this.adjustTextareaHeight();
            this.updateSendButtonState();
        });

        // Click on Send
        this.sendBtn.addEventListener('click', () => this.handleSend());

        // Stop Generation Interaction
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => {
                this.stopGeneration();
            });
        }

        // Toggle Model Menu


        // Toggle User Menu
        if (this.userMenuBtn) {
            this.userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(this.userMenu);
            });
        }

        const clearHistoryBtn = document.getElementById('clear-history-btn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
                const confirmMsg = lang === 'zh' ? '确定要清除所有对话历史吗？此操作不可恢复。' : 'Are you sure you want to clear all chat history? This cannot be undone.';
                if (confirm(confirmMsg)) {
                    if (this.onClearHistory) this.onClearHistory();
                    this.closeDropdown(this.userMenu);
                }
            });
        }

        // Mobile Sidebar Toggle
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        }

        // Desktop Sidebar Collapse
        if (this.sidebarCollapseBtn) {
            this.sidebarCollapseBtn.addEventListener('click', () => {
                // Mock behavior: just hide sidebar for now or add a class
                // In a real app we'd animate width to 0
                this.sidebar.classList.toggle('collapsed'); // Need CSS for this if we want it to work fully
                // We rely purely on the CSS '.collapsed' class to resize the sidebar and hide text
                // Re-enable toggle button elsewhere if hidden? 
                // ChatGPT puts a small floating toggle when collapsed.
                // For simplicity, let's just toggle visibility.
            });
        }

        // New Chat
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => {
                if (this.onNewChat) this.onNewChat();
            });
        }

        // Attachment Button (Mock)
        const attachBtn = document.querySelector('.attach-btn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                // Trigger file input click if it existed
                console.log("Attachment clicked");
            });
        }

        // Temporary Chat Toggle
        if (this.tempChatToggle) {
            this.tempChatToggle.addEventListener('change', (e) => {
                console.log("Temp mode:", e.target.checked);
                // Logic to disable history saving would go here
            });
        }

        // Delegate click for suggestion cards
        if (this.landingView) {
            this.landingView.addEventListener('click', (e) => {
                const card = e.target.closest('.suggestion-card');
                if (card) {
                    this.userInput.focus();
                    // Handle via pure JS due to CSP restrictions
                    const sText = card.querySelector('.s-text');
                    this.userInput.value = sText ? sText.textContent : '';
                    this.adjustTextareaHeight();
                    this.updateSendButtonState();
                }
            });
        }

        // Delegate Message Actions (Copy, Edit, Branching)
        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('click', (e) => {
                this.handleMessageInteractions(e);
            });
        }
    }

    handleMessageInteractions(e) {
        const target = e.target;

        // Plugin Toggle
        const pluginHeader = target.closest('.plugin-header');
        if (pluginHeader) {
            const details = pluginHeader.nextElementSibling;
            if (details) details.classList.toggle('hidden');
            return;
        }

        // Copy Button
        const copyBtn = target.closest('button[title="Copy"]');
        if (copyBtn) {
            const messageBody = copyBtn.closest('.message-row').querySelector('.answer-content')?.innerText || '';
            navigator.clipboard.writeText(messageBody).then(() => {
                // Visual feedback?
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅';
                setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
            });
            return;
        }

        const branchBtn = target.closest('.branch-btn[data-node-id]');
        if (branchBtn) {
            if (branchBtn.classList.contains('disabled')) return;
            const nodeId = branchBtn.dataset.nodeId;
            const direction = parseInt(branchBtn.dataset.direction, 10);
            if (this.onBranchNavigate && nodeId && (direction === -1 || direction === 1)) {
                this.onBranchNavigate(nodeId, direction);
            }
            return;
        }

        // Regenerate Button
        const regenBtn = target.closest('button[title="Regenerate"]');
        if (regenBtn) {
            const row = regenBtn.closest('.message-row');
            const nodeId = row && row.dataset ? row.dataset.nodeId : null;
            if (this.onRegenerate && nodeId) {
                this.onRegenerate(nodeId);
            }
            return;
        }

        // Edit User Message
        const editBtn = target.closest('button[title="Edit"]');
        if (editBtn) {
            const row = editBtn.closest('.message-row');
            const nodeId = row && row.dataset ? row.dataset.nodeId : null;
            const body = row ? row.querySelector('.answer-content') : null;
            const currentText = body ? body.innerText : '';
            const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
            const promptText = lang === 'zh' ? '编辑消息' : 'Edit message';
            const edited = prompt(promptText, currentText);
            if (edited !== null && this.onEditMessage && nodeId) {
                this.onEditMessage(nodeId, edited);
            }
            return;
        }
    }

    adjustTextareaHeight() {
        this.userInput.style.height = 'auto';
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';

        // Ensure input-wrapper matches height if flexbox doesn't handle it
        if (this.userInput.value.trim() === '') {
            this.userInput.style.height = '24px'; // Min height
        }
    }

    updateSendButtonState() {
        if (this.userInput.value.trim().length > 0) {
            this.sendBtn.classList.add('active');
            this.sendBtn.removeAttribute('disabled');
        } else {
            this.sendBtn.classList.remove('active');
            // Optionally disable if empty
            // this.sendBtn.setAttribute('disabled', 'true');
        }
    }

    toggleDropdown(menu) {
        if (!menu) return;
        menu.classList.toggle('hidden');
    }

    closeDropdown(menu) {
        if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    }

    bindGlobalEvents() {
        document.addEventListener('click', (e) => {
            if (this.modelMenu && !this.modelMenu.contains(e.target) && !this.modelSelectorBtn.contains(e.target)) {
                this.closeDropdown(this.modelMenu);
            }
            if (this.userMenu && !this.userMenu.contains(e.target) && !this.userMenuBtn.contains(e.target)) {
                this.closeDropdown(this.userMenu);
            }
        });
    }

    toggleSendStop(isGenerating) {
        this.isGenerating = isGenerating;
        if (isGenerating) {
            this.sendBtn.classList.add('hidden');
            if (this.stopBtn) this.stopBtn.classList.remove('hidden');
        } else {
            this.sendBtn.classList.remove('hidden');
            if (this.stopBtn) this.stopBtn.classList.add('hidden');
        }
    }

    stopGeneration() {
        // Logic to abort LLM request
        console.log("Stopping generation...");
        this.toggleSendStop(false);
        if (this.onStop) this.onStop();

        // Mark UI session as finished
        if (this.activeSession) {
            this.activeSession.finish();
            this.activeSession = null;
        }
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;

        this.switchToChatView();

        // Toggle visual state
        this.toggleSendStop(true);

        // Reset input
        this.userInput.value = '';
        this.adjustTextareaHeight();
        this.updateSendButtonState();

        // Simulate AI thinking -> finish
        // In real integration, onSend is async and controls this state
        if (this.onSend) {
            this.onSend(text)
                .catch(err => {
                    console.error(err);
                    this.toggleSendStop(false);
                })
                .finally(() => {
                    // Usually AgentCore handles finishing, but UI safety check:
                    this.toggleSendStop(false); 
                });
        }

        // Fallback demo if no backend logic hooked up yet to stop it
        // setTimeout(() => this.toggleSendStop(false), 3000);
    }

    switchToChatView() {
        if (!this.isChatActive) {
            this.landingView.classList.add('hidden');
            this.messagesContainer.classList.remove('hidden');
            this.isChatActive = true;
        }
    }

    resetChat() {
        this.isChatActive = false;
        this.landingView.classList.remove('hidden');
        this.messagesContainer.classList.add('hidden');
        this.messagesContainer.innerHTML = ''; // Clear messages
        this.userInput.value = '';
        this.adjustTextareaHeight();

        // Reset sidebar active states (mock)
        const items = document.querySelectorAll('.history-item');
        items.forEach(i => i.classList.remove('active'));
    }

    // Load full message history
    loadMessages(messages) {
        this.resetChat(); // Clear first
        if (!messages || messages.length === 0) return;

        this.switchToChatView();

        messages.forEach(msg => {
            this.appendMessage(msg.role, msg.content, {
                ...(msg.meta || {}),
                nodeId: msg.nodeId,
                branch: msg.branch
            });
        });

        this.scrollToBottom();
    }

    appendMessage(role, text, meta) {
        // Normalize role for UI: 'assistant' (from storage) -> 'ai' (for CSS/Logic)
        if (role === 'assistant') role = 'ai';


        const row = document.createElement('div');
        row.className = `message-row ${role}`;
        if (meta && meta.nodeId) row.dataset.nodeId = meta.nodeId;

        const content = document.createElement('div');
        content.className = 'message-content';

        // Avatar
        if (role === 'user') {
            const avatar = document.createElement('div');
            avatar.className = `avatar ${role}`;
            avatar.textContent = 'U';
            content.appendChild(avatar);
        }

        // Body
        const body = document.createElement('div');
        body.className = 'message-body';

        // 1. Render Thought Badge if exists (for AI)
        if (role === 'ai') {
            const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
            const thoughtsList = (meta && meta.thoughts) ? meta.thoughts : [];
            const duration = (meta && meta.duration) ? meta.duration : 0;

            // Reconstruct session data for sidebar
            const sessionData = {
                startTime: Date.now(), // Fake time for history
                isFinished: true,
                steps: thoughtsList.map(t => {
                    let title = t.type;
                    let detail = t.content || '';
                    if (t.type === 'plan') title = (typeof getText === 'function' ? getText("agentPlan", lang) : null) || "Plan";
                    if (t.type === 'thought') title = (typeof getText === 'function' ? getText("agentThought", lang) : null) || "Thought";
                    if (t.type === 'action') {
                        title = (typeof getText === 'function' ? getText("agentAction", lang) : null) || "Action";
                        detail = `${t.tool}("${t.param}")`;
                    }
                    if (t.type === 'observation') title = "Observation";
                    
                    return {
                        type: t.type,
                        title: title,
                        detail: detail,
                        time: Date.now()
                    };
                })
            };

            const badge = document.createElement('div');
            badge.className = 'thought-badge'; // Finished state by default
            badge.style.fontWeight = 'bold';
            badge.style.opacity = '0.7';
            badge.style.cursor = 'pointer';

            // lang is already defined above
            const badgeText = lang === 'zh' ? `已思考 ${duration} 秒` : `Thought ${duration}s`;
            badge.innerHTML = `${badgeText} &gt;`;

            badge.addEventListener('click', () => {
                this.openThoughtSidebar(sessionData);
            });

            body.appendChild(badge);
        }

        // 2. Render Content
        const textDiv = document.createElement('div');
        textDiv.className = 'answer-content';

        if (role === 'ai' || role === 'user') {
            textDiv.innerHTML = this.renderMarkdown(text);
        } else {
            textDiv.textContent = text;
        }
        body.appendChild(textDiv);

        // 3. Render Actions (AI Only)
        // Message Actions (Only for AI or User? ChatGPT has copy/edit for User too)
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        if (role === 'user') {
            actions.innerHTML = `<button class="msg-action-btn" title="Edit">✎</button>`;
        } else {
            actions.innerHTML = `
                <button class="msg-action-btn" title="Copy">📋</button>
                <button class="msg-action-btn" title="Regenerate">🔄</button>
            `;
        }

        const branch = meta && meta.branch ? meta.branch : null;
        if (branch && branch.total > 1 && meta && meta.nodeId) {
            const branchControls = document.createElement('div');
            branchControls.className = 'message-branch-controls';
            const prevBtn = document.createElement('button');
            prevBtn.classList.add('branch-btn');
            if (!branch.hasPrev) prevBtn.classList.add('disabled');
            prevBtn.dataset.nodeId = meta.nodeId;
            prevBtn.dataset.direction = '-1';
            prevBtn.textContent = '<';

            const countSpan = document.createElement('span');
            countSpan.className = 'branch-count';
            countSpan.textContent = `${branch.index} / ${branch.total}`;

            const nextBtn = document.createElement('button');
            nextBtn.classList.add('branch-btn');
            if (!branch.hasNext) nextBtn.classList.add('disabled');
            nextBtn.dataset.nodeId = meta.nodeId;
            nextBtn.dataset.direction = '1';
            nextBtn.textContent = '>';

            branchControls.appendChild(prevBtn);
            branchControls.appendChild(countSpan);
            branchControls.appendChild(nextBtn);

            if (role === 'user') {
                body.appendChild(branchControls);
            } else {
                actions.appendChild(branchControls);
            }
        }

        content.appendChild(body);
        // Append actions under the message body for both user and AI rows
        if (role === 'ai' || role === 'user') body.appendChild(actions);

        row.appendChild(content);

        this.messagesContainer.appendChild(row);
        this.scrollToBottom();
    }
    // Render Sidebar History List
    renderSidebarList(sessions, onSelect) {
        const historyList = document.getElementById('chat-history');
        if (!historyList) return;

        historyList.innerHTML = ''; // Clear current mock data

        // Sort by date groups (Simplified: Just list them for now)
        // Group logic: Today, Yesterday, Previous
        const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
        const groups = {};
        groups[getText('agentToday', lang)] = [];
        groups[getText('agentYesterday', lang)] = [];
        groups[getText('agentEarlier', lang)] = [];

        sessions.forEach(session => {
            const date = new Date(session.updatedAt);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                groups[getText('agentToday', lang)].push(session);
            } else if (date.toDateString() === yesterday.toDateString()) {
                groups[getText('agentYesterday', lang)].push(session);
            } else {
                groups[getText('agentEarlier', lang)].push(session);
            }
        });

        // Render Groups
        Object.keys(groups).forEach(groupName => {
            const items = groups[groupName];
            if (items.length === 0) return;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'history-group';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'group-title';
            titleDiv.textContent = groupName;
            groupDiv.appendChild(titleDiv);

            items.forEach(session => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'history-item';
                itemDiv.dataset.id = session.id;

                // Active state
                // We'll manage this class manually on click

                itemDiv.innerHTML = `
                    <span class="icon">💬</span>
                    <span class="item-title">${session.title}</span>
                    <div class="item-actions">
                         <button class="delete-chat" title="Delete">🗑️</button>
                    </div>
                `;

                itemDiv.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-chat')) {
                        e.stopPropagation();
                        // Handle delete... (callback needed)
                        return;
                    }

                    // Set active visual
                    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
                    itemDiv.classList.add('active');

                    if (onSelect) onSelect(session.id);
                });

                groupDiv.appendChild(itemDiv);
            });

            historyList.appendChild(groupDiv);
        });
    }


    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    renderMarkdown(text) {
        if (!text) return '';

        // Escape HTML
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Protect fenced code blocks (prevent further substitutions inside them)
        const codeBlocks = [];
        html = html.replace(/```(?:\w*\n?)?([\s\S]*?)```/g, (_, code) => {
            codeBlocks.push(`<pre><code>${code}</code></pre>`);
            return `\x00CODE${codeBlocks.length - 1}\x00`;
        });

        // Headings
        html = html
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold + italic, bold, italic
        html = html
            .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Unordered lists: group consecutive "- item" lines into <ul>
        html = html.replace(/((?:^[ \t]*-[ \t]+.+\n?)+)/gm, (match) => {
            const items = match.trim().split('\n').map(line =>
                `<li>${line.replace(/^[ \t]*-[ \t]+/, '')}</li>`
            ).join('');
            return `<ul>${items}</ul>`;
        });

        // Ordered lists: group consecutive "1. item" lines into <ol>
        html = html.replace(/((?:^[ \t]*\d+\.[ \t]+.+\n?)+)/gm, (match) => {
            const items = match.trim().split('\n').map(line =>
                `<li>${line.replace(/^[ \t]*\d+\.[ \t]+/, '')}</li>`
            ).join('');
            return `<ol>${items}</ol>`;
        });

        // Newlines to <br>
        html = html.replace(/\n/g, '<br>');

        // Restore code blocks
        html = html.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)] || '');

        return html;
    }

    // Agent Thought Process UI (New Sidebar Approach)
    createAgentSession() {
        // 1. Create the Message Row (for final answer, initially empty or with placeholder)
        // Wait... typically thought process happens BEFORE the message content is streamed.
        // O1 style: "Thinking..." badge appears first.

        const row = document.createElement('div');
        row.className = 'message-row ai';

        const content = document.createElement('div');
        content.className = 'message-content';



        const body = document.createElement('div');
        body.className = 'message-body';

        // The Badge
        const badge = document.createElement('div');
        badge.className = 'thought-badge thinking';
        badge.style.fontWeight = 'bold';
        badge.style.opacity = '0.7';
        badge.style.cursor = 'pointer';
        
        const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
        const thinkingText = lang === 'zh' ? '思考中' : 'Thinking';
        badge.innerHTML = `${thinkingText} &gt;`;

        // Check if user wants to see details
        badge.addEventListener('click', () => {
            this.openThoughtSidebar(sessionData);
        });

        // Placeholder for answer stream
        const answerDiv = document.createElement('div');
        answerDiv.className = 'answer-content';
        // answerDiv.textContent = '...'; // Show loading cursor?

        body.appendChild(badge);
        body.appendChild(answerDiv);

        content.appendChild(body);
        row.appendChild(content);

        this.switchToChatView();
        this.messagesContainer.appendChild(row);
        this.scrollToBottom();

        // Data Structure for this session
        const sessionData = {
            startTime: Date.now(),
            steps: [],
            isFinished: false
        };

        // Timer Interval
        const intervalId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);

            // If sidebar is open and showing THIS session, update header timer too
            if (this.currentSidebarSession === sessionData) {
                const sidebarTime = document.getElementById('ts-total-time');
                if (sidebarTime) sidebarTime.textContent = `· ${elapsed}s`;
            }
        }, 1000);

        // Sidebar Elements
        const sidebar = document.getElementById('thought-sidebar');
        const tsContent = document.getElementById('ts-content');
        const tsClose = document.getElementById('ts-close-btn');

        if (tsClose) {
            tsClose.onclick = () => this.closeThoughtSidebar();
        }

        const sessionApi = {
            addStep: (type, title, detail) => {
                const step = { type, title, detail, time: Date.now() };
                sessionData.steps.push(step);

                // If this session is currently displayed in sidebar, append to DOM
                if (this.currentSidebarSession === sessionData) {
                    this.appendStepToSidebar(step);
                }
            },
            updateTimer: () => {
                // Handled by interval
            },
            finish: () => {
                clearInterval(intervalId);
                sessionData.isFinished = true;
                badge.classList.remove('thinking');
                const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);
                const text = lang === 'zh' ? `思考 ${elapsed} 秒` : `Thought ${elapsed}s`;
                badge.innerHTML = `${text} &gt;`;

                // If sidebar open, update final state
                if (this.currentSidebarSession === sessionData) {
                    const lang = (window.appSettings && window.appSettings.displayLanguage) || 'en';
                    const step = { type: 'finish', title: lang === 'zh' ? "完成" : "Finished", detail: null, time: Date.now(), isFinal: true };
                    this.appendStepToSidebar(step);
                }
            },
            removeIfEmpty: () => {
                if (sessionData.steps.length === 0) {
                    badge.remove();
                }
            },
            // Helper to stream answer content
            appendAnswer: (text) => {
                answerDiv.innerHTML = this.renderMarkdown(text);
                this.scrollToBottom();
            }
        };

        this.activeSession = sessionApi;
        return sessionApi;
    }

    openThoughtSidebar(sessionData) {
        this.currentSidebarSession = sessionData;
        const sidebar = document.getElementById('thought-sidebar');
        const content = document.getElementById('ts-content');
        const headerTime = document.getElementById('ts-total-time');

        if (!sidebar || !content) return;

        // Render all existing steps
        content.innerHTML = '';
        sessionData.steps.forEach(step => {
            content.appendChild(this.createStepElement(step));
        });

        // Show Total Time
        const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);
        headerTime.textContent = `· ${sessionData.isFinished ? 'Finished' : elapsed + 's'}`;

        sidebar.classList.add('open');
    }

    closeThoughtSidebar() {
        const sidebar = document.getElementById('thought-sidebar');
        if (sidebar) sidebar.classList.remove('open');
        this.currentSidebarSession = null;
    }

    appendStepToSidebar(step) {
        const content = document.getElementById('ts-content');
        if (!content) return;
        content.appendChild(this.createStepElement(step));
        content.scrollTop = content.scrollHeight;
    }

    createStepElement(step) {
        const div = document.createElement('div');
        div.className = `ts-step active type-${step.type || 'generic'}`;

        let icon = '📝';
        if (step.type === 'plan') icon = '📋';
        if (step.type === 'thought') icon = '🤔';
        if (step.type === 'action') icon = '🔌';
        if (step.type === 'observation') icon = '🔍';
        if (step.type === 'error') icon = '❌';
        if (step.type === 'finish') icon = '🏁';
        if (step.type === 'memory') icon = '📦';

        // Header
        const header = document.createElement('div');
        header.className = 'ts-step-header';
        header.style.marginBottom = '4px';
        header.style.fontWeight = 'bold';
        header.style.color = 'var(--text-main)';
        header.innerHTML = `<span class="icon">${icon}</span> ${step.title || 'Step'}`;
        div.appendChild(header);

        // Body
        if (step.detail) {
            const body = document.createElement('div');
            body.className = 'ts-step-body';
            // Use existing classes for specific formatting if needed
            if (step.type === 'action') {
                body.className += ' ts-tool-call';
                body.style.fontFamily = 'monospace';
            }
            body.style.color = 'var(--text-muted)';
            body.style.whiteSpace = 'pre-wrap';
            body.textContent = typeof step.detail === 'object' ? JSON.stringify(step.detail, null, 2) : step.detail;
            div.appendChild(body);
        }

        return div;
    }

    renderMarkdownTo(element, text) {
        element.innerHTML = this.renderMarkdown(text);
    }

    updateStatus(text) {
        if (this.statusBar) this.statusBar.innerText = text;
    }
}
