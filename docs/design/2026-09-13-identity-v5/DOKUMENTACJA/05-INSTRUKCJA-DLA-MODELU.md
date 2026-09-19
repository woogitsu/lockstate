# Polecenie i plan pracy dla modelu wdrażającego

## Gotowy brief

„Zapoznaj się ze START_TUTAJ.md, aktualnym prototypem oraz DOKUMENTACJA. Przenieś najnowszy kierunek wizualny Lockstate do aktualnego repozytorium woogitsu/lockstate, zachowując istniejącą architekturę, mechaniki i zapisy. Traktuj demonstracyjne dane i pojedynczy obraz mapy jako materiały projektu. Zacznij od aktualnych AGENTS.md i wymaganych dokumentów repo; następnie uruchom grę i zmapuj wszystkie obecne funkcje UI. Wdrażaj w etapach, testuj rzeczywiste zachowania, dokumentuj zmiany. Nie publikuj pod identyfikatorem Sites z paczki ani nie zmieniaj migracji/usług bez właściwej autoryzacji.”

## Kolejność

1. **Odczyt i porównanie.** Sprawdź aktualny stan repo, ADR i instrukcje pracy. Odtwórz grę lokalnie. Porównaj wszystkie intencje/projekcje HUD z nową nawigacją. Zanotuj brakujące powierzchnie, zanim zaczniesz usuwać stary UI.
2. **Tokeny i komponenty.** Wyprowadź wynikowe style iteracji 05 do istniejących semantycznych tokenów. Zachowaj skalowanie UI. Uporządkuj CSS; warstwowe override'y makiety są historią iteracji, nie docelową architekturą.
3. **Geometria HUD.** Przenieś układ, resize, zwijanie, uchwyty i fokus. Preferencje przechowuj oddzielnie od stanu świata. Dopasuj limity do rzeczywistej dostępnej przestrzeni.
4. **Narzędzia.** Podepnij istniejące BuildTool/ObjectTool/RoomTool. Koszty, wymagania i odmowy bierz z projekcji. Nie wprowadzaj lokalnego odejmowania pieniędzy jako nowej prawdy symulacji.
5. **Operacje.** Personel, przyjęcia, harmonogram, dostawy, bezpieczeństwo i incydenty zachowują pełną funkcjonalność. Demo jest węższe niż docelowa gra; nie usuwa istniejących możliwości.
6. **Lokalizacja.** Wszystkie teksty przez stabilne klucze. Każde twierdzenie sprawdź w kodzie; pełne zdania i odmiana liczb. Zmiany tekstów raportuj zgodnie z regułami repo.
7. **Świat.** Opracuj osobne zasoby zgodne z obecnym pipeline'em. Nie zastępuj renderera ilustracją. Respektuj kierunki postaci, depth, culling, atlasy i LFS.
8. **Odbiór.** Uruchom wymagane typowanie, testy, build i benchmarki. Sprawdź zapisy i konflikty, UI na trzech urządzeniach, klawiaturę i dotyk. Dostarcz konkretne dowody i jawne braki.

## Rozpoznane wcześniej punkty integracji

- src/ui/tokens.css oraz src/ui/primitives/.
- src/ui/brand.css i brand-badge.ts.
- src/ui/hud/hud.ts, hud.css, hud-state.ts.
- build-panel.ts, rooms-panel.ts, staff-panel.ts, regime-panel.ts.
- src/ui/build-tool.ts, object-tool.ts, room-tool.ts.
- src/main.ts — kompozycja, czytniki i komendy workera.
- src/content/room-catalog.ts i istniejące katalogi obiektów.
- src/content/ i src/services/localization/.

Ścieżki rozpoznano podczas wcześniejszego odczytu. Zweryfikuj, czy nadal istnieją i pełnią tę samą funkcję.

## Czego nie robić

Nie zastępuj aplikacji gry plikiem app.js z makiety. Nie dodawaj nowego frameworka tylko po to, aby odtworzyć styl. Nie kopiuj localStorage demo zamiast IndexedDB. Nie traktuj kosztów i zegara demo jako reguł ekonomii. Nie wykonuj chronionych zmian konfiguracji ani migracji z samego faktu posiadania paczki.

## Kryteria zakończenia

Każda obecna akcja ma osiągalną drogę; żadna odmowa nie wygląda jak sukces; zapis jest prawdziwy i odporny na istniejące scenariusze konfliktu; resize nie wydaje komend światu; telefon daje dostęp do mapy; motywy zachowują kontrast i fokus; docelowe testy oraz build przechodzą. Pokaż wyniki testów, nie tylko screenshot.
