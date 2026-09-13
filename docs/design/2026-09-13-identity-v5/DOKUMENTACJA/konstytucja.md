# Konstytucja doświadczenia Lockstate

Wersja projektu: 1.0 · 13 września 2026

Status: nowa propozycja zasad produktu, identyfikacji, interfejsu i komunikacji. Uzupełnia kontrakt techniczny repozytorium. Nie zastępuje AGENTS.md, zaakceptowanych ADR ani zasad dostępu do usług.

## Obietnica produktu

**Twoje decyzje. Żywy świat.**

Lockstate jest rozbudowaną, przeglądarkową symulacją więzienia. Gracz projektuje przestrzeń, organizuje codzienność i obserwuje konsekwencje. Przyjazność oznacza czytelność, przewidywalność i kontrolę. Nie usuwa złożoności ani odpowiedzialności.

## Artykuł 1. Mapa jest miejscem gry

Świat i skutki decyzji mają pierwszeństwo przed panelami. Pierwszy ekran pokazuje mapę oraz potrzebne narzędzia. Informacja kontekstowa prowadzi do miejsca, którego dotyczy. Dekoracyjna strona marketingowa nie zastępuje rozgrywki.

## Artykuł 2. Jedno zadanie, jeden panel

Jeden panel jest głównym miejscem działania w danej chwili. Na komputerze mieści się obok mapy. Na telefonie ma stany niski, rozwinięty i zwinięty. Otwieranie panelu nie wydaje polecenia symulacji.

## Artykuł 3. Plan poprzedza koszt

Wskaż zakres, wymagania i koszt przed potwierdzeniem. Odróżniaj: wskazanie, podgląd, przyjęte zlecenie, realizację, gotowy obiekt i odmowę. Cofanie może obiecywać zwrot tylko wtedy, gdy system rzeczywiście go realizuje. Bieżący prototyp cofa wyłącznie własne znaczniki.

## Artykuł 4. Stan ma jedno źródło

Interfejs konsumuje projekcje symulacji. Nie wylicza ponownie pojemności pomieszczeń, potrzeb, gotowości, finansów czy przydziałów. Rendering nie jest źródłem stanu gry. Zachowujemy deterministyczny kernel, Web Worker, wersjonowane zapisy i chunkowany świat.

## Artykuł 5. Każde zdanie jest prawdziwe

Nie mów „zapisano”, zanim zapis zostanie potwierdzony. Nie mów „wolne miejsce”, jeśli znana jest wyłącznie liczba łóżek. „Brak incydentów” i „brak danych” to różne stany. Nigdy nie obiecuj synchronizacji w chmurze bez wdrożonego przepływu.

## Artykuł 6. Problem prowadzi do działania

Komunikat podaje fakt, lokalizację i następny krok. Ostrzeżenia nie znikają dlatego, że przyszło nowsze zdarzenie. Historia zdarzeń pozostaje dostępna. Przycisk naprawczy musi mieć rzeczywistą implementację; inaczej tekst tylko wyjaśnia stan.

## Artykuł 7. Dotyk jest pełnoprawny

Każde istotne działanie jest dostępne bez hovera. Docelowe pola dotykowe mają co najmniej 44 × 44 px. Przewijanie list nie przesuwa mapy. Rozpoczęcie gestu na panelu nie buduje obiektu pod panelem. Przesunięcie kamery i zlecenie budowy nie mogą wynikać z tego samego gestu.

## Artykuł 8. Informacja ma więcej niż kolor

Status ma etykietę i odpowiednią ikonę. Tekst podstawowy: 16 px, regularne etykiety: 14 px, metadane: 12 px. Odbiór wymaga pomiaru kontrastu, zachowania przy powiększeniu 200%, widocznego fokusu i sprawdzenia klawiatury. Sama paleta nie jest certyfikatem dostępności.

## Artykuł 9. Ludzie są ludźmi

Używamy języka rzeczowego i szanującego osadzonych oraz personel. Nie żartujemy z cierpienia i nie infantylizujemy zagrożeń. Rozgrywka może mieć trudne konsekwencje, ale komunikat nie karci gracza i nie robi z ludzi zasobów w warstwie narracyjnej.

