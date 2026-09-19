# Plan odbioru i regresji

## Wykonane testy

`node tests/audit.cjs` w AKTUALNY_PROTOTYP. W trakcie przygotowania tej paczki ponownie uzyskano 9/9 PASS. Dokładne przypadki są w audyt.md i wykonywalnym pliku. Testy uruchamiają fragmenty kodu w Node VM z atrapami UI; nie przeglądarkę.

## Testy ekranowe do wykonania

| Obszar | Czynności | Oczekiwany wynik |
|---|---|---|
| Layout | 390×844, 1024×768, 1440×900, niski ekran | Brak niezamierzonego overflow, narzędzia dostępne |
| Resize | Przeciągnij wszystkie krawędzie, wyjdź kursorem poza okno, przerwij gest | Poprawny rozmiar, brak polecenia mapy, zwolniony pointer |
| Zwijanie | Schowaj każdy panel, wszystkie naraz; przywróć strzałką | Uchwyty dostępne, fokus nie trafia w ukryty panel |
| Suwak/reset | Zmień rozmiar suwakiem, reset i dwuklik | Ten sam zakres i przewidywalne wartości |
| Klawiatura | Tab, separator, strzałki, Home/End, Enter, Escape | Fokus widoczny, limity jak dla myszy |
| Budowa | Wybierz, wskaż, anuluj, zatwierdź, cofnij | Spójny stan przycisków i kosztów demonstracji |
| Modal | Otwórz z listy, rerender listy, zamknij | Fokus wraca do dostępnego miejsca |
| Harmonogram | 08:59/09:00/11:59/12:00, północ | Poprawny pojedynczy bieżący przedział |
| Zapis | Zapisz, zmień, zamknij, wczytaj; blokada pamięci | Prawdziwy komunikat i brak częściowej utraty danych |
| Embed | Zmień układ, motyw i dane w podglądzie urządzenia | Główna sesja bez zmian |
| Motyw | Jasny/ciemny/system; zmiana systemu; formularze i błędy | Spójne role, czytelne stany |
| Tekst | Powiększenie 200%, długie tłumaczenia | Brak utraty treści i działań |
| Dotyk | Scroll w panelu, resize wysokości, tap narzędzia | Gesty nie przeciekają do mapy |

## Po integracji z grą

Sprawdzić prawdziwe odmowy, brak dojścia, wyposażenie, gotowość pokoi, kolejkę budowy, personel, przyjęcia, dostawy, incydenty, persistence i migracje. Wykonać wymagane benchmarki i testy z repozytorium. Wynik testów makiety nie zastępuje żadnej bramki gry.
