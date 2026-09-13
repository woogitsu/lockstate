# System wizualny — kierunek obowiązujący

## Tożsamość

Nazwa: Lockstate. Pierwsza koncepcja wordmarku „lockstate.”; iteracja 02 usuwa wizualnie końcową kropkę w UI. Znak: modułowe „l” z przejściem, wykonane w HTML/CSS. Zachowujemy oryginalny znak bez kopiowania kłódek czy kajdanek konkurencyjnych gier.

Pierwotna obietnica marki „Twoje decyzje. Żywy świat.” pozostaje materiałem identyfikacji. Nie należy umieszczać jej zamiast użytecznych nagłówków w narzędziach gry.

## Rytm i charakter

Architektoniczny warsztat: płaskie grupy, kolumny wartości, numery stref, wyróżniona krawędź aktywnego elementu. Unikać osobnej zaokrąglonej karty dla każdego wiersza, marketingowych nagłówków i sztucznej rdzy/śrub. Cienie tylko dla rzeczy unoszących się nad mapą.

Kształty aktualne: 2–4 px dla narzędzi; 8 px dla okien; 12 px na górze mobilnego inspektora. Dokumentacja pierwotna zawiera większe promienie jako historię.

## Paleta dzienna

| Rola | Wartość |
|---|---|
| Rama | #122C3A |
| Tekst | #183442 |
| Tekst pomocniczy | #5C717D |
| Działanie | #007477 |
| Marka / mięta | #89E0C3 |
| Powierzchnia | #FFFFFF |
| Tło | #F2F6F8 |
| Obramowanie | #DCE5E9 |
| Wybór | #DFF5F0 |
| Ostrzeżenie | #895300 na #FFF1D7 |
| Zagrożenie | #B63744 na #FFEBED |

Turkus został przyciemniony z początkowego #007E80 po sprawdzeniu kontrastu. Nie wracać do pierwszej wartości.

## Paleta nocna

| Rola | Wartość |
|---|---|
| Tło | #10232E |
| Rama nagłówka | #0B1D27 |
| Panele | #132A36 / #193440 |
| Tekst | #E0EDF2 |
| Tekst pomocniczy | #ADC2CD |
| Akcent | #8CDEC9 |
| Wybór | #22473F |
| Przycisk główny | #89DFC7, tekst #102C2D |
| Obramowanie | #36505E |
| Ostrzeżenie | #F0C77F na #443522 |
| Zagrożenie | #FFB3B9 na #482B35 |

Źródła mają także lokalne korekty kolorów dla komponentów. Przy integracji skonsolidować je w semantyczne tokeny repo. Lista nie zastępuje audytu całej kaskady.

## Typografia i ikony

Segoe UI / Arial; monospace (Consolas lub systemowy) dla numerów i metryk. Nie dołączono licencjonowanych fontów. Docelowo tekst podstawowy 16 px, etykiety 14 px, metadane 12 px. Prototyp nadal ma lokalne mniejsze wartości — zgodność wszystkich widoków wymaga przeglądu.

Ikony to liniowe SVG w obiekcie icons w app.js. Są częścią źródeł. Nie wygenerowano osobnej biblioteki ikon ani wariantów brand manual w PDF.

## Świat

world.png pokazuje rzut z góry z widocznymi bokami ścian, jasne posadzki, zieleń, pomarańczowe akcenty i niebieski personel. Nie jest produkcyjnym atlasem. Tryb nocny przygasza obraz, nie tworzy oświetlenia ani symulacji nocy.
