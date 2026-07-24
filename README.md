OCR ve Çoklu Dil Çeviri Chrome Eklentisi

Manifest V3 mimarisi temel alınarak geliştirilmiş; web sayfaları, görseller, çizgi roman/manga baloncukları ve canlı video yayınları üzerindeki metinleri optik karakter tanıma (OCR) ile algılayıp hedef dile çeviren yüksek performanslı Chrome tarayıcı eklentisi.

---

<img width="400" height="215" alt="(22) Free CCNA _ IPv4 Addressing (Part 1) _ Day 7 _ CCNA 200-301 Complete Course - YouTube - Google Chrome 2026-07-24 09-22-33" src="https://github.com/user-attachments/assets/51562bea-add6-40ca-a825-affba253afa8" />
<img width="400" height="215" alt="Native API, Technique T1106 - Enterprise _ MITRE ATT CK® - Google Chrome 2026-07-24 09-15-14" src="https://github.com/user-attachments/assets/9cc403ff-dbbc-45aa-ad43-d630d3e3b6c6" />
<img width="400" height="215" alt="Native API, Technique T1106 - Enterprise _ MITRE ATT CK® - Google Chrome 2026-07-24 09-14-48" src="https://github.com/user-attachments/assets/763b1ee3-6306-405f-9cba-07e84fa35419" />
<img width="400" height="215" alt="hqdefault jpg (480×360) - Google Chrome 2026-07-24 09-19-14" src="https://github.com/user-attachments/assets/a2aada5c-8ba7-4345-8a0b-d7a5407cb7e9" />


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
   git clone https: https://github.com/KaganYildirimJuniorDev/OCR-Ceviri.git

2. Google Chrome tarayıcısını açın ve adres çubuğuna şu adresi yazın:
   chrome://extensions

3. Sağ üst köşede yer alan Geliştirici modu (Developer mode) anahtarını etkinleştirin.

4. Sol üstte çıkan Paketlenmemiş öğe yükle (Load unpacked) butonuna tıklayın.

5. Dosya seçici penceresinde projenin bulunduğu klasörü ('ocr chrome') seçin.

6. Eklenti simgesi tarayıcı araç çubuğunuza eklenecektir.

---

Nasıl Kullanılır?

<img width="321" height="472" alt="image" src="https://github.com/user-attachments/assets/492c0f96-a6fe-4208-a68d-d57804065853" />


1. Mod Seçimi ve Dil Ayarı
- Araç çubuğundaki eklenti simgesine tıklayarak kontrol panelini açın.
- Hedef Dil menüsünden çevrilmesini istediğiniz dili seçin.
- İhtiyacınıza uygun çalışma modunu belirleyin:
  - Ekranda Alan Seç (Auto): Standart metin ve genel web içeriği için.
  - Kelime / Metin Seç (Dictionary): Detaylı kelime anlamı ve okunuşlar için.
  - Resim / Manga Seç (Inpainting): Görsel üzerindeki yazıları arka planı bozmadan çevirmek için.
  - Canlı Altyazıyı Başlat (Live): Videolardaki akan altyazıları takip etmek için.

2. Alan Seçimi ve Çeviri Yapma

<img width="955" height="716" alt="image" src="https://github.com/user-attachments/assets/f90272e0-baf7-49b8-95ea-a32ca2a716b9" />


- Eklenti panelinden Başlat butonuna basın veya klavye kısayolunu kullanın.
- Ekran üzerinde çevrilmesini istediğiniz alanı fare ile sürükleyerek dikdörtgen içine alın.
- Seçim tamamlandığında çeviri otomatik olarak işlenecek ve ekran üzerine yansıtılacaktır.

3. Manga ve Görsel Çevirisi Örneği

<img width="823" height="548" alt="image" src="https://github.com/user-attachments/assets/2b22904b-bd9a-4872-8f02-1843179c3669" />


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
