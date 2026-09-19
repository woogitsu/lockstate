# Plan integracji dla modelu wdrażającego

## 1. Zweryfikuj stan bieżącej gry

Odczytaj aktualne repo, uruchom zgodnie z jego instrukcjami, zinwentaryzuj wszystkie akcje HUD i ich źródła danych. Opisy sprzed integracji są wskazówką, nie dowodem obecnego stanu. Wcześniejsze pliki main czytano przez domyślną gałąź, nie atomowy snapshot.

Miejsca rozpoznane przy projektowaniu:
- src/ui/tokens.css — semantyczne kolory, rozmiary i skala UI.
- src/ui/primitives/ — wspólne komponenty.
- src/ui/brand.css i brand-badge.ts — identyfikacja.
- src/ui/hud/hud.ts, hud.css, hud-state.ts — geometria, nawigacja, panele.
- src/ui/hud/build-panel.ts, rooms-panel.ts, staff-panel.ts, regime-panel.ts — powierzchnie pracy.
- src/ui/build-tool.ts, object-tool.ts, room-tool.ts — narzędzia istniejącej gry.
- src/main.ts — powiązanie UI z projekcjami i komendami workera.
- src/content/room-catalog.ts — wymagania pomieszczeń.
- src/content/ i src/services/localization/ — lokalizacja; zweryfikuj bieżące katalogi.

## 2. Przenieś system wizualny, nie całą aplikację demo

Zachowaj TypeScript strict, Phaser, Web Worker, deterministyczny kernel, chunkowany świat, IndexedDB i wersjonowane zapisy. Nie zastępuj aplikacji plikiem app.js. Nie dodawaj React ani innego frameworka tylko z powodu makiety.

Przenieś role kolorów do semantycznych tokenów. Zachowaj mechanizm skali UI, zamiast kopiować wszystkie pikselowe wartości CSS. Wyciągnij wynikową kaskadę iteracji 02 do czytelnych komponentów; nie kopiuj wielokrotnych override'ów jako docelowej architektury.

Paleta: granat #122C3A, turkus #007477, mięta #89E0C3, jasne tło #F2F6F8, tekst #183442, tekst pomocniczy #5C717D. Ostrzeżenia #895300 / #FFF1D7, zagrożenia #B63744 / #FFEBED. Informacja nie może opierać się tylko na barwie.

Charakter: bardziej płaskie, rzeczowe powierzchnie; katalog w jednej liście z ceną w stałej kolumnie; aktywna krawędź; ograniczone zaokrąglenia; numery stref; krótkie nazwy. Typografia systemowa z monospace dla numeracji i metryk. Utrzymaj czytelność, nie miniaturyzuj kontrolek dla pozornego „gamingowego” efektu.

## 3. Przenieś układ i zachowania

Pięć sekcji: Przegląd, Buduj, Strefy, Zarządzaj, Plan dnia. Zmapuj każdą dotychczasową funkcję — w tym bezpieczeństwo, przyjęcia, dostawy, odmowy i zapisy — na nową nawigację. Demo nie zawiera wszystkich powierzchni gry i nie daje podstaw do ich usuwania.

Desktop: mapa pomiędzy lewymi narzędziami a prawym inspektorem. Tablet: te same relacje, węższe panele. Telefon: dolna nawigacja, panel niski/rozwinięty/zwinięty, dostęp do mapy podczas wskazywania miejsca. Nie pozwalaj, by gest na panelu wydawał komendę na mapie.

Inspektor pomieszczenia zachowuje widoczny obiekt na mapie. Szybkie narzędzia mają odpowiedniki dotykowe. Numery 1–4 w demo są skrótami demonstracyjnymi; w grze użyj istniejącego abstrakcyjnego systemu input i remappingu, z uwzględnieniem QWERTY/AZERTY i konfliktów.

## 4. Podepnij prawdziwe dane

Koszt, stan finansów, wymagania, gotowość i przydziały pochodzą z istniejących projekcji. Potwierdzenie planu nie jest automatycznie zakończeniem budowy. Nie zakładaj zwrotu środków przy anulowaniu, jeśli bieżąca ekonomia działa inaczej. Rozróżnij odmowę, brak danych i błąd.

Lokalny zapis demo w kluczu lockstate-design-v1 NIE JEST schematem zapisu gry. Nie przenoś go do produkcji. Zachowaj IndexedDB, recovery, wersjonowanie i ochronę przed konfliktami.

## 5. Teksty i oprawa świata

Wszystkie teksty przez istniejącą lokalizację. Nagłówki rzeczowe; wzór komunikatu: fakt, miejsce, następny krok. Każde twierdzenie i przycisk potwierdź w kodzie. Rozdział Język zawiera przykłady, a nie zgodę na wdrożenie nieistniejących funkcji.

world.png to kierunek materiałów, światła i przestrzeni. Nie używaj go zamiast renderera. Produkcja grafiki wymaga osobnych zasobów, spójnych pivotów, skali, ośmiu kierunków postaci i zgodności z pipeline'em atlasów. Nie zmieniaj LFS/CI/deployment bez zastosowania bieżących reguł repo.

## 6. Odbiór

- Uruchom wymagane przez repo typecheck, testy i build.
- Sprawdź wszystkie dotychczasowe intencje HUD po przeorganizowaniu.
- Przejdź budowę, anulowanie, odmowę, wymagania pomieszczeń, personel, harmonogram, lokalny zapis i konflikt.
- Zweryfikuj 390×844, 1024×768, 1440×900, także niski ekran i powiększenie tekstu 200%.
- Sprawdź dotyk, klawiaturę, remapping, focus, kontrast i reduced motion.
- Zmierz wpływ nowych paneli i grafiki na wymaganych scenariuszach wydajności.
- Wskaż dowody uzyskane faktycznie; nie deklaruj testów tej paczki jako testów właściwej gry.

## Granice dalszych pomysłów

Planowanie całego pokoju, podświetlanie uszkodzonej trasy, kopiowanie stref i konfigurowalne ulubione są propozycjami kolejnego etapu. Nie implementuj ich po cichu w ramach samego odświeżenia UI. Najpierw oceń istniejące kontrakty i uzgodniony zakres.
