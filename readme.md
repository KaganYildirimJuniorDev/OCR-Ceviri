OCR ve Çoklu Dil Çeviri Chrome Eklentisi

Manifest V3 mimarisi temel alınarak geliştirilmiş; web sayfaları, görseller, çizgi roman/manga baloncukları ve canlı video yayınları üzerindeki metinleri optik karakter tanıma (OCR) ile algılayıp hedef dile çeviren yüksek performanslı Chrome tarayıcı eklentisi.

---

> [GÖRSEL ALANI: Eklentinin genel tanıtım görseli veya kullanım senaryolarını içeren demo GIF]

---

Öne Çıkan Özellikler

- Akıllı Alan Taraması ve Yerinde Kaplama (In-place Overlay): Ekran üzerinde fare ile seçilen bölgedeki metinleri tespit eder ve çeviriyi doğrudan orijinal metnin hizasında sayfa üzerine yerleştirir. Sayfa kaydırma (scroll) işlemlerinde konum takibini korur.
- Sözlük ve Kelime Analiz Modu (Dictionary Mode): Tekil kelime veya kısa ifade seçimlerinde kelime türü (isim, fiil, sıfat), fonetik okunuş ve detaylı tanım kartı görüntüler.
- Manga ve Görsel In-painting Teknolojisi: Görseller ve grafikler üzerindeki metin alanlarının arka plan rengini otomatik analiz eder, orijinal metni temizler ve yeni metni uyumlu renk düzeniyle basar.
- Canlı Bölge Taraması (Live Subtitle Mode): Video oynatıcılar ve canlı akışlardaki altyazı bölgelerini periyodik olarak tarayarak eşzamanlı çeviri bandı oluşturur.
- Geçmiş Yönetimi ve Çoklu Dil Desteği: 10'dan fazla dil seçeneği sunar. Gerçekleştirilen son çevirileri eklenti arayüzünde yerel depolama (Local Storage) kullanarak saklar.

---

Nasıl Çalışır?

Eklenti, istemci tarafında (Client-Side) çalışan çok katmanlı bir işleme mimarisine sahiptir. İletişim, Chrome Extension Manifest V3 standartlarına uygun olarak Service Worker ('background.js') ve Content Script ('content.js') arasında mesajlaşma protokolü ile yürütülür.

> [GÖRSEL ALANI: Sistem çalışma ve mimari akış şeması]

Teknik İşleyiş Adımları

1. Görüntü Yakalama (Screen Capture): 
   Kullanıcı seçim alanını belirlediğinde, 'background.js' ekranın ilgili bölümünün piksel verisini 'captureVisibleTab' API'si üzerinden yüksek çözünürlüklü Canvas formatında yakalar.

2. Optik Karakter Tanıma (OCR Engine): 
   Yakalana görüntü parçası 'content.js' içerisindeki OCR motoruna aktarılır. Görseldeki metin blokları, koordinat sınırları (bounding box) ve satır yükseklikleri ile birlikte tespit edilir.

3. Metin Analizi ve Çeviri İsteği: 
   Elde edilen metin blokları işlenerek hedef dile dönüştürülmek üzere çeviri servisine iletilir. İstemci tarafında çalışan optimize edilmiş API sorguları ile yanıt süresi en aza indirilir.

4. DOM Manipülasyonu ve Render (Overlay & In-painting): 
   - Standart Metinler: Çevirisi tamamlanan metinler, orijinal metin koordinatlarına denk gelecek şekilde mutlak pozisyonlanmış (absolute positioning) HTML katmanları olarak DOM'a eklenir.
   - Görseller: Tuval (Canvas) renk analitiği ile arka plan tonu belirlenir ve in-painting algoritması ile arka plan örtülerek yeni metin yerleştirilir.

---

Kurulum

Eklentiyi yerel geliştirme ortamınızda çalıştırmak için aşağıdaki adımları izleyin:

Geliştirici Modunda Kurulum (Unpacked Extension)

