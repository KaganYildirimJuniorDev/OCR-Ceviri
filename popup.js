document.addEventListener("DOMContentLoaded", () => {
  const sourceLangSelect = document.getElementById("sourceLang");
  const targetLangSelect = document.getElementById("targetLang");
  const modeBtns = document.querySelectorAll(".mode-btn");
  const startBtn = document.getElementById("startBtn");
  const startBtnText = document.getElementById("startBtnText");
  const startBtnIcon = document.getElementById("startBtnIcon");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const modeTexts = {
    auto: "Ekranda Alan Seç",
    dictionary: "Kelime / Metin Seç",
    inpainting: "Resim / Manga Seç",
    live: "Canlı Altyazıyı Başlat"
  };

  const modeIcons = {
    auto: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>`,
    dictionary: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    inpainting: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`,
    live: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
  };

  // Ayarları Yükle
  chrome.storage.local.get(["sourceLang", "targetLang", "activeMode", "history"], (res) => {
    if (res.sourceLang) {
      sourceLangSelect.value = res.sourceLang;
    }
    if (res.targetLang) {
      targetLangSelect.value = res.targetLang;
    }
    const currentMode = res.activeMode || "auto";
    setActiveModeUI(currentMode);
    renderHistory(res.history || []);
  });

  // Kaynak Dil Değişimi
  sourceLangSelect.addEventListener("change", (e) => {
    chrome.storage.local.set({ sourceLang: e.target.value });
  });

  // Hedef Dil Değişimi
  targetLangSelect.addEventListener("change", (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
  });

  // Mod Seçimi
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      setActiveModeUI(mode);
      chrome.storage.local.set({ activeMode: mode });
    });
  });

  function setActiveModeUI(mode) {
    modeBtns.forEach(b => {
      if (b.getAttribute("data-mode") === mode) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });

    if (startBtnText && modeTexts[mode]) {
      startBtnText.innerText = modeTexts[mode];
    }
    if (startBtnIcon && modeIcons[mode]) {
      startBtnIcon.innerHTML = modeIcons[mode];
    }
  }

  // Alan veya Canlı Altyazı Başlat
  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "triggerSelection" });
    window.close();
  });

  // Geçmişi Temizle
  clearHistoryBtn.addEventListener("click", () => {
    chrome.storage.local.set({ history: [] });
    renderHistory([]);
  });

  function renderHistory(items) {
    if (!items || items.length === 0) {
      historyList.innerHTML = `<div class="empty-state">Henüz geçmiş kayıt yok.</div>`;
      return;
    }

    historyList.innerHTML = items.slice(0, 10).map(item => `
      <div class="history-item">
        <span class="history-orig">${escapeHtml(item.original)}</span>
        <span class="history-trans">${escapeHtml(item.translated)}</span>
      </div>
    `).join("");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