## Artykuł 10. Gracz kontroluje tempo

Pauza jest stale dostępna. Animacje nie opóźniają narzędzi. Ustawienie ograniczonego ruchu ma pierwszeństwo. Skróty odpowiadają istniejącemu abstrakcyjnemu systemowi wejścia i muszą wspierać remapping, QWERTY/AZERTY oraz odpowiedniki dotykowe.

## Artykuł 11. Świat ma własną tożsamość

Oryginalny znak, tekst, układ i grafika. Widok świata pozostaje spójny przestrzennie: górna perspektywa, widoczne boki obiektów, czytelne sylwetki, ograniczone dekoracje. Nie kopiujemy zasobów ani layoutu Prison Architect. Grafika koncepcyjna wymaga osobnej produkcji atlasów.

## Artykuł 12. Gotowe znaczy sprawdzone

Przed integracją wymagane są: typowanie, testy odpowiednich zachowań, build, kontrola zapisu i migracji, dowody wydajności dla kosztownych zmian, aktualizacja dokumentacji oraz odbiór na telefonie, tablecie i komputerze. Wizualizacja nie dowodzi działania systemów gry.

## Rozstrzyganie sporów projektowych

1. Prawdziwość danych i bezpieczeństwo zapisu.
2. Dostępność potrzebnego działania.
3. Czytelność i orientacja w świecie.
4. Spójność nazewnictwa i zachowania.
5. Walory estetyczne.

Zmianę zasady dokumentujemy wraz z przyczyną, zakresem i dowodem. Nie przebudowujemy architektury ani uprawnień pod pretekstem odświeżenia wyglądu.

## Rozszerzenie po audycie — artykuły 13–20

### 13. Układ nie jest stanem świata
Szerokość panelu, zwinięcie i motyw są preferencjami interfejsu. Nie zmieniają zegara, ekonomii, geometrii ani schematu zapisu gry. Mają oddzielne klucze pamięci i niezależny reset.

### 14. Zapis ma określony zakres
Odróżniamy zapis na urządzeniu od pamięci pojedynczego podglądu. Każda późniejsza zmiana, również upływ zapisywanego czasu, unieważnia potwierdzenie zapisania bieżącego stanu. Nie zapisano i brak dostępu do pamięci nie są sukcesem. Wczytanie waliduje całość przed zmianą stanu.

### 15. Podgląd jest izolowany
Makiety urządzeń nie nadpisują głównej sesji ani jej preferencji. Dane demonstracyjne nie stają się schematem gry. W osadzonych podglądach tej wersji zapis i preferencje istnieją tylko w pamięci do zamknięcia widoku.

### 16. Zamknięcie ma drogę powrotną
Panel przywraca widoczny uchwyt. Zamknięcie okna oddaje fokus dostępnemu wyzwalaczowi lub mapie. Anulowanie narzędzia odświeża również etykiety i zaznaczenie. Ukryty panel nie przechwytuje klawiatury.

### 17. Gest ma jednego właściciela
Separator zmienia rozmiar panelu, nie kamerę ani budowę. Pointer cancel i utrata przechwycenia kończą gest. Limity klawiatury i myszy są spójne. Testy wymagają także próby wyjścia kursorem poza uchwyt.

### 18. Czas i zaznaczenie mają znaczenie
Bieżący blok harmonogramu odpowiada zegarowi, również na granicy przedziału i po północy. Aktywna sekcja odpowiada treści inspektora. Nie używamy stałego wyróżnienia do udawania aktualnego stanu.

### 19. Tryb nocny zachowuje semantykę
Znaczenie statusów, fokus i hierarchia informacji pozostają równoważne w obu motywach. Sprawdzenie obejmuje stany zwykłe, wybrane, wyłączone, ostrzeżenia, modalne i fokus. Motyw nie zmienia symulowanej pory dnia.

### 20. Dowód ma nazwany zakres
Test logiki nie dowodzi działania layoutu ani dotyku. Raport podaje źródło, przeprowadzone testy, rezultat i otwarte ryzyka. Gotowość do integracji i gotowość produkcyjna są osobnymi etapami. Zmiana kodu wymaga ponownego sprawdzenia dotkniętych zachowań.
