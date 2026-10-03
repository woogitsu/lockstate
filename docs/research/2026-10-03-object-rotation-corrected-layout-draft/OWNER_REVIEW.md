# Obrót pojedynczego wyposażenia — zakres propozycji

**Szkic do pomiaru, jeszcze bez rekomendacji zatwierdzenia.** Dotychczasowy wariant przeszedł rzeczywiste zakupy q1 i pełny Save/Load, ale oba testy językowe zakończyły się RED na układzie. Poprawiony wariant nie był jeszcze uruchomiony w przeglądarce.

## 1. Cztery działania w istniejącej grupie Buduj

Stawianie, usuwanie, kupowanie i obrót pozostają dostępne. Każdy przycisk otrzymuje dotychczasowy minimalny cel44px przy skali interfejsu100% i88px przy200%. Przy200% stawianie wraca z przypiętego nagłówka do tego samego wiersza działań. Nie dodajemy wiersza. Proponowany nowy napis to EN **Rotate object**, PL **Obróć obiekt**, z aktualnym kątem. Przycisk działa przez kliknięcie, Enter i Spację; **R pozostaje pochyleniem kamery**.

Koszt: część szerokości przypada teraz czterem działaniom, więc napisy mogą się zawijać. Pomiar musi potwierdzić dotychczasową wysokość, czytelność i możliwość trafienia we wszystkie przyciski, także przy270°.

## 2. Osobna, szersza alokacja przy200%

Na FullHD dialog20 wzorów proponujemy poszerzyć z960 do1840px, wykorzystując przestrzeń poziomą. Pozostają cztery kolumny, wszystkie20 kart, ich treść, miniatury i dotychczasowe progi. Build otrzymuje minimum wynikające z widocznej zawartości zamiast dalszego ściskania.

Koszt: dialog zasłania większą część gry podczas wyboru. Większy Build może zostawić mniej miejsca zapisowi i bocznemu paskowi. Zachowujemy minimum zapisu25% paska, listę Build110px przy200%, minima przycisków44/88px oraz istniejące granice kart. Jeżeli nie zmieszczą się jednocześnie, wariant zostanie odrzucony; nie zapłacimy za niego obcięciem listy, zapisu, alertów ani kamery.

## Granica decyzji

[Otwarty #2019](https://github.com/woogitsu/lockstate/issues/2019) obejmuje nową interakcję obrotu pojedynczego obiektu. [Scalony PR #1292](https://github.com/woogitsu/lockstate/pull/1292) pozostawił decyzję o budżecie wierszy i kolumn otwartą. Oczekujący wybór układu kamery A/B jest osobny. Żaden z tych zapisów nie zatwierdza nowego napisu ani powyższej alokacji.

Przed skierowaniem klikalnej propozycji do właściciela potrzebne są rzeczywiste zrzuty EN/PL przy100% i200% oraz pomiary Build, zapisu, paska i wszystkich20 kart. To **skala interfejsu**, nie zoom przeglądarki.
