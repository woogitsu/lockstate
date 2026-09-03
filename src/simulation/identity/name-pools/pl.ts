import type { ActorNamePool } from '../name-pool';

/**
 * Polish naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * **Romanized, and that is a loss this file names rather than hides.** Polish
 * orthography carries nine diacritics (`a-ogonek`, `c-acute`, `e-ogonek`,
 * `l-stroke`, `n-acute`, `o-acute`, `s-acute`, `z-acute`, `z-dot`) and the
 * ASCII forms here drop all of them: `Wisniewski` for the correctly spelled
 * surname, `Malgorzata` for the correctly spelled given name, `Krol` for the
 * word meaning king. Every such entry is a name a Polish speaker would call
 * misspelled. `docs/adr/0094-which-names-a-prison-draws-from.md` decision 3
 * is the proposal that would let a `v2` of this pool spell them properly; the
 * pool id carries the `v1` so that replacement is an addition, not an edit.
 */
export const ACTOR_NAME_POOL_PL: ActorNamePool = {
  id: 'authored.pl.v1',
  givenNames: [
    'Agata', 'Agnieszka', 'Aleksander', 'Alicja', 'Andrzej', 'Aniela', 'Antoni', 'Arkadiusz',
    'Aurelia', 'Barbara', 'Bartosz', 'Beata', 'Blazej', 'Bogdan', 'Bogumila', 'Boguslaw',
    'Boleslaw', 'Bozena', 'Bronislaw', 'Cecylia', 'Cezary', 'Czeslaw', 'Dagmara', 'Damian',
    'Daniela', 'Danuta', 'Dariusz', 'Dorota', 'Edyta', 'Elzbieta', 'Emilia', 'Eugeniusz',
    'Ewelina', 'Feliks', 'Filip', 'Franciszek', 'Genowefa', 'Gerard', 'Grazyna', 'Grzegorz',
    'Halina', 'Henryk', 'Hieronim', 'Honorata', 'Ignacy', 'Igor', 'Iwona', 'Izabela',
    'Jacek', 'Jadwiga', 'Janina', 'Jaroslaw', 'Jerzy', 'Joanna', 'Jolanta', 'Justyna',
    'Kacper', 'Kamila', 'Karolina', 'Kazimierz', 'Klaudia', 'Konrad', 'Krystyna', 'Krzysztof',
    'Ksawery', 'Leokadia', 'Leszek', 'Longin', 'Lucjan', 'Ludwika', 'Maciej', 'Magdalena',
    'Malgorzata', 'Marcelina', 'Marcin', 'Mariola', 'Mateusz', 'Michalina', 'Mieczyslaw', 'Miroslaw',
    'Nikodem', 'Norbert', 'Olgierd', 'Otylia', 'Patrycja', 'Pawel', 'Przemyslaw', 'Radoslaw',
    'Rafal', 'Renata', 'Robert', 'Roksana', 'Roman', 'Ryszard', 'Sabina', 'Seweryn',
    'Slawomir', 'Stanislaw', 'Stefania', 'Sylwester', 'Szymon', 'Tadeusz', 'Teodor', 'Teresa',
    'Tomasz', 'Urszula', 'Waclaw', 'Waldemar', 'Weronika', 'Wieslaw', 'Wiktoria', 'Wincenty',
    'Witold', 'Wladyslaw', 'Wojciech', 'Zbigniew', 'Zdzislaw', 'Zofia', 'Zuzanna', 'Zygmunt',
  ],
  familyNames: [
    'Adamczyk', 'Adamski', 'Andrzejewski', 'Bak', 'Balcerzak', 'Baran', 'Baranowski', 'Bartoszek',
    'Bednarczyk', 'Bednarek', 'Bialek', 'Bielecki', 'Biernacki', 'Blaszczyk', 'Bobrowski', 'Bochenek',
    'Bogucki', 'Borkowski', 'Borowiec', 'Brzezinski', 'Bugaj', 'Burzynski', 'Cebula', 'Chmiel',
    'Chmielewski', 'Chojnacki', 'Cieslak', 'Ciszewski', 'Czajka', 'Czapla', 'Czarnecki', 'Czerwinski',
    'Dabrowski', 'Dobrowolski', 'Domanski', 'Drozd', 'Duda', 'Dudek', 'Dziedzic', 'Fabisiak',
    'Falkowski', 'Filipiak', 'Frankowski', 'Gajda', 'Gajewski', 'Galecki', 'Gawronski', 'Glowacki',
    'Golab', 'Gorski', 'Grabowski', 'Grochowski', 'Grzelak', 'Grzybowski', 'Gwozdz', 'Halicki',
    'Iwanski', 'Jablonski', 'Jagielski', 'Jakubowski', 'Janicki', 'Jankowski', 'Jarosz', 'Jasinski',
    'Jaworski', 'Jedrzejczyk', 'Kaczmarczyk', 'Kaczmarek', 'Kalinowski', 'Kaminski', 'Karpinski', 'Kasprzak',
    'Kaszuba', 'Kedziora', 'Kicinski', 'Kielczewski', 'Klimek', 'Kolodziej', 'Konopka', 'Kopec',
    'Korzeniowski', 'Kosinski', 'Kotarba', 'Kowalczyk', 'Kowalewski', 'Kowalski', 'Kozak', 'Kozlowski',
    'Krajewski', 'Krawczyk', 'Krol', 'Krupa', 'Krzeminski', 'Kubiak', 'Kucharski', 'Kujawa',
    'Kulesza', 'Kurek', 'Kwiatkowski', 'Laskowski', 'Lasota', 'Lech', 'Lesniak', 'Lewandowski',
    'Lipinski', 'Lis', 'Maciejewski', 'Majchrzak', 'Majewski', 'Makowski', 'Malinowski', 'Marciniak',
    'Markiewicz', 'Marzec', 'Matuszak', 'Mazur', 'Michalak', 'Michalski', 'Mielcarek', 'Mikolajczyk',
    'Milewski', 'Mroz', 'Mucha', 'Nawrocki', 'Niemiec', 'Nowacki', 'Nowak', 'Nowicki',
    'Olejniczak', 'Olszewski', 'Orlowski', 'Ostrowski', 'Owczarek', 'Pajak', 'Panek', 'Pasternak',
    'Pawlak', 'Pawlowski', 'Piatek', 'Piekarski', 'Pietrzak', 'Pilch', 'Piotrowski', 'Plonka',
    'Podgorski', 'Polak', 'Prokop', 'Przybylski', 'Ptak', 'Pytel', 'Rogalski', 'Romanowski',
    'Rutkowski', 'Rybak', 'Sadowski', 'Sikora', 'Sobczak', 'Stasiak', 'Szymanski', 'Wisniewski',
  ],
};
