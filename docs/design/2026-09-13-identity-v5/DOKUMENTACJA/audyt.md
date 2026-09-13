# Audyt Lockstate — iteracja 05

Zakres: aktualny, prywatny prototyp projektu. Nie jest to audyt repozytorium właściwej gry. Oceniono kod HTML/CSS/JS oraz wykonano testy logiki w Node VM. Statyczny projekt nie ma obsługiwanego serwera podglądu w obecnym zarządzanym środowisku; nie przeprowadzono browser QA ani oceny renderingu na rzeczywistych urządzeniach.

## Naprawione ustalenia

| Problem | Dowód w poprzednim kodzie | Poprawka |
|---|---|---|
| Stopka mogła nadal twierdzić, że bieżący stan jest zapisany | Akcje ustawiały saved=false bez zmiany treści save-status | Wspólne markDirty; również dla zapisywanego czasu |
| Osadzone widoki mogły nadpisywać dane i preferencje głównej sesji | Wspólne localStorage i identyczne klucze we wszystkich iframe | Podglądy embed używają izolowanej pamięci, bez dostępu do zapisów głównej sesji |
| Harmonogram stale wyróżniał poranek | Warunek slot==='morning' | Przedziały czasu z obsługą północy i odświeżaniem |
| Inspektor pomieszczenia nie odpowiadał aktywnej nawigacji | roomDetail nie wybierało sekcji rooms | Wybór sekcji Strefy razem z otwarciem karty |
| Escape pozostawiał nieaktualny stan przycisku budowy | Zmieniał flagę, nie renderował panelu | Odświeżenie panelu po anulowaniu |
| Klawiatura mogła przesunąć mapę poza limity myszy | Brak clamp w obsłudze strzałek | Te same limity przesuwania |
| Wczytanie dopuszczało ułamkową minutę i podmienioną cenę planu | isFinite zamiast integer; dowolny nieujemny cost | Całkowita minuta oraz koszt zgodny z katalogiem demonstracji |
| Powrót fokusu celował w nieistniejący przycisk | Samo lastFocus.focus po rerenderze | Sprawdzenie isConnected i fallback do mapy |

## Wynik testów

Komenda z katalogu projektu: `node tests/audit.cjs`.

9/9 testów zaliczonych:
1. Zapis, późniejsza zmiana i aktualizacja stopki.
2. Cofnięcie planu oddaje koszt w demonstracji.
3. Poprawne wczytanie odtwarza dane i anuluje aktywne narzędzie.
4. Błędny JSON nie zmienia stanu.
5. Cena planu niezgodna z katalogiem jest odrzucana.
6. Ułamkowa minuta jest odrzucana.
7. Niedostępna pamięć nie daje potwierdzenia sukcesu.
8. Przedziały harmonogramu, granice oraz okres przez północ.
9. Pamięć osadzonego widoku nie odwołuje się do głównego localStorage.

Sprawdzono także składnię JS. Testy wykonują fragmenty kodu aplikacji z minimalnymi zastępczymi elementami UI. Nie uruchamiają DOM przeglądarki, renderera, dotyku ani CSS. Nie stanowią dowodu pełnej dostępności.

## Pozostałe ryzyka i granice

- Wymagany browser QA: szerokości 390/1024/1440, niski ekran, resize, pointercancel, fokus, overflow, powiększenie tekstu 200%.
- Pełna kontrola kontrastu obu motywów i wszystkich stanów komponentów nadal wymagana; wcześniejszy pomiar dotyczył tylko wybranych par palety dziennej.
- Narzędzia mapy mają ograniczoną obsługę klawiatury; samo wskazanie miejsca budowy w prototypie nadal wymaga wskaźnika. Nie deklarować pełnej obsługi gry klawiaturą.
- Zapis głównej demonstracji nie ma ochrony przed równoczesnym nadpisaniem przez dwie zwykłe karty. Integracja musi używać istniejącego systemu IndexedDB i ochrony konfliktów gry.
- app.js oraz CSS powstawały iteracyjnie: kolejne nadpisania należy uporządkować przy integracji, po zabezpieczeniu zachowań testami.
- Mapa to jedna ilustracja, ceny i dane operacyjne są przykładowe. Nie ma walidacji kolizji ani symulacji budowy.
- Harmonogram i liczby przykładowego scenariusza nie potwierdzają stanu prawdziwej gry.
- Specyfikacja zawiera historyczne sekcje iteracji 01–04. W sprawach zmienionych pierwszeństwo mają najnowsza sekcja i ten raport.

## Konstytucja

Rozszerzono z 12 do 20 artykułów: rozdział preferencji i symulacji, zakres zapisu, izolacja podglądów, powrót z panelu, właściciel gestu, semantyka czasu, motyw nocny i zakres dowodu.

Nowego ZIP-a jeszcze nie przygotowano — zgodnie z ustaleniem, że powstanie po zakończeniu poprawek.
