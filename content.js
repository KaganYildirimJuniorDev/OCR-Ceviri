(function () {
  if (window.ocrTranslatorContextValid && window.ocrTranslatorContextValid()) {
    return;
  }
  window.ocrTranslatorContextValid = () => {
    try {
      chrome.runtime.getURL("");
      return true;
    } catch (e) {
      return false;
    }
  };

  let shadowRootAbsolute = null;
  let rootContainerAbsolute = null;
  let shadowRootFixed = null;
  let rootContainerFixed = null;
  let liveScannerInterval = null;
  let isDragging = false;
  let startX = 0, startY = 0;
  let canvas = null, ctx = null, banner = null;

  // --- ÖNBELLEĞE & YARDIMCILAR ---
  let miniTranslateBtn = null;
  let translationCache = {};

  // Bağlamın (context) geçerli olup olmadığını kontrol et ve eski/kopuk scriptleri temizle
  function checkContext() {
    try {
      chrome.runtime.getURL("");
      return true;
    } catch (e) {
      document.removeEventListener("mouseup", handleMouseUp);
      return false;
    }
  }

  // Çeviri önbelleğini storage'dan yükle
  try {
    chrome.storage.local.get(["translationCache"], (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.translationCache) translationCache = res.translationCache;
    });
  } catch (e) {
    // Bağlam geçersizse hata fırlatmadan yoksay
  }

  function handleMouseUp(e) {
    if (!checkContext()) return;
    if (window.ocrTranslatorActive) return;

    // Shadow DOM içindeki tıklamaları yoksay
    if (e.composedPath && e.composedPath().some(el =>
      el.classList && (
        el.classList.contains("ocr-translator-root-absolute") ||
        el.classList.contains("ocr-translator-root-fixed") ||
        el.classList.contains("ocr-inline-container")
      )
    )) return;

    setTimeout(() => {
      if (!checkContext()) return;
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (miniTranslateBtn) { miniTranslateBtn.remove(); miniTranslateBtn = null; }
      if (!text || text.length < 2 || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width) return;

      showMiniTranslateButton(text, rect.right + window.scrollX, rect.bottom + window.scrollY);
    }, 50);
  }

  // Sayfada metin seçildiğinde mini çeviri butonu göster
  document.addEventListener("mouseup", handleMouseUp);

  function initShadowDOM() {
    if (!checkContext()) return;

    // Absolute Container (for scrolling overlays)
    rootContainerAbsolute = document.querySelector(".ocr-translator-root-absolute");
    if (!rootContainerAbsolute) {
      rootContainerAbsolute = document.createElement("div");
      rootContainerAbsolute.className = "ocr-translator-root-absolute";
      shadowRootAbsolute = rootContainerAbsolute.attachShadow({ mode: "open" });
      document.body.appendChild(rootContainerAbsolute);

      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("style.css");
      shadowRootAbsolute.appendChild(styleLink);
    } else {
      shadowRootAbsolute = rootContainerAbsolute.shadowRoot;
    }

    // Fixed Container (for floating overlays, canvas, banner, etc.)
    rootContainerFixed = document.querySelector(".ocr-translator-root-fixed");
    if (!rootContainerFixed) {
      rootContainerFixed = document.createElement("div");
      rootContainerFixed.className = "ocr-translator-root-fixed";
      shadowRootFixed = rootContainerFixed.attachShadow({ mode: "open" });
      document.body.appendChild(rootContainerFixed);

      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("style.css");
      shadowRootFixed.appendChild(styleLink);
    } else {
      shadowRootFixed = rootContainerFixed.shadowRoot;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!checkContext()) return;
    if (message.action === "start_selection") {
      chrome.storage.local.get(["activeMode", "targetLang", "sourceLang"], (settings) => {
        const mode = settings.activeMode || "auto";
        const targetLang = settings.targetLang || "tr";
        const sourceLang = settings.sourceLang || "auto";
        if (mode === "live") {
          startAutoLiveSubtitle(targetLang, sourceLang);
        } else {
          startSelectionUI();
        }
      });
    }
  });

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      cleanupUI();
    }
  }

  function startSelectionUI() {
    initShadowDOM();
    if (window.ocrTranslatorActive) return;
    window.ocrTranslatorActive = true;

    window.addEventListener("keydown", handleKeyDown);

    banner = document.createElement("div");
    banner.className = "ocr-instruction-banner";
    banner.innerText = "Lütfen çevirmek istediğiniz alanı fare ile sürükleyin. (ESC ile iptal)";
    shadowRootFixed.appendChild(banner);

    canvas = document.createElement("canvas");
    canvas.className = "ocr-overlay-canvas";
    shadowRootFixed.appendChild(canvas);
    ctx = canvas.getContext("2d");

    function resizeCanvas() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawOverlay(0, 0, 0, 0, false);
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      drawOverlay(startX, startY, e.clientX, e.clientY, true);
    });

    canvas.addEventListener("mouseup", async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.clientX;
      const endY = e.clientY;

      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(startX - endX);
      const h = Math.abs(startY - endY);

      cleanupSelectionOverlay(resizeCanvas);

      if (w > 15 && h > 15) {
        processSelection(x, y, w, h);
      }
    });
  }

  function drawOverlay(x1, y1, x2, y2, activeDrag) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (activeDrag) {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x1 - x2);
      const h = Math.abs(y1 - y2);

      ctx.clearRect(x, y, w, h);

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
    }
  }

  function cleanupSelectionOverlay(resizeHandler) {
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    window.removeEventListener("keydown", handleKeyDown);
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    banner = null;
    canvas = null;
    ctx = null;
    window.ocrTranslatorActive = false;
  }

  function cleanupUI() {
    cleanupSelectionOverlay();
    stopLiveScanner();
  }

  function stopLiveScanner() {
    if (liveScannerInterval) {
      clearInterval(liveScannerInterval);
      liveScannerInterval = null;
    }
    const existingBar = shadowRootFixed ? shadowRootFixed.querySelector(".ocr-live-subtitle-bar") : null;
    if (existingBar) existingBar.remove();
  }

  // --- AKILLI CANLI ALTYAZI ÇEVİRİSİ (Sadece Video İçi Altyazılar) ---
  function startAutoLiveSubtitle(targetLang = "tr", sourceLang = "auto") {
    stopLiveScanner();
    initShadowDOM();

    createLiveSubtitleBar(targetLang);

    let lastText = "";

    // 600ms aralıklarla sadece video alanındaki güncel altyazı metnini sorgula
    liveScannerInterval = setInterval(async () => {
      try {
        let currentText = getCurrentSubtitleText();

        if (currentText && currentText !== lastText) {
          lastText = currentText;
          const trans = await translateText(currentText, targetLang, sourceLang);
          updateLiveSubtitleText(trans);
        }
      } catch (err) {
        console.error("Live translation error:", err);
      }
    }, 600);
  }

  // Sayfadaki SADECE Video Üzerindeki Altyazıları Toplayan Sıkı Filtre
  function getCurrentSubtitleText() {
    const video = document.querySelector("video");
    let vRect = null;
    if (video) {
      vRect = video.getBoundingClientRect();
    }

    // 1. Bilinen Altyazı Seçicileri
    const selectors = [
      ".ytp-caption-segment",
      ".vjs-text-track-display",
      ".vjs-captions-popup",
      ".player-timedtext-text",
      ".player-timedtext",
      "[class*='captions-display']",
      "[class*='subtitle-display']",
      "[class*='vjs-text-track']",
      "[class*='shaka-caption']"
    ];

    const texts = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        if (el.closest && (el.closest(".ocr-translator-root") || el.closest(".ocr-inline-container"))) return;

        // Eğer sayfada video varsa, altyazı elemanının konumu video alanının içinde mi kontrol et
        if (vRect && vRect.width > 100) {
          const r = el.getBoundingClientRect();
          // Yan panelleri (Udemy sol menü vb.) engelle
          if (r.right < vRect.left - 20 || r.left > vRect.right + 20 || r.bottom < vRect.top - 20 || r.top > vRect.bottom + 80) {
            return;
          }
        }

        const txt = el.innerText ? el.innerText.trim() : "";
        if (txt && !texts.includes(txt)) {
          texts.push(txt);
        }
      });
      if (texts.length > 0) break;
    }

    if (texts.length > 0) {
      return texts.join(" ");
    }

    // 2. Özel altyazı sınıfı bulunamazsa SADECE video alanının alt %28 kısmını tara (Sidebardan bağımsız)
    if (vRect && vRect.width > 100 && vRect.height > 100) {
      const subX = Math.max(0, vRect.left + 20);
      const subY = vRect.top + (vRect.height * 0.70);
      const subW = Math.max(100, vRect.width - 40);
      const subH = vRect.height * 0.28;
      const domTexts = getDOMTextsInRect(subX, subY, subW, subH);
      return domTexts.map(t => t.text).join(" ").trim();
    }

    return "";
  }

  function createLiveSubtitleBar(targetLang) {
    const liveBar = document.createElement("div");
    liveBar.className = "ocr-live-subtitle-bar";

    liveBar.innerHTML = `
      <div class="live-bar-header">
        <span class="live-badge">🔴 CANLI ALTYAZI</span>
        <button class="live-stop-btn">Durdur</button>
      </div>
      <div class="live-bar-text">Altyazı taranıyor...</div>
    `;

    const stopBtn = liveBar.querySelector(".live-stop-btn");
    stopBtn.addEventListener("click", () => {
      stopLiveScanner();
    });

    shadowRootFixed.appendChild(liveBar);
  }

  function updateLiveSubtitleText(text) {
    if (!shadowRootFixed) return;
    const textEl = shadowRootFixed.querySelector(".live-bar-text");
    if (textEl) {
      textEl.innerText = text;
    }
  }

  // Seçilen Alanı İşle
  async function processSelection(x, y, w, h) {
    chrome.storage.local.get(["targetLang", "sourceLang", "activeMode"], async (settings) => {
      const targetLang = settings.targetLang || "tr";
      const sourceLang = settings.sourceLang || "auto";
      const activeMode = settings.activeMode || "auto";

      const loaderCard = showLoader(x, y, w, h);

      try {
        if (activeMode === "live") {
          loaderCard.remove();
          startLiveRegionScanner(x, y, w, h, targetLang, sourceLang);
          return;
        }

        const domTexts = getDOMTextsInRect(x, y, w, h);

        if (domTexts.length > 0 && activeMode !== "inpainting") {
          const originalTexts = domTexts.map(t => t.text);
          const combinedText = originalTexts.join(" ").trim();
          const isSingleWord = !combinedText.includes(" ") && combinedText.length > 1;

          if (activeMode === "dictionary" || isSingleWord) {
            const word = combinedText.replace(/[^\w\s-]/gi, '');
            const dictData = await fetchDictionaryData(word);
            const translation = await translateText(word, targetLang, sourceLang);

            loaderCard.remove();
            displayDictionaryCard(word, translation, dictData, domTexts[0] ? domTexts[0].rect : { left: x, top: y }, domTexts[0] ? domTexts[0].element : null);
            saveToHistory(word, translation);
            return;
          }

          const DELIMITER = " ||| ";
          const fullText = originalTexts.join(DELIMITER);
          const translatedFull = await translateText(fullText, targetLang, sourceLang);
          const translatedParts = translatedFull.split("|||").map(s => s.trim());

          loaderCard.remove();

          domTexts.forEach((item, index) => {
            const transStr = translatedParts[index] || item.text;
            displayParagraphOverlay(transStr, item.rect, item.element, item.text);
            saveToHistory(item.text, transStr);
          });

        } else {
          // Ekran görüntüsü alınırken yükleme kartının ekranda çıkmaması için geçici olarak gizle
          if (loaderCard) loaderCard.style.display = "none";

          chrome.runtime.sendMessage({ action: "captureTab" }, async (response) => {
            if (loaderCard) loaderCard.style.display = "";

            if (!response || response.error) {
              loaderCard.remove();
              showErrorCard("Ekran görüntüsü alınamadı: " + (response ? response.error : "Bilinmeyen hata"), x, y, w, h);
              return;
            }

            const img = new Image();
            img.src = response.dataUrl;
            img.onload = async () => {
              try {
                const croppedDataUrl = cropImage(img, x, y, w, h);
                const ocrText = await runOCR(croppedDataUrl, sourceLang);

                loaderCard.remove();

                if (ocrText && ocrText.trim()) {
                  const cleanedText = ocrText.trim();
                  const isSingleWord = !cleanedText.includes(" ") && cleanedText.length > 1;

                  if (activeMode === "dictionary" || isSingleWord) {
                    const word = cleanedText.replace(/[^\w\s-]/gi, '');
                    const dictData = await fetchDictionaryData(word);
                    const translation = await translateText(word, targetLang, sourceLang);
                    displayDictionaryCard(word, translation, dictData, { left: x, top: y }, null);
                    saveToHistory(word, translation);
                    return;
                  }

                  const translation = await translateText(cleanedText, targetLang, sourceLang);
                  saveToHistory(cleanedText, translation);

                  if (activeMode === "inpainting") {
                    displayInpaintingOverlay(translation, croppedDataUrl, x, y, w, h);
                  } else {
                    displayParagraphOverlay(translation, {
                      left: x,
                      top: y,
                      width: w,
                      height: h
                    }, null, cleanedText);
                  }

                } else {
                  showErrorCard("Seçilen alanda okunabilir bir metin bulunamadı.", x, y, w, h);
                }
              } catch (err) {
                loaderCard.remove();
                showErrorCard("OCR Hatası: " + err.message, x, y, w, h);
              }
            };
          });
        }

      } catch (err) {
        loaderCard.remove();
        showErrorCard("Bir hata oluştu: " + err.message, x, y, w, h);
      }
    });
  }

  // Manuel Seçim İle Canlı Bölge Taraması (Fallback)
  function startLiveRegionScanner(x, y, w, h, targetLang, sourceLang = "auto") {
    stopLiveScanner();
    initShadowDOM();

    createLiveSubtitleBar(targetLang);

    let lastText = "";

    liveScannerInterval = setInterval(async () => {
      try {
        const domTexts = getDOMTextsInRect(x, y, w, h);
        let currentText = domTexts.map(t => t.text).join(" ").trim();

        if (!currentText) {
          chrome.runtime.sendMessage({ action: "captureTab" }, async (res) => {
            if (res && res.dataUrl) {
              const img = new Image();
              img.src = res.dataUrl;
              img.onload = async () => {
                const cropped = cropImage(img, x, y, w, h);
                const ocrText = await runOCR(cropped, sourceLang);
                if (ocrText && ocrText.trim() && ocrText.trim() !== lastText) {
                  lastText = ocrText.trim();
                  const trans = await translateText(lastText, targetLang, sourceLang);
                  updateLiveSubtitleText(trans);
                }
              };
            }
          });
        } else if (currentText !== lastText) {
          lastText = currentText;
          const trans = await translateText(lastText, targetLang, sourceLang);
          updateLiveSubtitleText(trans);
        }
      } catch (err) {
        console.error("Live scanner error:", err);
      }
    }, 600);
  }

  // 1. Akıllı Sözlük Kartı Render
  function displayDictionaryCard(word, translation, dictData, rect, targetElement) {
    const cardHTML = `
      <div class="dict-header">
        <div>
          <h4 class="dict-word">${escapeHtml(word)}</h4>
          <span class="dict-phonetic">${escapeHtml(dictData && dictData.phonetic ? dictData.phonetic : '')}</span>
        </div>
        <button class="ocr-paragraph-close" title="Kapat">✕</button>
      </div>
      <div class="dict-translation">
        <span class="dict-tr-label">Çeviri:</span>
        <span class="dict-tr-val">${escapeHtml(translation)}</span>
      </div>
      ${dictData && dictData.meanings && dictData.meanings.length > 0 ? `
        <div class="dict-body">
          ${dictData.meanings.slice(0, 2).map(m => `
            <div class="dict-meaning-block">
              <span class="dict-pos">${m.partOfSpeech}</span>
              <p class="dict-def">${m.definitions[0] ? escapeHtml(m.definitions[0].definition) : ''}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="dict-actions">
        <button class="ocr-action-btn ocr-copy-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Kopyala</span>
        </button>
      </div>
    `;

    if (targetElement) {
      const compPos = window.getComputedStyle(targetElement).position;
      if (compPos === "static") {
        targetElement.style.position = "relative";
      }

      const container = document.createElement("div");
      container.className = "ocr-inline-container";

      const shadow = container.attachShadow({ mode: "open" });
      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("style.css");
      shadow.appendChild(styleLink);

      const card = document.createElement("div");
      card.className = "ocr-dictionary-card";
      card.innerHTML = cardHTML;

      setupCopyEvent(card, translation);
      card.querySelector(".ocr-paragraph-close").addEventListener("click", (e) => {
        e.stopPropagation();
        container.remove();
      });

      shadow.appendChild(card);
      targetElement.appendChild(container);
    } else {
      initShadowDOM();
      const card = document.createElement("div");
      card.className = "ocr-dictionary-card";
      card.style.position = "fixed";
      card.style.left = `${rect.left}px`;
      card.style.top = `${rect.top}px`;
      card.innerHTML = cardHTML;

      setupCopyEvent(card, translation);
      card.querySelector(".ocr-paragraph-close").addEventListener("click", (e) => {
        e.stopPropagation();
        card.remove();
      });
      shadowRootFixed.appendChild(card);
    }
  }

  // 2. Manga / Görsel In-Painting Render
  function displayInpaintingOverlay(translatedText, croppedDataUrl, x, y, w, h) {
    initShadowDOM();
    const overlay = document.createElement("div");
    overlay.className = "ocr-inpainting-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = `${x + window.scrollX}px`;
    overlay.style.top = `${y + window.scrollY}px`;
    overlay.style.width = `${w}px`;
    overlay.style.minHeight = `${h}px`;

    getDominantBgColor(croppedDataUrl, (bgColor) => {
      overlay.style.backgroundColor = bgColor;
    });

    overlay.innerHTML = `
      <div class="inpainting-text">${escapeHtml(translatedText)}</div>
      <button class="ocr-paragraph-close" title="Kapat">✕</button>
    `;

    overlay.querySelector(".ocr-paragraph-close").addEventListener("click", (e) => {
      e.stopPropagation();
      overlay.remove();
    });

    shadowRootAbsolute.appendChild(overlay);
  }

  // 4. Normal Paragraf Katmanı Render
  function displayParagraphOverlay(translatedText, rect, originalElement, originalText) {
    if (originalElement) {
      const compPos = window.getComputedStyle(originalElement).position;
      if (compPos === "static") {
        originalElement.style.position = "relative";
      }

      const container = document.createElement("div");
      container.className = "ocr-inline-container";

      const shadow = container.attachShadow({ mode: "open" });
      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("style.css");
      shadow.appendChild(styleLink);

      const overlay = document.createElement("div");
      overlay.className = "ocr-paragraph-overlay";

      let bgColor = "rgba(255, 255, 255, 0.98)";
      let textColor = "#0f172a";

      let currentEl = originalElement;
      while (currentEl && currentEl !== document.body) {
        const bg = window.getComputedStyle(currentEl).backgroundColor;
        if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          bgColor = bg;
          break;
        }
        currentEl = currentEl.parentElement;
      }
      const color = window.getComputedStyle(originalElement).color;
      if (color && color !== "transparent") {
        textColor = color;
      }

      overlay.style.backgroundColor = bgColor;
      overlay.style.color = textColor;

      overlay.innerHTML = `
        <div class="ocr-overlay-topbar">
          <div class="ocr-overlay-controls">
            <button class="ocr-mini-btn ocr-tts-btn" title="Sesli Oku">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </button>
            <button class="ocr-mini-btn ocr-copy-btn" title="Kopyala">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <button class="ocr-paragraph-close" title="Kapat">✕</button>
        </div>
        <div class="ocr-paragraph-body">${escapeHtml(translatedText).replace(/\n/g, "<br>")}</div>
      `;

      setupCopyEvent(overlay, translatedText);
      setupTTSEvent(overlay, translatedText);

      const closeBtn = overlay.querySelector(".ocr-paragraph-close");
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        container.remove();
      });

      shadow.appendChild(overlay);
      originalElement.appendChild(container);

    } else {
      initShadowDOM();
      const overlay = document.createElement("div");
      overlay.className = "ocr-paragraph-overlay";
      overlay.style.position = "absolute";
      overlay.style.left = `${rect.left + window.scrollX}px`;
      overlay.style.top = `${rect.top + window.scrollY}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.minHeight = `${rect.height}px`;

      overlay.innerHTML = `
        <div class="ocr-overlay-topbar">
          <div class="ocr-overlay-controls">
            <button class="ocr-mini-btn ocr-tts-btn" title="Sesli Oku">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </button>
            <button class="ocr-mini-btn ocr-copy-btn" title="Kopyala">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="ocr-mini-btn ocr-pin-btn" title="Sabitle">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>
            </button>
          </div>
          <button class="ocr-paragraph-close" title="Kapat">✕</button>
        </div>
        <div class="ocr-paragraph-body">${escapeHtml(translatedText).replace(/\n/g, "<br>")}</div>
      `;

      setupCopyEvent(overlay, translatedText);
      setupTTSEvent(overlay, translatedText);
      setupPinEvent(overlay);
      overlay.querySelector(".ocr-paragraph-close").addEventListener("click", (e) => {
        e.stopPropagation(); overlay.remove();
      });
      makeDraggable(overlay);
      shadowRootAbsolute.appendChild(overlay);
    }
  }

  function setupCopyEvent(container, textToCopy) {
    const copyBtn = container.querySelector(".ocr-copy-btn");
    if (!copyBtn) return;
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span style="font-size:10px; font-weight:600; color:#10b981;">✓ Kopyalandı</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalContent;
        }, 1500);
      });
    });
  }

  function getDOMTextsInRect(rx, ry, rw, rh) {
    const textNodes = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walk.nextNode()) {
      const parent = node.parentElement;
      if (!parent) continue;

      const tag = parent.tagName.toLowerCase();
      if (
        tag === "script" ||
        tag === "style" ||
        tag === "noscript" ||
        parent.closest(".ocr-translator-root-absolute") ||
        parent.closest(".ocr-translator-root-fixed") ||
        parent.closest(".ocr-inline-container")
      ) {
        continue;
      }

      const text = node.nodeValue.trim();
      if (!text || text.length < 2) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();

      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left < rx + rw &&
          rect.right > rx &&
          rect.top < ry + rh &&
          rect.bottom > ry
        ) {
          textNodes.push({
            text: text,
            rect: rect,
            parent: parent
          });
          break;
        }
      }
    }

    const groups = [];
    textNodes.forEach(item => {
      let blockParent = item.parent;
      while (blockParent && blockParent !== document.body) {
        const style = window.getComputedStyle(blockParent);
        if (style.display === "block" || style.display === "flex" || style.display === "grid" ||
          ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre", "article", "section", "td", "th"].includes(blockParent.tagName.toLowerCase())) {
          break;
        }
        blockParent = blockParent.parentElement;
      }

      let group = groups.find(g => g.element === blockParent);
      if (!group) {
        group = {
          element: blockParent,
          items: [],
          rect: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
        };
        groups.push(group);
      }
      group.items.push(item);

      group.rect.left = Math.min(group.rect.left, item.rect.left);
      group.rect.top = Math.min(group.rect.top, item.rect.top);
      group.rect.right = Math.max(group.rect.right, item.rect.right);
      group.rect.bottom = Math.max(group.rect.bottom, item.rect.bottom);
    });

    return groups.map(g => {
      const mergedText = g.items.map(item => item.text).join(" ");
      return {
        text: mergedText,
        rect: {
          left: g.rect.left,
          top: g.rect.top,
          width: g.rect.right - g.rect.left,
          height: g.rect.bottom - g.rect.top
        },
        element: g.element
      };
    });
  }

  function cropImage(img, x, y, w, h) {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      img,
      x * dpr,
      y * dpr,
      w * dpr,
      h * dpr,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL("image/png");
  }

  function getDominantBgColor(dataUrl, callback) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      try {
        const p = cx.getImageData(0, 0, 1, 1).data;
        callback(`rgb(${p[0]}, ${p[1]}, ${p[2]})`);
      } catch (e) {
        callback("#ffffff");
      }
    };
  }

  async function runOCR(base64Image, sourceLang = "auto") {
    // Desteklenen diller (helloworld API key ile çalışanlar)
    const ocrLangMap = {
      ru: "rus", de: "ger", fr: "fre", es: "spa",
      it: "ita", pt: "por", nl: "dut", pl: "pol",
      tr: "tur", en: "eng", uk: "ukr"
    };
    const ocrLang = ocrLangMap[sourceLang] || "eng";

    const formData = new FormData();
    formData.append("apikey", "helloworld");
    formData.append("language", ocrLang);
    formData.append("isOverlayRequired", "false");
    formData.append("scale", "true");
    formData.append("OCREngine", "1");
    formData.append("base64Image", base64Image);

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData
    });
    const data = await res.json();

    if (data && data.ParsedResults && data.ParsedResults[0]) {
      return data.ParsedResults[0].ParsedText;
    }
    if (data && data.ErrorMessage) {
      throw new Error("OCR Hata: " + (Array.isArray(data.ErrorMessage) ? data.ErrorMessage[0] : data.ErrorMessage));
    }
    throw new Error("OCR servisinden yanıt alınamadı.");
  }


  async function fetchDictionaryData(word) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data[0] ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async function translateText(text, targetLang = "tr", sourceLang = "auto") {
    // Önbellekte var mı kontrol et
    const cacheKey = `${sourceLang}|${targetLang}|${text}`;
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    const sl = sourceLang || "auto";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      const result = data[0].map(item => item[0]).join("");
      // Önbelleğe ekle (max 100 giriş)
      translationCache[cacheKey] = result;
      const keys = Object.keys(translationCache);
      if (keys.length > 100) delete translationCache[keys[0]];

      try {
        chrome.storage.local.set({ translationCache });
      } catch (e) {
        // Bağlam geçersizse yoksay
      }

      return result;
    }
    throw new Error("Çeviri başarısız oldu.");
  }

  function saveToHistory(original, translated) {
    if (!original || !translated) return;
    try {
      chrome.storage.local.get(["history"], (res) => {
        if (chrome.runtime.lastError) return;
        const history = res.history || [];
        if (history.length > 0 && history[0].original === original) return;
        history.unshift({ original, translated, time: Date.now() });
        if (history.length > 30) history.pop();

        try {
          chrome.storage.local.set({ history });
        } catch (e) {
          // Bağlam geçersizse yoksay
        }
      });
    } catch (e) {
      // Bağlam geçersizse yoksay
    }
  }

  function showLoader(x, y, w, h) {
    initShadowDOM();
    const loader = document.createElement("div");
    loader.className = "ocr-translation-card";
    loader.style.left = `${x}px`;
    loader.style.top = `${y}px`;
    loader.style.width = `${w}px`;
    loader.style.minHeight = `${Math.max(h, 60)}px`;

    loader.innerHTML = `
      <div class="ocr-loader-container">
        <div class="ocr-spinner"></div>
        <span>İşleniyor ve çevriliyor...</span>
      </div>
    `;
    shadowRootFixed.appendChild(loader);
    return loader;
  }

  function showErrorCard(message, x, y, w, h) {
    initShadowDOM();
    const errorCard = document.createElement("div");
    errorCard.className = "ocr-translation-card";
    errorCard.style.left = `${x}px`;
    errorCard.style.top = `${y}px`;
    errorCard.style.width = `${w}px`;
    errorCard.style.border = "1.5px solid #ef4444";

    errorCard.innerHTML = `
      <div class="ocr-translation-header">
        <span class="ocr-translation-title" style="color: #ef4444;">HATA</span>
        <button class="ocr-paragraph-close" title="Kapat">✕</button>
      </div>
      <div class="ocr-translation-body" style="color: #ef4444;">${escapeHtml(message)}</div>
    `;

    setupCloseEvent(errorCard);
    shadowRootFixed.appendChild(errorCard);
  }

  function setupCloseEvent(container) {
    const closeBtn = container.querySelector(".ocr-paragraph-close");
    if (!closeBtn) return;
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.remove();
    });
  }

  // ============================================================
  // TTS - Sesli Okuma (browser speechSynthesis, API gerekmez)
  // ============================================================
  function speakText(text, lang) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const langMap = {
      tr: "tr-TR", en: "en-US", de: "de-DE", fr: "fr-FR",
      es: "es-ES", it: "it-IT", ru: "ru-RU", pt: "pt-PT",
      nl: "nl-NL", pl: "pl-PL", uk: "uk-UA"
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langMap[lang] || "en-US";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function setupTTSEvent(container, translatedText) {
    const ttsBtn = container.querySelector(".ocr-tts-btn");
    if (!ttsBtn) return;
    ttsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.storage.local.get(["targetLang"], (res) => {
        speakText(translatedText, res.targetLang || "en");
      });
      // Buton animasyonu
      ttsBtn.style.color = "#3b82f6";
      ttsBtn.style.opacity = "1";
      setTimeout(() => { ttsBtn.style.color = ""; ttsBtn.style.opacity = ""; }, 1800);
    });
  }

  // ============================================================
  // PIN - Sayfayı kayarken overlay sabit kalsin (fixed)
  // ============================================================
  function setupPinEvent(overlay) {
    const pinBtn = overlay.querySelector(".ocr-pin-btn");
    if (!pinBtn) return;
    let pinned = false;

    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pinned = !pinned;
      overlay.classList.toggle("ocr-pinned", pinned);

      const curLeft = parseFloat(overlay.style.left) || 0;
      const curTop = parseFloat(overlay.style.top) || 0;

      if (pinned) {
        // absolute (doküman) → fixed (viewport)
        // Kartı absolute shadowDOM'dan çıkarıp fixed shadowDOM'a taşıyoruz
        shadowRootFixed.appendChild(overlay);

        overlay.style.left = `${curLeft - window.scrollX}px`;
        overlay.style.top = `${curTop - window.scrollY}px`;

        pinBtn.title = "Sabiti Çöz";
      } else {
        // fixed (viewport) → absolute (doküman)
        // Kartı fixed shadowDOM'dan çıkarıp absolute shadowDOM'a geri taşıyoruz
        shadowRootAbsolute.appendChild(overlay);

        overlay.style.left = `${curLeft + window.scrollX}px`;
        overlay.style.top = `${curTop + window.scrollY}px`;

        pinBtn.title = "Sabitle";
      }
    });
  }

  // ============================================================
  // SÜRÜKLE - Overlay'i serbestçe taşı
  // ============================================================
  function makeDraggable(el) {
    let dragging = false, mx, my, elLeft, elTop;

    el.style.cursor = "grab";

    el.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ocr-paragraph-close") ||
        e.target.closest(".ocr-mini-btn")) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      dragging = true;
      mx = e.clientX;
      my = e.clientY;
      elLeft = parseFloat(el.style.left) || 0;
      elTop = parseFloat(el.style.top) || 0;
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
      el.style.transition = "none";

      const onMove = (e) => {
        if (!dragging) return;
        el.style.left = `${elLeft + (e.clientX - mx)}px`;
        el.style.top = `${elTop + (e.clientY - my)}px`;
      };
      const onUp = () => {
        dragging = false;
        el.style.cursor = "grab";
        el.style.userSelect = "";
        el.style.transition = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // ============================================================
  // MİNİ ÇEVİRİ BUTONU - Seçili metni anında çevir
  // ============================================================
  function showMiniTranslateButton(selectedText, x, y) {
    initShadowDOM();
    if (miniTranslateBtn) miniTranslateBtn.remove();

    // Rect'i ŞİMDİ kaydet — click'te selection temizlenmiş olabilir
    const sel = window.getSelection();
    const savedRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const savedRect = savedRange ? savedRange.getBoundingClientRect() : null;

    miniTranslateBtn = document.createElement("div");
    miniTranslateBtn.className = "ocr-mini-translate-pill";
    miniTranslateBtn.style.cssText = `position:absolute;left:${x}px;top:${y + 6}px;`;
    miniTranslateBtn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>
      </svg>
      <span>Çevir</span>
    `;

    miniTranslateBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = miniTranslateBtn;
      if (btn) {
        btn.innerHTML = "<span style='font-size:10px'>...</span>";
        btn.style.pointerEvents = "none";
      }

      const cleanupPill = () => {
        if (btn) btn.remove();
        if (miniTranslateBtn === btn) miniTranslateBtn = null;
      };

      try {
        chrome.storage.local.get(["targetLang", "sourceLang"], async (settings) => {
          try {
            cleanupPill();

            const targetLang = settings.targetLang || "tr";
            const sourceLang = settings.sourceLang || "auto";

            // Overlay için sabit genişlik (en az 300px), viewport'un sağına taşmaz
            const OVERLAY_W = 300;
            const vpWidth = window.innerWidth;
            let overlayLeft, overlayTop;

            if (savedRect) {
              // Seçimin sol kenarı (viewport-relative); viewport'un sağından taşmasın
              overlayLeft = Math.min(
                savedRect.left,
                vpWidth - OVERLAY_W - 16
              );
              // Seçimin altına (bottom) konumlan, üstüne değil
              overlayTop = savedRect.bottom + 8;
            } else {
              // Gelen x ve y absolute coordinates idi. Bunları viewport-relative yapıyoruz
              overlayLeft = Math.min(x - window.scrollX, vpWidth - OVERLAY_W - 16);
              overlayTop = y - window.scrollY + 8;
            }
            overlayLeft = Math.max(overlayLeft, 8);

            const isSingleWord = !selectedText.includes(" ") && selectedText.length > 1;

            if (isSingleWord) {
              const word = selectedText.replace(/[^\w\s-]/gi, "");
              const [dictData, translation] = await Promise.all([
                fetchDictionaryData(word),
                translateText(word, targetLang, sourceLang)
              ]);
              displayDictionaryCard(word, translation, dictData,
                { left: overlayLeft, top: overlayTop }, null);
              saveToHistory(word, translation);
            } else {
              const translation = await translateText(selectedText, targetLang, sourceLang);
              displayParagraphOverlay(translation, {
                left: overlayLeft,
                top: overlayTop,
                width: OVERLAY_W,
                height: 40
              }, null, selectedText);
              saveToHistory(selectedText, translation);
            }
          } catch (err) {
            console.error("Mini translate inner error:", err);
            cleanupPill();
          }
        });
      } catch (err) {
        console.error("Mini translate outer error:", err);
        cleanupPill();
      }
    });

    // Başka yere tıklanırsa kapat
    const dismiss = (ev) => {
      if (miniTranslateBtn) {
        const isClickInside =
          (rootContainerAbsolute && rootContainerAbsolute.contains(ev.target)) ||
          (rootContainerFixed && rootContainerFixed.contains(ev.target));
        if (!isClickInside) {
          miniTranslateBtn.remove();
          miniTranslateBtn = null;
        }
      }
    };
    document.addEventListener("mousedown", dismiss, { once: true });

    shadowRootAbsolute.appendChild(miniTranslateBtn);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
