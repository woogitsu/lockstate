# Research i pomysły

## Materiały źródłowe

1. https://factorio.com/blog/post/fff-238 — autorzy opisują wiązanie informacji z obiektem, ograniczanie zbędnych okien i spójność rozpoznawania przycisków. Własny wniosek: inspektor pomieszczeń przy mapie oraz jednolite akcje.
2. https://www.factorio.com/blog/post/fff-423 — informacje dostępne bez utraty bieżącego kontekstu. Własny wniosek: nie zasłaniać świata przy każdym sprawdzeniu obiektu.
3. https://wiki.factorio.com/Quickbar — rozróżnienie skrótów do narzędzi i zapasów. Własny wniosek: stały pasek narzędzi nie udaje magazynu.
4. https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/ — separator z wartością, nazwą i sterowaniem klawiaturą. Uwaga autorów o niezakończonym przeglądzie wzorca: to wskazówka implementacyjna, nie certyfikat dostępności.
5. https://code.visualstudio.com/docs/configure/custom-layout — zwijanie, przywracanie, pamiętanie układu i tryb skupienia. Inspiracja zachowaniem, nie identyfikacją wizualną.

Nie przeprowadzono badań z graczami. Wnioski estetyczne są autorskimi decyzjami projektowymi. Nie kopiowano kodu ani zasobów wymienionych produktów.

## Wdrożone w prototypie

- Rzeczowe nazwy i katalog o stałej kolumnie cen.
- Inspektor przy mapie i szybkie narzędzia.
- Zwijanie trzech paneli, resize, suwak, reset, zapamiętywanie i „Tylko mapa”.
- Jasny/ciemny/systemowy motyw.
- Audyt stanów, izolacja embed, testy i rozszerzona konstytucja.

## Propozycje kolejnego etapu — niewdrożone

| Pomysł | Cel | Zależność / warunek |
|---|---|---|
| Zbiorczy plan pomieszczenia | Zaznaczenie prostokąta, suma kosztów, braki | Rzeczywista geometria, ekonomia i kolejka workera |
| Powód braku dostępu na mapie | Zlokalizować przerwę w dojściu | Dane istniejącej nawigacji, nie zgadywanie przez UI |
| Brak wyposażenia przy strefie | Powiązać komunikat z miejscem | Projekcja wymagań pomieszczenia |
| Kopiowanie poprawnego pokoju | Skrócić powtarzalną pracę | Istniejący model poleceń, kosztów i undo |
| Ulubione narzędzia | Dostosować pasek do stylu gry | Osobne preferencje UI, remapping i dotyk |
| Historia zleceń | Odróżnić plan, odmowę, realizację i zakończenie | Rzeczywiste zdarzenia i projekcje |
| Własne dopracowane atlasy | Spójna skala, materiały i światło | Pipeline grafiki, pivoty, warstwy, budżet pamięci |
| Rozbudowane alarmy kontekstowe | Wyjaśnić problem i prowadzić do obiektu | Prawdziwe dane oraz dostępność na telefonie |

Nie dorabiać systemów w tle pod pozorem zmiany wyglądu. Nowe mechaniki wymagają osobnego zakresu, testów i zgodności z regułami repo.
