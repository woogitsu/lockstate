# Lockstate — nowa identyfikacja i interfejs

13.09.2026 · kierunek 01 · specyfikacja projektu

## Zakres i status

Przygotowano osobny interaktywny prototyp oraz księgę projektu. Nie zmieniono źródeł ani konfiguracji repozytorium woogitsu/lockstate. To kompletna propozycja kierunku wraz z demonstracją podstawowych interakcji, nie zastępczy silnik gry.

Mapa jest jedną wygenerowaną ilustracją. Plany to znaczniki bez walidacji kolizji, wymagań i symulacji budowy. Zegar podglądu nie steruje aktorami. Zatrudnienie, harmonogram i finanse używają danych demonstracyjnych. Prototyp zapisuje tylko swój stan w localStorage, natomiast właściwa gra pozostaje przy IndexedDB.

## Odczyt repozytorium

Źródło: https://github.com/woogitsu/lockstate (prywatne).

Odczytano README.md, AGENTS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, package.json, src/main.ts, src/styles.css, src/ui/tokens.css, src/ui/brand.css, src/ui/hud/hud.css, src/ui/hud/hud-state.ts, fragment src/ui/hud/messages.ts i katalog pomieszczeń src/content/room-catalog.ts. Dla dużych plików UI odczytano fragmenty istotne dla projektu, nie całą implementację.

Pobrane drzewo main: e5628369ab68ee790e00542a97ae08f7c0e8d8d5. Pliki pobierano przez domyślną gałąź; nie jest to atomowy audyt jednego commitu. package.json wskazywał wersję 0.0.596.

Obejrzano zrzut pełnego interfejsu docs/research/2026-09-06-the-first-furnished-cell/act3-lived-in-full.png (na obrazie build 0.0.504) i nowszy detal docs/research/2026-09-11-does-unreachable-show-in-the-world/world-blocked.png. Nie uruchamiano aktualnego buildu gry. Ocena wyglądu opiera się na tych obrazach oraz odczytanym CSS.

### Wnioski

- Obecna paleta jest celowo chłodna i instytucjonalna. Tokeny deklarują tekst bazowy 13 px i etykiety 11 px.
- HUD zawiera pięć sekcji: overview, build, rooms, security i regime.
- Kompozycja aplikacji wiąże narzędzia budowy, obiektów i stref z workerem oraz czytnikami personelu, osadzonych, przyjęć, harmonogramu i dostaw.
- Dokumentacja architektury mówi o lokalnych zapisach IndexedDB i braku wywołań klienta zapisu chmurowego z aplikacji.
- README określa kierunek produktu i pre-alpha, ale nie należy traktować całej roadmapy jako listy już dostępnych funkcji.
- Zachowujemy TypeScript, Phaser, Web Worker, deterministyczny stan, chunkowany świat i istniejącą architekturę lokalizacji.

## Tożsamość

Nazwa produktu: Lockstate. Wordmark w UI: **lockstate.**

Obietnica: **Twoje decyzje. Żywy świat.**

Charakter: uważny, konkretny, opanowany. Wrażenie: nowoczesne centrum zarządzania, w którym czytelna przestrzeń świata pozostaje najważniejsza.

Znak: modułowa mała litera „l” z wycięciem przywołującym przejście. Minimalny rozmiar 28 px; pole ochronne ¼ wysokości; miniatura może używać samego znaku. Wordmark nie zastępuje nazwy w etykiecie dostępności.

### Paleta i role

| Rola | Kolor |
|---|---|
| Główna rama / atrament | #122C3A |
| Drugorzędny atrament | #244454 |
| Tekst | #183442 |
| Tekst pomocniczy | #5C717D |
| Działanie / turkus | #007477 |
| Mięta marki | #89E0C3 |
| Jasna powierzchnia | #FFFFFF |
| Tło / porcelana | #F2F6F8 |
| Obrys | #DCE5E9 |
| Aktywna powierzchnia | #DFF5F0 |
| Ostrzeżenie tekst / tło | #895300 / #FFF1D7 |
| Zagrożenie tekst / tło | #B63744 / #FFEBED |

Kolor oznacza rolę, nie przypadkową kategorię. Status otrzymuje dodatkowo tekst i ikonę. Mięta nie służy jako drobny tekst na bieli.

### Typografia, układ i ruch

Stos fontów: Inter, Segoe UI, Arial, sans-serif. Prototyp nie pobiera fontów z sieci; ostateczny krój zależy od urządzenia. W integracji można dostarczyć licencjonowany WOFF2 lokalnie.

