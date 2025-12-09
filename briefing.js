document.addEventListener('DOMContentLoaded', async () => {
    const contentDiv = document.getElementById('content');
    const timestampDiv = document.getElementById('timestamp');

    // Load language
    const settings = await browser.storage.local.get("app_settings");
    const lang = (settings.app_settings && settings.app_settings.displayLanguage) ? settings.app_settings.displayLanguage : "en";

    // Update static text
    const titleEl = document.getElementById('briefingTitle');
    if (titleEl) titleEl.textContent = getText("briefingTitle", lang);
    const headerEl = document.getElementById('briefingTitleHeader');
    if (headerEl) headerEl.textContent = getText("briefingTitle", lang);

    const showMessage = (text) => {
        contentDiv.textContent = text;
        contentDiv.classList.add('error');
    };

    try {
        const data = await browser.storage.local.get('latest_briefing');
        const briefing = data.latest_briefing;

        if (!briefing) {
            showMessage(getText("briefingNoContent", lang));
            return;
        }

        // Format timestamp
        if (briefing.timestamp) {
            const date = new Date(briefing.timestamp);
            timestampDiv.textContent = `${getText("briefingGeneratedAt", lang)}${date.toLocaleString(lang === 'zh' ? 'zh-CN' : (lang === 'ja' ? 'ja-JP' : (lang === 'fr' ? 'fr-FR' : 'en-US')))}`;
        }

        // Display content
        if (briefing.content) {
            contentDiv.classList.remove('error');
            contentDiv.textContent = briefing.content;
        } else {
            showMessage(getText("briefingNoContent", lang));
        }

    } catch (error) {
        console.error('Failed to load briefing:', error);
        showMessage(`${getText("statusError", lang).replace("{error}", error.message)}`);
    }
});
