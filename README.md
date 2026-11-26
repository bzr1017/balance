# Balance – vérnyomásnapló és foci statisztika

Egy kódbázis, három platform: **web**, **iOS** és **Android**.

- **React 19 + TypeScript + Vite** – a felület és a logika
- **Capacitor 8** – ugyanazt a webes buildet natív iOS/Android appba csomagolja
- **SheetJS (xlsx)** – CSV / XLSX / XLS import és export
- **Recharts** – grafikon

Szerver nincs: minden adat az eszközön marad.

## Funkciók

Öt fül: Vérnyomás · Elemzés · Foci · Dokumentumok · Adatok

- **Vérnyomás** (napló) – vérnyomás rögzítése (szisztolés, diasztolés, pulzus, időpont), szerkesztés, törlés,
  napok szerint csoportosított lista, színes jelölés (ideális / célon belül / cél felett)
- **Elemzés** – átlag (`ROUND(AVERAGE)`), szórás (`STDEV.P`, mint az Excelben), min–max, megoszlás a céltartomány
  szerint (< 135/85, ideálisan < 130/80); grafikon SYS/DIA oszlopokkal, célvonalakkal, opcionális pulzussal,
  mérésenként vagy napi átlagban. Időszak: összes / utolsó 30 nap / hónap
- **Adatok** – **PDF riport** (összesítő havi bontással, grafikon, mérések táblázata – alapból mind benne, kikapcsolható),
  export (CSV, XLSX, XLS – csak a táblázat: Időpont, Szisztolés, Diasztolés, Pulzus), import
  (a régi, havi lapos `vernyomas.xlsx` minden lapját is beolvassa, duplikátumokat kihagy), minta fájlok,
  célértékek beállítása
- **Dokumentumok** – orvosi dokumentumok feltöltése (PDF vagy kép, mobilon fotó is), cím, dátum, típus
  (szakorvosi lelet, 24 órás vérnyomás / ABPM, labor, ambuláns lap, zárójelentés, recept, egyéb) és megjegyzés.
  Keresés, típus szerinti szűrés, előnézet, megnyitás / megosztás (pl. elküldés az orvosnak), szerkesztés, törlés

- **Foci** – edzések és mérkőzések naplója: Napló, Összesítő és Adatok nézet, időszakszűrővel
  - *Mérkőzés:* dátum, ellenfél, végeredmény (győzelem/döntetlen/vereség automatikusan), játszott percek,
    pozíció, gólok, gólpasszok, pontszám (1–10), szubjektív értékelés, sérülés (hely + súlyosság: enyhe /
    közepes / súlyos), megjegyzés
  - *Edzés:* dátum, pontszám (1–10), minőség (rossz / közepes / jó), kapura lövés esetén lövések száma és
    ebből gól, megjegyzés
  - *Összesítő:* gól, gólpassz, percek, (gól+gólpassz)/90 perc, mérlegek (GY/D/V), sérülések, pozíciók;
    edzéseknél átlag pontszám, lövés/gól és hatékonyság, minőség megoszlás; pontszám-grafikon
  - *Adatok:* **PDF riport** (összesítő, pontszám-grafikon, mérkőzések és edzések táblázata), export / import / minta fájl (CSV, XLSX, XLS) – egy táblázat, mérkőzések és edzések együtt,
    „Típus” oszloppal; ami az adott típusnál nem értelmezett, üres. Oszlopok: Dátum, Típus, Pontszám, Ellenfél,
    Saját gól, Ellenfél gól, Eredmény (csak tájékoztató), Játszott percek, Pozíció, Gólok, Gólpasszok,
    Szubjektív értékelés, Sérülés helye, Sérülés súlyossága, Edzés minősége, Lövések, Lövésből gól, Megjegyzés

## Hol tárolódnak az adatok?

| Mit | Web | iOS | Android |
|---|---|---|---|
| Mérések, foci bejegyzések, beállítások, dokumentumok adatai | böngésző `localStorage` | `UserDefaults` | `SharedPreferences` |
| Dokumentumfájlok | böngésző IndexedDB | az app privát Data mappája | az app privát Data mappája |

- Weben a böngészőhöz és a címhez kötődik: más böngészőben vagy gépen nem látszik, böngészőadat-törléskor elvész.
- Mobilon az app törlésekor vész el.
- A vérnyomásmérésekről és a foci bejegyzésekről az Export ad mentést (ugyanott importtal visszatölthető). A dokumentumokról jelenleg nincs egyben mentés – az eredeti fájlokat
  érdemes megtartani.

## iPhone-ra fejlesztői fiók nélkül: PWA

A webes változat telepíthető webappként (PWA): a kezdőképernyőről saját ikonnal, teljes képernyőn indul,
**offline is működik**, és nem jár le. Nem kell hozzá Apple fejlesztői fiók, Xcode vagy Mac.

### 1. Közzététel GitHub Pages-en (egyszeri beállítás)

1. Hozz létre egy új GitHub repót (pl. `balance`). Ingyenes fiókkal a Pages-hez **publikus** repó kell –
   ez csak a program kódja, a mérések és dokumentumok soha nem kerülnek bele.
