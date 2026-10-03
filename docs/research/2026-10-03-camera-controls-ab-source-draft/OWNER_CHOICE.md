# Kamera — dwie niezaakceptowane propozycje

**[A: View / Widok otwiera panel](https://github.com/woogitsu/lockstate/commit/85cff605f5888ae930b80aeb56d1ec5774b4f985).** Przycisk przy istniejącym powiększeniu otwiera wybór widoku oraz te same działania przesuwania, obrotu i pochylenia. Escape zamyka panel. Koszt: dodatkowe naciśnięcie; zamknięty panel oddaje miejsce mapie.

**[B: ten sam panel zawsze widoczny](https://github.com/woogitsu/lockstate/commit/e5bd0783d789c6068f5b1345f63705e34fbc2d02).** Funkcje są dostępne od razu. Koszt: panel stale zasłania część górnego obszaru mapy.

Napisy, funkcje kamery i minima44/88px pozostają. Żaden wariant nie zabiera wysokości liście powiadomień ani minimapie. To decyzja o rozmieszczeniu/discoverability kamery #1292, niezależna od przycisku obrotu wyposażenia #2019 i szerszej alokacji Build/Save200.

Na źródle305 przygotowano rzeczywiste osobne gałęzie i testy producenta; **nie uruchomiono ich jeszcze w przeglądarce**. Wcześniejsze angielskie zrzuty przejściowych wariantów były innym pakietem. Po wyborze potrzebny jest rzeczywisty pomiar aktualnego wariantu z pełnym wierszem powiadomień, wszystkimi działaniami i pierwotnymi progami. Nie zmieniamy wydania przed tą decyzją.
