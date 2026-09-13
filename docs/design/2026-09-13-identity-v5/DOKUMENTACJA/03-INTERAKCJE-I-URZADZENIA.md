# Interakcje, urządzenia i stany

## Nawigacja

Przegląd / Buduj / Strefy / Zarządzaj / Plan dnia. Rzeczowe tytuły: Budowa, Raport dzienny, Pomieszczenia, Personel i przyjęcia, Harmonogram. Karta pomieszczenia otwiera inspektor oraz wybiera sekcję Strefy.

## Budowanie w demonstracji

Katalog → element → „Zaplanuj element” → wskazanie miejsca → koszt → potwierdzenie/anulowanie. Potwierdzenie tworzy znacznik i odejmuje przykładowy koszt; cofnięcie zwraca koszt. Przycisk, Escape i zmiana sekcji muszą odzwierciedlać anulowanie.

Brak walidacji kolizji, stref, materiałów i workerowej kolejki. Nie przenosić tego modelu kosztów do gry bez weryfikacji istniejącej ekonomii.

## Mapa

Zoom 60–220%. Przesuwanie myszką i strzałkami ograniczone do x ±600 i y ±500 px w demonstracji. To limity prototypu, nie docelowe granice chunkowanego świata. Siatka jest dekoracyjną pomocą, nie geometrią gry.

Skróty 1–4 wybierają ścianę, drzwi, podłogę i łóżko. W produkcji użyć istniejącego remappingu, QWERTY/AZERTY i semantycznych akcji. Ctrl/Cmd+Z cofa ostatni znacznik. Wskazanie pola budowy nadal wymaga wskaźnika.

## Panele

Strzałki zwijają lewą nawigację, prawy inspektor i górny pasek metryk. Uchwyty pozostają dostępne. Panel boczny zmienia szerokość przez przeciąganie; dolny na telefonie zmienia wysokość.

- Lewy: 72–180 px.
- Prawy desktop: 260–600 px, z limitem pozostawiającym miejsce na mapę.
- Telefon: wysokość od 180 px do ograniczenia zależnego od ekranu (maks. około 66% wysokości i rezerwa 210 px).
- Dwuklik: domyślny rozmiar panelu.
- Strzałki: 10 px; Shift+strzałki: 40 px; Home/End: skrajne rozmiary; Enter: zwinięcie.
- Menu Układ: suwak, reset, „Tylko mapa”, zegar dostępny także po schowaniu metryk.

Preferencje głównej sesji: lockstate-layout-v1. Zapis gry jest osobny. Resize i gest mapy nie mogą nakładać się na siebie.

## Motyw

Przełącznik słońce/księżyc; Ustawienia → dzienny/nocny/systemowy. Klucz lockstate-theme-v1. Zmiana systemowego motywu działa, kiedy wybrano system. Zwykłe karty odbierają zmiany preferencji przez storage event. Embed jest izolowany.

## Zapisy

Główna demonstracja: localStorage lockstate-design-v1. Podglądy urządzeń: osobny Map w pamięci każdego iframe; po zamknięciu sesji dane znikają. Nie traktować ich jako zapisu na urządzeniu. Właściwa gra powinna używać istniejącego IndexedDB i ochrony konfliktów.

Upływ zapisywanego czasu również oznacza niezapisane zmiany. Błędny odczyt nie może częściowo zastosować danych. Prototyp nie ma pełnego systemu konfliktów dwóch zwykłych kart.

## Urządzenia i podglądy

Księga → Urządzenia: 390×844, 1024×768, 1440×900. To iframe z tą samą aplikacją, nie screenshoty. Nowy wygląd może być wyświetlony w obu motywach; wybór motywu iframe jest izolowany od głównej sesji.

Telefon ma dolną nawigację i panel; tablet/desktop mają mapę między bokami. Pełne sprawdzenie overflow, dotyku i powiększenia 200% pozostaje etapem odbioru.
