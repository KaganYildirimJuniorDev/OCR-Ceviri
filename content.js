(function () {
  if (window.ocrTranslatorInitialized) {
    return;
  }
  window.ocrTranslatorInitialized = true;

  let shadowRoot = null;
  let rootContainer = null;
  let liveScannerInterval = null;
  let isDragging = false;
  let startX = 0, startY = 0;
  let canvas = null, ctx = null, banner = null;

  function initShadowDOM() {
    rootContainer = document.querySelector(".ocr-translator-root");
    if (!rootContainer) {
      rootContainer = document.createElement("div");
      rootContainer.className = "ocr-translator-root";
      shadowRoot = rootContainer.attachShadow({ mode: "open" });
      document.body.appendChild(rootContainer);

      const styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = chrome.runtime.getURL("style.css");
      shadowRoot.appendChild(styleLink);
    } else {
      shadowRoot = rootContainer.shadowRoot;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start_selection") {
      chrome.storage.local.get(["activeMode", "targetLang"], (settings) => {
        const mode = settings.activeMode || "auto";
        const targetLang = settings.targetLang || "tr";
        if (mode === "live") {
          startAutoLiveSubtitle(targetLang);
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
    shadowRoot.appendChild(banner);

    canvas = document.createElement("canvas");
    canvas.className = "ocr-overlay-canvas";
    shadowRoot.appendChild(canvas);
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
    const existingBar = shadowRoot ? shadowRoot.querySelector(".ocr-live-subtitle-bar") : null;
    if (existingBar) existingBar.remove();
  }

  // --- AKILLI CANLI ALTYAZI ÇEVİRİSİ (Sadece Video İçi Altyazılar) ---
  function startAutoLiveSubtitle(targetLang = "tr") {
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
          const trans = await translateText(currentText, targetLang);
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

    shadowRoot.appendChild(liveBar);
  }

  function updateLiveSubtitleText(text) {
    if (!shadowRoot) return;
    const textEl = shadowRoot.querySelector(".live-bar-text");
    if (textEl) {
      textEl.innerText = text;
    }
  }

  // Seçilen Alanı İşle
  async function processSelection(x, y, w, h) {
    chrome.storage.local.get(["targetLang", "activeMode"], async (settings) => {
      const targetLang = settings.targetLang || "tr";
      const activeMode = settings.activeMode || "auto";

      const loaderCard = showLoader(x, y, w, h);

      try {
        if (activeMode === "live") {
          loaderCard.remove();
          startLiveRegionScanner(x, y, w, h, targetLang);
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
            const translation = await translateText(word, targetLang);

            loaderCard.remove();
            displayDictionaryCard(word, translation, dictData, domTexts[0] ? domTexts[0].rect : { left: x, top: y }, domTexts[0] ? domTexts[0].element : null);
            saveToHistory(word, translation);
            return;
          }

          const DELIMITER = " ||| ";
          const fullText = originalTexts.join(DELIMITER);
          const translatedFull = await translateText(fullText, targetLang);
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
                const ocrText = await runOCR(croppedDataUrl);
                
                loaderCard.remove();

                if (ocrText && ocrText.trim()) {
                  const cleanedText = ocrText.trim();
                  const isSingleWord = !cleanedText.includes(" ") && cleanedText.length > 1;

                  if (activeMode === "dictionary" || isSingleWord) {
                    const word = cleanedText.replace(/[^\w\s-]/gi, '');
                    const dictData = await fetchDictionaryData(word);
                    const translation = await translateText(word, targetLang);
                    displayDictionaryCard(word, translation, dictData, { left: x, top: y }, null);
                    saveToHistory(word, translation);
                    return;
                  }

                  const translation = await translateText(cleanedText, targetLang);
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
  function startLiveRegionScanner(x, y, w, h, targetLang) {
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
                const ocrText = await runOCR(cropped);
                if (ocrText && ocrText.trim() && ocrText.trim() !== lastText) {
                  lastText = ocrText.trim();
                  const trans = await translateText(lastText, targetLang);
                  updateLiveSubtitleText(trans);
                }
              };
            }
          });
        } else if (currentText !== lastText) {
          lastText = currentText;
          const trans = await translateText(lastText, targetLang);
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
      shadowRoot.appendChild(card);
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

    shadowRoot.appendChild(overlay);
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
        <div class="ocr-paragraph-body">${escapeHtml(translatedText).replace(/\n/g, "<br>")}</div>
        <div class="ocr-overlay-controls">
          <button class="ocr-mini-btn ocr-copy-btn" title="Metni Kopyala">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="ocr-paragraph-close" title="Kapat">✕</button>
        </div>
      `;

      setupCopyEvent(overlay, translatedText);

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
        <div class="ocr-paragraph-body">${escapeHtml(translatedText).replace(/\n/g, "<br>")}</div>
        <div class="ocr-overlay-controls">
          <button class="ocr-mini-btn ocr-copy-btn" title="Metni Kopyala">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="ocr-paragraph-close" title="Kapat">✕</button>
        </div>
      `;

      setupCopyEvent(overlay, translatedText);
      overlay.querySelector(".ocr-paragraph-close").addEventListener("click", (e) => {
        e.stopPropagation();
        overlay.remove();
      });
      shadowRoot.appendChild(overlay);
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
      if (tag === "script" || tag === "style" || tag === "noscript" || parent.closest(".ocr-translator-root") || parent.closest(".ocr-inline-container")) {
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

  async function runOCR(base64Image) {
    const formData = new FormData();
    formData.append("apikey", "helloworld");
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("base64Image", base64Image);

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    
    if (data && data.ParsedResults && data.ParsedResults[0]) {
      return data.ParsedResults[0].ParsedText;
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

  async function translateText(text, targetLang = "tr") {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      return data[0].map(item => item[0]).join("");
    }
    throw new Error("Çeviri başarısız oldu.");
  }

  function saveToHistory(original, translated) {
    if (!original || !translated) return;
    chrome.storage.local.get(["history"], (res) => {
      const history = res.history || [];
      if (history.length > 0 && history[0].original === original) return;
      history.unshift({ original, translated, time: Date.now() });
      if (history.length > 30) history.pop();
      chrome.storage.local.set({ history });
    });
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
    shadowRoot.appendChild(loader);
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
    shadowRoot.appendChild(errorCard);
  }

  function setupCloseEvent(container) {
    const closeBtn = container.querySelector(".ocr-paragraph-close");
    if (!closeBtn) return;
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.remove();
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