Hierarchia docelowa: 32 / 24 / 20 / 16 / 14 / 12 px. Liczby tabelaryczne w finansach i zegarze. Odstępy 4 / 8 / 12 / 16 / 24 / 32. Promienie 8 / 12 / 16 / 20 px. Ruch 160–200 ms, z obsługą prefers-reduced-motion. Cień oznacza unoszącą się powierzchnię; stałe panele oddzielają obrysy.

## Nawigacja i funkcje

| Sekcja | Zawartość |
|---|---|
| Przegląd | Stan dnia, sprawy do sprawdzenia, finanse, zapis |
| Buduj | Konstrukcja, wyposażenie, wyszukiwanie, szczegóły, plan |
| Strefy | Lista pomieszczeń i wymagania |
| Zarządzaj | Personel, osadzeni, przyjęcia |
| Plan dnia | Harmonogram i edycja bloków |

Przeniesienie personelu spod „Security” do „Zarządzaj” jest propozycją semantyczną UI, a nie przeniesieniem modułów symulacji. Dalsze funkcje bezpieczeństwa wymagają mapowania wszystkich istniejących odczytów i poleceń przed wdrożeniem. Prototyp nie prezentuje kompletnego UI dla każdej mechaniki repozytorium.

### Pętla budowy

1. Wybierz kategorię lub wpisz nazwę elementu.
2. Obejrzyj opis i przykładowy koszt.
3. Wybierz „Zaplanuj element”.
4. Wskaż miejsce na mapie.
5. Sprawdź koszt i zatwierdź lub anuluj.
6. Znacznik pojawia się na mapie; cofnięcie oddaje koszt w podglądzie.

Docelowo punkty 4–6 muszą używać realnego układu współrzędnych, walidacji, kolejki i odpowiedzi workera. Przed budową trzeba ustalić moment pobierania środków zgodny z istniejącym modelem ekonomii; demonstracyjne odejmowanie przy potwierdzeniu nie jest decyzją o zmianie tego modelu.

## Urządzenia

| Zakres | Układ | Interakcja |
|---|---|---|
| Do 720 px | Dolna nawigacja, mapa, wysuwany panel 240 px lub 55% wysokości | Panel zwija się do wskazania miejsca; dotyk; potwierdzenie w oknie |
| 721–1100 px | Lewa nawigacja 78 px, panel 284 px, mapa obok | Dotyk i mysz; kompaktowe metryki |
| 1101–1599 px | Lewa nawigacja 92 px, panel 320 px | Mysz, klawiatura, etykiety narzędzi |
| Od 1600 px | Nawigacja 100 px, panel 350 px | Więcej oddechu i pełne metryki |

Przykładowe podglądy: 390×844, 1024×768, 1440×900. W księdze są osadzone działające widoki, nie nieruchome obrazy.

## Głos produktu

Wzór: **fakt → miejsce → następny krok**.

Używamy bezpośrednich czasowników: Wybierz, Sprawdź, Zaplanuj, Zapisz. Nie karcimy gracza. Nie żartujemy z cierpienia. Nie przedstawiamy braku danych jako dobrego stanu.

| Sytuacja | Proponowany komunikat | Akcja |
|---|---|---|
| Brak dostępu | Nie ma przejścia do celi A-12. Sprawdź drzwi i połączenie z korytarzem. | Pokaż przejście |
| Brak wyposażenia | Cela A-12 nie jest gotowa. Brakuje toalety. | Dodaj wyposażenie |
| Za mało środków | Brakuje 350 do tego planu. Zmniejsz zakres lub wróć po uzupełnieniu środków. | Zmień plan |
| Plan przyjęty | Zaplanowano 6 odcinków ściany. Koszt: 300. | Cofnij plan |
| Trwa zapis | Zapisuję na tym urządzeniu… | Brak |
| Zapis potwierdzony | Zapisano na tym urządzeniu o 14:32. | Pokaż zapisy |
| Konflikt lokalny | Nie zapisano zmian. Ten zapis zmienił się w innej karcie. | Sprawdź wersje |
| Brak łóżek | 3 osoby czekają na miejsce do spania. Przygotuj cele z wolnymi łóżkami. | Pokaż cele |
| Pusta lista | Nie masz jeszcze planów budowy. | Zaplanuj pierwszy element |
| Zagrożenie | Incydent w stołówce. 2 osoby wymagają pomocy. | Pokaż zdarzenie |

Liczby są przykładowe. Komunikaty i akcje wymagają dowodu w kodzie przed integracją. Nie wdrażamy tekstu zapowiadającego nieistniejącą funkcję.

