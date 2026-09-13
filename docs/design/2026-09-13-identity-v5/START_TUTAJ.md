# Lockstate — kompletne przekazanie projektu

## Aktualna wersja: iteracja 05, po audycie

Ta paczka zbiera cały rezultat pracy nad identyfikacją i prototypem: 5 wersji źródeł, zmiany między wersjami, dokumentację, grafiki, research, pomysły, konstytucję 20 artykułów, audyt i wykonywalne testy logiki.

**Implementację rozpoczynaj od AKTUALNY_PROTOTYP oraz DOKUMENTACJA. HISTORIA jest materiałem porównawczym.** Nie wdrażaj wszystkich wersji naraz. Najnowsze ustalenia mają pierwszeństwo nad wcześniejszymi.

## Szybki start

1. Otwórz `INDEKS.html` — mapa zawartości z linkami do aktualnego i historycznych widoków.
2. W zwykłym lokalnym środowisku uruchom `python3 PODGLAD.py` z katalogu tej paczki.
3. Otwórz `http://127.0.0.1:8000/INDEKS.html`.
4. Wejdź do aktualnego prototypu. „Księga projektu” zawiera identyfikację, język, konstytucję, podglądy urządzeń, research i audyt.
5. Testy: przejdź do AKTUALNY_PROTOTYP i uruchom `node tests/audit.cjs`.

Python służy wyłącznie jako lokalny serwer plików. Prototyp nie wymaga npm, kompilacji, kont ani usług. W środowiskach zarządzanych stosuj ich dozwolony sposób podglądu zamiast tego skryptu. Zamknij serwer Ctrl+C.

## Główne katalogi

- **AKTUALNY_PROTOTYP/** — dokładne śledzone źródła opublikowanej iteracji 05 i testy.
- **DOKUMENTACJA/** — specyfikacja, konstytucja, audyt i rozszerzone przekazanie dla kolejnego modelu.
- **ASSETY/** — wizja mapy; znak i ikony są we właściwych źródłach HTML/CSS/JS, nie osobnymi plikami fontów lub atlasów.
- **REFERENCJE/** — historyczny wygląd repo i zrzut z czerwonymi uwagami właściciela.
- **HISTORIA/** — pięć kompletnych wersji oraz patche; stare instrukcje v2 zachowane wyłącznie jako historia.
- **MANIFEST.json** — pochodzenie, rozmiary i SHA-256 wszystkich pozostałych plików.
- **SPRAWDZ_PACZKE.py** — kontrola integralności po rozpakowaniu.

## Co paczka nie zawiera

Nie jest to całe repozytorium gry woogitsu/lockstate ani gotowy silnik więzienia. Nie zawiera tokenów, historii wewnętrznych narzędzi, nagrań przeglądarki ani screenshotów nowych interfejsów, których nie wykonano. Widoki urządzeń są działającymi responsywnymi podglądami. Nie stworzono odrębnego nocnego atlasu świata; nocny motyw dotyczy interfejsu i przygaszenia ilustracji.

Kolejny model potrzebuje dostępu do aktualnego repo gry. Musi przeczytać jego aktualne AGENTS.md, dokumentację architektury i wymagane ADR, a następnie przenieść wygląd i interakcje na istniejące mechaniki.

## Zasady bezpieczeństwa przekazania

Pliki `.openai/hosting.json` zachowano w snapshotach dla kompletności. Identyfikują ISTNIEJĄCY prywatny Site. Nie kopiuj ich do repo gry ani nie używaj automatycznie do nowego wdrożenia. Nie są szablonem nowego projektu. Repo gry ma własne reguły publikacji i konfigurację.

Materiały pochodzą częściowo z prywatnego repozytorium. Paczka nie przyznaje zgody na publiczne udostępnienie. Nie ma w niej sekretów ani osobistych zapisów gry.

Pełny opis zakresu i ograniczeń: DOKUMENTACJA/07-STATUS-I-OGRANICZENIA.md.
