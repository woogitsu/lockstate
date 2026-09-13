# START TUTAJ — Lockstate, projekt po poprawkach (iteracja 02)

## Zadanie dla kolejnego modelu

Wdróż kierunek wizualny i UX z tej paczki w aktualnym repozytorium **woogitsu/lockstate**. Zachowaj istniejące mechaniki i kontrakty techniczne. Właściciel zaakceptował kolorystykę i główny układ; poprosił o ograniczenie szablonowej estetyki AI. Iteracja 02 jest obowiązującym kierunkiem wykonania. Nie wracaj do pierwszych obłych kafelków i marketingowych nagłówków.

Najpierw odczytaj bieżące AGENTS.md, docs/AGENT_WORKFLOW.md, dokumentację architektury i adekwatne ADR z docelowego repo. Ta paczka nie jest uprawnieniem do pomijania ich ani zmiany usług, migracji czy publikacji. Pracuj w izolowanej gałęzi/worktree zgodnie z aktualnymi regułami repozytorium.

## Zawartość

- prototype/ — wszystkie śledzone pliki aktualnego projektu Sites, po poprawkach, bez historii Git i danych uwierzytelniających.
- prototype/dist/index.html — wejście interfejsu; otwiera mapę i pięć narzędzi.
- prototype/dist/app.js — interakcje i kompletna księga projektu, w tym rozdział „Co zmieniono · 02” z researchem i źródłami.
- prototype/dist/style.css — pełne style wszystkich rozmiarów; końcowy blok Direction 02 nadpisuje część stylów v1.
- prototype/dist/world.png — koncepcyjny obraz świata, nie atlas produkcyjny.
- prototype/dist/before.png — historyczny zrzut z prywatnego repozytorium, do porównania.
- prototype/dist/konstytucja.md — 12 zasad doświadczenia.
- prototype/dist/projekt.md — specyfikacja, granice audytu oraz plan integracji; sekcja Iteracja 02 ma pierwszeństwo w sprawach zmienionych po v1.
- IMPLEMENTACJA.md — konkretne kroki i kryteria odbioru.
- MANIFEST.json — pochodzenie oraz SHA-256 plików.

## Uruchomienie podglądu

W zwykłym lokalnym środowisku, z katalogu prototype/dist:

```sh
python3 -m http.server 8000
```

Następnie otwórz http://localhost:8000 w przeglądarce. Nie trzeba instalować Node ani paczek. Serwer jest tylko statyczny. W środowisku zarządzanym przestrzegaj jego instrukcji podglądu zamiast uruchamiać dowolny serwer.

Księga projektu zawiera interaktywne podglądy 390×844, 1024×768, 1440×900. Lokalne grafiki i style są dołączone; zewnętrzne linki służą wyłącznie jako źródła researchu. Fonty są systemowe.

## Co jest gotowe, a co jest demonstracją

Działają: nawigacja, wyszukiwanie, wybór narzędzi, znaczniki planów z przykładowymi kosztami i cofaniem, zoom/pan, inspektor pomieszczeń, przykładowe zatrudnienie i zmiana dwóch bloków harmonogramu, zapis/odczyt danych demonstracyjnych w localStorage.

Nie ma tu silnika Phaser ani kodu właściwej gry. Mapa to pojedynczy obraz. Znaczniki nie sprawdzają kolizji, nie tworzą pomieszczeń i nie uruchamiają budowniczych. Zegar nie steruje symulacją. Ceny i osoby są przykładowe. Synchronizacja chmurowa nie jest wdrożona. Nie wolno przenieść tych uproszczeń jako nowej logiki gry.

Nie zmodyfikowano repozytorium woogitsu/lockstate. Pełne wdrożenie wymaga osobnego dostępu do jego aktualnych źródeł. Ta paczka zawiera kompletny przygotowany projekt, nie całe repo gry.

## Pochodzenie i prywatność

Projekt oparto na ograniczonym odczycie źródeł i zapisanych zrzutach ekranu; bieżącego buildu gry nie uruchamiano. Sprawdzono składnię JavaScript; w v1 zmierzono wybrane pary kontrastu. Nie wykonano browser QA iteracji 02. Nie deklaruj pełnego przetestowania ani zgodności dostępności.

Plik prototype/.openai/hosting.json zachowano jako część dokładnego snapshotu. Zawiera identyfikator ISTNIEJĄCEGO Sites, nie jest szablonem nowego wdrożenia. Nie publikuj pod tym identyfikatorem bez kontekstu i uprawnienia właściciela; nie kopiuj go do repo gry. Dla integracji w woogitsu/lockstate stosuj konfigurację tamtego repo.

Paczka zawiera screenshot prywatnego projektu. Nie publikuj jej publicznie bez zgody właściciela. Brak tokenów, .git, baz danych i zapisów z localStorage użytkownika.