Lokalizacja: stabilne klucze, pełne zdania, bez konkatenacji; odmiana 1 osoba / 2 osoby / 5 osób; liczby i daty zgodne z locale. Tłumaczenia nie trafiają do serializowanego stanu symulacji.

## Kierunek grafiki świata

Oryginalna ilustracja: niemal pionowy, ortogonalny widok kampusu więzienia, widoczne boki ścian, 12 cel, stołówka i kuchnia, dziedziniec z boiskiem, recepcja, droga i ogrodzenie. Szaro-niebieskie ściany, jasne posadzki, zielony teren, pomarańczowe akcenty i mundury niebieskie/pomarańczowe. To koncept artystyczny, nie atlas.

Produkcja wymaga: osobnych obiektów zgodnych z katalogiem, spójnego rzutu, skali i pivotów; obsługi warstw i przesłaniania; ośmiu kierunków postaci; budżetu atlasów; kontroli LFS i pipeline’u repozytorium. Nie należy wycinać wszystkich gotowych zasobów z pojedynczej ilustracji kampusu.

Prompt użyty do grafiki: „Original polished top-down prison management game world map background, landscape 1536x1024. Orthographic nearly vertical camera with slight visible wall sides, roofless prison campus on rectangular tile grid: left cell block with 12 furnished cells, central corridor, upper right dining hall and kitchen, lower right fenced orange basketball court, bottom reception offices, grass, perimeter fence, access road. Pre-rendered 3D stylized semi-realistic architecture, soft daylight, crisp geometry, blue-gray walls, pale floors, emerald grass, muted orange furnishings, blue staff and orange prisoner figures. Entire campus with grass margins. No UI, text, labels, logos or copied Prison Architect assets.”

Wygenerowano wbudowanym narzędziem obrazów; plik projektu: world.png.

## Wdrożenie

1. **Tokeny i marka.** Nowe role w src/ui/tokens.css; zachowanie semantycznych aliasów i istniejących testów. Sprawdzić pary kontrastu, focus i skalowanie.
2. **HUD.** Nowa geometria src/ui/hud/hud.css i kompozycja hud.ts; zachowanie wszystkich istniejących intencji i projekcji. Odbiór na trzech urządzeniach.
3. **Budowanie.** Podłączyć katalog i plan do BuildTool/ObjectTool/RoomTool. Nie reimplementować zasad symulacji w panelu. Zmierzyć gesty i obsługę odmów.
4. **Teksty.** Ujednolicić katalog lokalizacji po odczycie kodu każdego komunikatu. Pełna lista zmienionych tekstów w opisie zmian zgodnie z repo.
5. **Świat.** Wyprodukować atlasy zgodne z aktualnym pipeline’em; sprawdzić pamięć i culling. Wymagające oddzielnej autoryzacji zmiany konfiguracji przedstawić osobno.
6. **Odbiór.** Typecheck, odpowiednie testy zachowania, build, persistence, migracje, dostępność i benchmarki. Praca w izolowanym worktree i reguły przeglądu zgodnie z repo.

### Warunki gotowości produkcyjnej

- Wszystkie istniejące funkcje HUD mają dostępną drogę, nie tylko pokazane w prototypie.
- Pełna obsługa dotyku, remapowania i QWERTY/AZERTY.
- Potwierdzony kontrast tekstu i elementów sterujących; fokus; 200% tekstu; czytnik ekranu dla UI.
- Zgodne koszty, gotowość pomieszczeń i stany poleceń.
- Brak utraty lub niejawnego nadpisania zapisów.
- Dowód wydajności na scenariuszach repozytorium.
- Testy po integracji z aktualnym silnikiem, nie tylko w makiecie.

## Weryfikacja tej demonstracji

Sprawdzono składnię JavaScript, lokalne odwołania do plików oraz wybrane pary kontrastu palety. Nie uruchamiano browser QA ani bieżącego buildu repozytorium. Ten zakres nie stanowi potwierdzenia pełnej dostępności, poprawności symulacji ani zgodności zachowań na konkretnych urządzeniach.

## Iteracja 02 — dopracowanie charakteru

Na podstawie uwagi właściciela zachowano paletę i układ, a zmieniono język wizualny na bardziej zbliżony do warsztatu planowania:

- katalog w jednym rejestrze z cenami w stałej kolumnie;
- mniejsze promienie i mniej identycznych kart; wyraźna krawędź aktywnego narzędzia;
- rzeczowe nagłówki zamiast haseł powitalnych;
- tabliczki stref i numery kart pomieszczeń;
- karta pomieszczenia w inspektorze zamiast modalnego okna;
- pasek czterech szybkich narzędzi, dostępny dotykiem oraz klawiszami 1–4;
- adaptacja tych elementów do istniejących trzech układów urządzeń.