1. Bu depoyu bilgisayarınıza indirin veya klonlayın:
   git clone https://github.com/kullanici-adi/ocr-chrome-extension.git

2. Google Chrome tarayıcısını açın ve adres çubuğuna şu adresi yazın:
   chrome://extensions

3. Sağ üst köşede yer alan Geliştirici modu (Developer mode) anahtarını etkinleştirin.

4. Sol üstte çıkan Paketlenmemiş öğe yükle (Load unpacked) butonuna tıklayın.

5. Dosya seçici penceresinde projenin bulunduğu klasörü ('ocr chrome') seçin.

6. Eklenti simgesi tarayıcı araç çubuğunuza eklenecektir.

---

Nasıl Kullanılır?

> [GÖRSEL ALANI: Eklenti popup arayüzü görseli]

1. Mod Seçimi ve Dil Ayarı
- Araç çubuğundaki eklenti simgesine tıklayarak kontrol panelini açın.
- Hedef Dil menüsünden çevrilmesini istediğiniz dili seçin.
- İhtiyacınıza uygun çalışma modunu belirleyin:
  - Ekranda Alan Seç (Auto): Standart metin ve genel web içeriği için.
  - Kelime / Metin Seç (Dictionary): Detaylı kelime anlamı ve okunuşlar için.
  - Resim / Manga Seç (Inpainting): Görsel üzerindeki yazıları arka planı bozmadan çevirmek için.
  - Canlı Altyazıyı Başlat (Live): Videolardaki akan altyazıları takip etmek için.

2. Alan Seçimi ve Çeviri Yapma

> [GÖRSEL ALANI: Ekran üzerinde alan seçimi ve çeviri sonucu önizleme görseli]

- Eklenti panelinden Başlat butonuna basın veya klavye kısayolunu kullanın.
- Ekran üzerinde çevrilmesini istediğiniz alanı fare ile sürükleyerek dikdörtgen içine alın.
- Seçim tamamlandığında çeviri otomatik olarak işlenecek ve ekran üzerine yansıtılacaktır.

3. Manga ve Görsel Çevirisi Örneği

> [GÖRSEL ALANI: Manga / Çizgi roman çeviri öncesi me sonrası karşılaştırma görseli]

---

Klavye Kısayolları

İş akışınızı hızlandırmak için aşağıdaki varsayılan kısayolları kullanabilirsiniz:

İşlem | Windows / Linux | macOS
--- | --- | ---
OCR Seçimini Başlat | Ctrl + Shift + S | Command + Shift + S
Seçimi İptal Et | ESC | ESC

Not: Kısayol kombinasyonlarını 'chrome://extensions/shortcuts' sayfasından dilediğiniz gibi özelleştirebilirsiniz.

---

Proje Dosya Yapısı

ocr chrome/
├── manifest.json       # Eklenti konfigürasyonu ve izin tanımlamaları (v3)
├── background.js       # Service Worker: Arka plan işlemleri ve ekran yakalama
├── content.js          # Sayfa içi OCR tespiti, alan seçimi ve DOM kaplama
├── popup.html          # Eklenti kullanıcı arayüzü HTML yapısı
├── popup.js            # Kullanıcı arayüzü kontrolcüsü ve ayar yönetimi
├── popup.css           # Kullanıcı arayüzü stil dosyası
├── style.css           # Sayfa içi overlay ve seçim kutusu stilleri
├── icon.png            # Ana uygulama görseli
├── icon16.png          # 16x16 eklenti ikonu
├── icon48.png          # 48x48 eklenti ikonu
└── icon128.png         # 128x128 eklenti ikonu

Bileşen detaylarını incelemek için ilgili kod dosyalarına göz atabilirsiniz:
- Manifest ayarları: manifest.json
- Arka plan servisi: background.js
- İçerik betiği: content.js
- Arayüz mantığı: popup.js

---

Lisans

Bu proje MIT Lisansı altında lisanslanmıştır. Detaylar için lisans dosyasını inceleyebilirsiniz.
