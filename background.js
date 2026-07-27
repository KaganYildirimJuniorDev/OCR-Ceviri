
// Varsayılan ayarları ilklendir
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["sourceLang", "targetLang", "activeMode", "history"], (res) => {
    if (!res.sourceLang) chrome.storage.local.set({ sourceLang: "auto" });
    if (!res.targetLang) chrome.storage.local.set({ targetLang: "tr" });
    if (!res.activeMode) chrome.storage.local.set({ activeMode: "auto" });
    if (!res.history) chrome.storage.local.set({ history: [] });
  });
});

// Klavyeden Kısayol Tuşu basıldığında tetiklenir
chrome.commands.onCommand.addListener((command) => {
  if (command === "activate_ocr") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        triggerOCR(tabs[0]);
      }
    });
  }
});

// Kısayol veya Popup'tan Seçim Başlatma
function triggerOCR(tab) {
  if (!tab || !tab.id || !tab.url) return;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) return;

  // Önce mevcuttaki content.js'e mesaj gönder
  chrome.tabs.sendMessage(tab.id, { action: "start_selection" }, (response) => {
    if (chrome.runtime.lastError) {
      // Script sayfada henüz yoksa enjekte et ve çalıştır
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }).then(() => {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["style.css"]
        }).catch(() => { });

        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "start_selection" }).catch(() => { });
        }, 150);
      }).catch(err => console.error("Script enjeksiyon hatası:", err));
    }
  });
}

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true;
  }

  if (message.action === "triggerSelection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        triggerOCR(tabs[0]);
      }
    });
  }
});