Nowa sekcja księgi „Co zmieniono · 02” zawiera research, uzasadnienia i dalsze pomysły. Zasady konstytucji pozostają; ich wykonanie jest bardziej rzeczowe i oszczędne. Rozmiary zaokrągleń z pierwotnej specyfikacji zostały zastąpione mniejszymi: narzędzia 2–4 px, okna 8 px, górna krawędź mobilnego panelu 12 px. Typografia w podglądzie używa systemowego Segoe UI / Arial, z monospace w numeracji i metrykach.

Źródła:

- https://factorio.com/blog/post/fff-238 — wiązanie informacji z obiektem i spójność interakcji.
- https://www.factorio.com/blog/post/fff-423 — utrzymanie kontekstu pracy podczas sprawdzania informacji.
- https://wiki.factorio.com/Quickbar — oddzielenie skrótów do narzędzi od zapasów.

Wnioski dotyczące estetyki są autorską interpretacją, nie wynikiem badań użytkowników. Kolejne kierunki: zbiorczy plan pomieszczenia z kosztem, wizualizacja przyczyny braku dostępu, dopracowane osobne atlasy i ulubione narzędzia. Te pomysły nie są wdrożonymi mechanikami prototypu.

Weryfikacja iteracji: składnia JS i przegląd zmian źródłowych; bez browser QA i bez uruchamiania symulacji gry.

## Iteracja 03 — układ sterowany przez gracza

Dodano strzałki przy krawędziach trzech paneli: lewego menu, prawego inspektora i górnego paska metryk. Zwijanie oddaje miejsce mapie; uchwyty pozostają dostępne, aby przywrócić panel. Otwarcie sekcji przywraca inspektor.

Desktop/tablet: szerokość prawego panelu zmieniana przez przeciąganie lewej krawędzi (260–600 px, ograniczona również dostępnym miejscem na mapę); lewe menu ma zakres 72–180 px. Telefon: górna krawędź zmienia wysokość inspektora. Dwuklik przywraca domyślny rozmiar danego panelu. Uchwyt ma semantykę separatora oraz obsługę strzałek, Home, End i Enter. Strzałki przesuwają o 10 px, Shift+strzałka o 40 px.

Menu „Układ” udostępnia suwak, reset wszystkich paneli, tryb „Tylko mapa” i sterowanie zegarem, również przy schowanym pasku metryk. Preferencje są lokalne, pod osobnym kluczem lockstate-layout-v1; nie zmieniają formatu zapisu demonstracji ani gry. Zablokowana pamięć przeglądarki nie blokuje sterowania panelami, lecz uniemożliwia zapamiętanie układu.

Research:
- W3C Window Splitter Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/ — semantyka uchwytu i obsługa klawiatury. Wzorzec ma odnotowany przez autorów niezakończony przegląd; jego zastosowanie nie jest certyfikacją dostępności.
- VS Code Custom Layout: https://code.visualstudio.com/docs/configure/custom-layout — ukrywanie paneli, zapamiętywanie układu, reset i tryb skupienia. Inspiracja zachowaniem, nie kopia wyglądu.

Weryfikacja: składnia JS i kontrola zakresów rozmiarów; nie wykonano browser QA. Nowy ZIP celowo odłożony do zakończenia poprawek przez właściciela.

## Iteracja 04 — tryb nocny

Przełącznik słońca/księżyca w nagłówku zmienia motyw. Ustawienia udostępniają trzy wybory: dzienny, nocny i zgodny z urządzeniem. Preferencja jest zapamiętywana lokalnie pod lockstate-theme-v1 oraz synchronizowana między kartami tego samego origin. Bez zapisanego wyboru obowiązuje motyw systemowy.

Nocny wariant obejmuje panele, katalog, metryki, uchwyty, formularze, okna i księgę projektu. Tło mapy jest przygaszone, ale motyw NIE zmienia pory dnia w symulacji ani nie tworzy nocnego renderingu świata. Nowy ZIP nadal pozostaje odłożony.

## Iteracja 05 — audyt i konstytucja 20 artykułów

Aktualny raport: audyt.md, dostępny także w rozdziale „Audyt” księgi. Poprawiono spójność zapisu, izolację podglądów, harmonogram, nawigację, anulowanie i limity kamery. Osadzone podglądy mają teraz wyłącznie pamięć sesyjną: wcześniejsze opisy zapisu na urządzeniu odnoszą się do głównej sesji, nie iframe. Testy logiki: tests/audit.cjs, 9/9 zaliczonych. Nie wykonano browser QA ani integracji z właściwą grą.
