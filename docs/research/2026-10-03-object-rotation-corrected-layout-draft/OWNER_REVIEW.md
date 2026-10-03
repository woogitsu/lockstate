# Obrót pojedynczego wyposażenia — zakres propozycji

## Dalsza lokalna poprawa przewijania, nadal szkic

Osobny runtime `1222c50445` naprawia obcinany nagłówek Budowy: pozostaje on widoczny i trafialny po fokusie obrotu270° oraz po prawdziwym przewijaniu. Nie dodaje wiersza ani napisu. Panel zapisu zachowuje25% minimum i otrzymuje stałe miejsce na pasek przewijania; Tab udostępnia wszystkie cztery działania w pełnej wysokości88px, również z rzeczywiście zapisanym więzieniem. Jedno ograniczone sprawdzenie PL200 zakończyło się GREEN. [Nagłówek i obrót](./native/scroll-fixed-saved/q3-focus.png) · [Dalsza część rzeczywistego zapisu](./native/scroll-fixed-saved/save-lower-actions.png).

Wcześniejsze2G EN/PL poniżej nadal dokumentują pełne zakupy i Save/Load. Nowe sprawdzenie nie powtarza całej macierzy ani zakupów: zapisuje nowe więzienie bez pomieszczenia. Jego panel zapisu279.69px jest wyższy niż wcześniejsze233.66px z pomieszczeniem, więc nie zastępuje pomiaru tego ciaśniejszego przypadku. Dalsze wiersze Build i zapisu wymagają przewijania; nie deklarujemy widoczności całych paneli naraz. Progi kamery i alertów nie były ponownie wykonywane. Szersza alokacja oraz dialog1840px pozostają osobną niezaakceptowaną propozycją. Właściciel otrzymał pytanie wyłącznie o nowy przycisk/napis #2019; odpowiedź na nie nie zatwierdza szerszej alokacji.

**Niezaakceptowana propozycja po rzeczywistym pomiarze.** Zamrożony `6d23180229` przeszedł oba pierwotne testy EN/PL: FullHD100/200, wszystkie20 kart, cztery działania także przy270°, prawdziwe zakupy q1 oraz pełny Save/Load. Wcześniejszy wariant pozostaje zachowany jako2RED. Parametry testów nie zostały osłabione.

## 1. Cztery działania w istniejącej grupie Buduj

Stawianie, usuwanie, kupowanie i obrót pozostają dostępne. Każdy przycisk otrzymuje dotychczasowy minimalny cel44px przy skali interfejsu100% i88px przy200%. Przy200% stawianie wraca z przypiętego nagłówka do tego samego wiersza działań. Nie dodajemy wiersza. Proponowany nowy napis to EN **Rotate object**, PL **Obróć obiekt**, z aktualnym kątem. Przycisk działa przez kliknięcie, Enter i Spację; **R pozostaje pochyleniem kamery**.

Koszt: część szerokości przypada teraz czterem działaniom, więc napisy się zawijają. Rzeczywisty pomiar potwierdził dotychczasowe wysokości44/88px, czytelność i trafialność wszystkich przycisków także przy270°.

## 2. Osobna, szersza alokacja przy200%

Na FullHD dialog20 wzorów proponujemy poszerzyć z960 do1840px, wykorzystując przestrzeń poziomą. Pozostają cztery kolumny, wszystkie20 kart, ich treść, miniatury i dotychczasowe progi. Build otrzymuje minimum wynikające z widocznej zawartości zamiast dalszego ściskania.

Koszt: dialog zasłania większą część gry podczas wyboru. Większy Build może zostawić mniej miejsca zapisowi i bocznemu paskowi. Zachowujemy minimum zapisu25% paska, listę Build110px przy200%, minima przycisków44/88px oraz istniejące granice kart. Jeżeli nie zmieszczą się jednocześnie, wariant zostanie odrzucony; nie zapłacimy za niego obcięciem listy, zapisu, alertów ani kamery.

## Granica decyzji

[Otwarty #2019](https://github.com/woogitsu/lockstate/issues/2019) obejmuje nową interakcję obrotu pojedynczego obiektu. [Scalony PR #1292](https://github.com/woogitsu/lockstate/pull/1292) pozostawił decyzję o budżecie wierszy i kolumn otwartą. Oczekujący wybór układu kamery A/B jest osobny. Żaden z tych zapisów nie zatwierdza nowego napisu ani powyższej alokacji.

Rzeczywisty koszt przy200%: panel Build jest większy od widocznej części paska i wymaga przewijania. Fokus obrotu przewija część nagłówka poza widok (EN46px, PL43px). Zapis zachował25% minimum (EN236.84px, PL233.66px wobec minimum205.25px), ale jego dalsze wiersze także wymagają przewijania. Lista Build ma nadal110px. Wszystkie20 kart są widoczne i trafialne (PL ostatnia granica890px). To **skala interfejsu**, nie zoom przeglądarki. Osobne progi alertów/kamery #1292 nie były ponownie wykonywane.

[Obrót270° — PL200](./native/corrected-original/pl-ui200-armed-q3-fullhd.png) · [Wszystkie20 kart — PL200](./native/corrected-original/pl-ui200-actual-all20-cards-fullhd.png) · [Dokładne pomiary](./native-observed-receipt.json).

Do decyzji właściciela: czy zatwierdzić nowy przycisk/napis i lokalny układ czterech działań oraz osobno szerszy dialog i opisany koszt przewijania. Istniejące napisy stawiania, usuwania, kupowania, wzorów i zapisu pozostają; jedyny nowy klucz to podany wyżej obrót obiektu. Ta gałąź pozostaje poza release.