2. Töltsd fel a projektet:
   ```bash
   cd ~/DEV/PERSONAL/Balance
   git init -b main
   git add .
   git commit -m "Balance"
   git remote add origin https://github.com/<felhasznalonev>/balance.git
   git push -u origin main
   ```
   A `.gitignore` kizárja az Excel/CSV fájlokat, hogy személyes adat véletlenül se kerüljön fel.
3. GitHub-on: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Az **Actions** fülön lefut a „Közzététel (GitHub Pages)” (teszt + build + feltöltés). Ha zöld, az app itt érhető el:
   `https://<felhasznalonev>.github.io/balance/`

Ezután minden `git push` automatikusan frissíti az appot; a telefon a következő, netes indításkor tölti le az új verziót.

Privát repóhoz: Netlify vagy Cloudflare Pages (ingyenes): build parancs `npm run build`, kimeneti mappa `dist`.

### 2. Telepítés iPhone-ra

1. Nyisd meg a címet **Safariban**.
2. Megosztás gomb → **Főképernyőhöz adás** (ha kérdezi, legyen bekapcsolva a „Megnyitás webappként”) → Hozzáadás.
3. Indítsd a kezdőképernyőről a mérleges ikonnal.

Androidon Chrome-ban: menü → **Alkalmazás telepítése**.

### Fontos tudnivalók

- A kezdőképernyős app **saját tárhelyet** kap: amit ott rögzítesz, a Safari fülön nem látszik (és fordítva).
- Ha törlöd az ikont a kezdőképernyőről, **az adatok is törlődnek**. A vérnyomásról és a fociról rendszeresen készíts
  exportot (Adatok fül, ill. Foci → Adatok); a dokumentumok eredeti fájljait tartsd meg.
- Az export és a dokumentum megnyitása telefonon a megosztás menüt nyitja (Fájlokba mentés, e-mail, AirDrop…).
- Fotó készítéséhez a dokumentumfeltöltésnél a Safari kamera-engedélyt kér – ehhez semmi beállítás nem kell.

## Indítás

```bash
npm install
npm run dev          # web: http://localhost:5173
npm test             # egységtesztek
npm run build        # éles webes build a dist/ mappába
```

A teszt az eredeti Excel fájllal is lefuttatható (egyezik az Excel átlag/szórás értékeivel):

```bash
BALANCE_SAMPLE_XLSX=~/Downloads/vernyomas.xlsx npm test
```

## Natív iOS és Android app (opcionális)

Csak akkor kell, ha App Store-ba / Google Play-be szánod, vagy natív funkció kell. Saját iPhone-ra ingyenes Apple ID-val is
telepíthető Xcode-ból, de úgy 7 naponta újra kell telepíteni – ezért a mindennapi használatra a PWA a jobb.


Előfeltétel: Xcode (iOS) és Android Studio (Android).

```bash
npm run native:add   # egyszer: létrehozza az ios/ és android/ mappát, és legenerálja az ikonokat
npm run ios          # build + sync + Xcode megnyitása
npm run android      # build + sync + Android Studio megnyitása
```

Kódmódosítás után elég a `npm run native:sync` (vagy az `ios` / `android` script).
Az ikonok az `assets/` mappában lévő mérleges képekből készülnek (`npm run icons`).

Fotó készítéséhez iOS-en az `ios/App/App/Info.plist`-be kell egy `NSCameraUsageDescription` szöveg
(pl. „Orvosi dokumentum lefotózása”) – enélkül csak a Fotók / Fájlok közül lehet választani.

## Szerkezet

```
src/
  App.tsx                 navigáció (Vérnyomás / Elemzés / Foci / Dokumentumok / Adatok), állapot, mentés
  components/
    EntryForm.tsx         új mérés / szerkesztés
    MeasurementList.tsx   mérések listája
    StatsPanel.tsx        statisztika
    BpChart.tsx           grafikon
    ImportExport.tsx      export / import / minta fájl
    SettingsPanel.tsx     célértékek, összes adat törlése
    Documents.tsx         orvosi dokumentumok (feltöltés, lista, előnézet)
    Football.tsx          foci: rögzítés (edzés / mérkőzés), lista, összesítő, grafikon
    ui.tsx                logó, ikonok, időszakválasztó
  lib/
    types.ts              Measurement, Settings, MedicalDocument
    football.ts           foci típusok, validálás, összesítő számítások
    footballIo.ts         foci export / import (CSV, XLSX, XLS)
    pdf/                  PDF riportok (jsPDF): közös motor, vérnyomás, foci – csak exportkor töltődik be
    io.ts                 vérnyomás import/export
    table.ts              közös CSV/XLSX/XLS olvasás-írás
    stats.ts              átlag, STDEV.P, szűrés, napi átlag, kategóriák
    dates.ts              dátumformátumok, Excel sorszám ↔ dátum
    docs.ts               dokumentumfájlok tárolása (natív: Filesystem, web: IndexedDB), megnyitás
    storage.ts            tárolás (Capacitor Preferences)
    files.ts              export fájl mentése (web: letöltés, mobil: megosztás)
public/
  manifest.webmanifest    PWA leíró (név, ikonok, színek)
  sw.js                   service worker – offline működés
  icons/                  PWA és iPhone kezdőképernyő ikonok
  fonts/                  DejaVu Sans részhalmaz a PDF-hez (magyar ékezetek), licenc mellette
assets/                   natív app ikon forrásképek (mérleg, zöld háttér)
.github/workflows/        automatikus közzététel GitHub Pages-re
```
