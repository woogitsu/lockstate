import type { ActorNamePool } from '../name-pool';

/**
 * German naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * Romanized by the digraph convention German itself supplies for exactly this
 * case -- `ae`, `oe`, `ue` for the umlauts and `ss` for eszett -- so
 * `Guenther`, `Joerg`, `Juergen` and `Gaertner` are forms a German reader
 * recognises as the standard ASCII spelling rather than as a misspelling.
 * That makes this the one pool here whose romanization costs nothing, and it
 * is worth saying so beside `./pl.ts`, where the same rule costs a great deal.
 */
export const ACTOR_NAME_POOL_DE: ActorNamePool = {
  id: 'authored.de.v1',
  givenNames: [
    'Achim', 'Adelheid', 'Agnes', 'Albrecht', 'Alfons', 'Almuth', 'Annegret', 'Anneliese',
    'Ansgar', 'Arnold', 'Astrid', 'Baldur', 'Bastian', 'Bernhard', 'Bertold', 'Birgit',
    'Bodo', 'Brigitte', 'Bruno', 'Burkhard', 'Christa', 'Christoph', 'Clemens', 'Cordula',
    'Detlef', 'Dieter', 'Dietmar', 'Dietrich', 'Dorothea', 'Eberhard', 'Eckhard', 'Edeltraud',
    'Egon', 'Elfriede', 'Elke', 'Emmerich', 'Engelbert', 'Erhard', 'Erika', 'Ernst',
    'Ewald', 'Falko', 'Ferdinand', 'Frauke', 'Friedhelm', 'Friedrich', 'Gerhard', 'Gerlinde',
    'Gernot', 'Gertrud', 'Gisela', 'Gottfried', 'Gottlieb', 'Gudrun', 'Guenther', 'Hannelore',
    'Hartmut', 'Hedwig', 'Heiko', 'Heinrich', 'Helga', 'Helmut', 'Herbert', 'Hildegard',
    'Holger', 'Horst', 'Hubert', 'Ilse', 'Ingeborg', 'Ingrid', 'Irmgard', 'Joachim',
    'Jochen', 'Joerg', 'Juergen', 'Jutta', 'Karsten', 'Katharina', 'Klaus', 'Konstanze',
    'Kurt', 'Leonhard', 'Liesel', 'Lothar', 'Ludwig', 'Luitgard', 'Manfred', 'Marlene',
    'Mechthild', 'Meinhard', 'Norbert', 'Odilia', 'Ortrud', 'Ottilie', 'Ottmar', 'Otto',
    'Petra', 'Rainer', 'Reinhard', 'Reinhold', 'Renate', 'Rolf', 'Rosemarie', 'Rudolf',
    'Ruprecht', 'Sieglinde', 'Siegfried', 'Sigrid', 'Sybille', 'Theodor', 'Thorsten', 'Traudel',
    'Ulf', 'Ulrike', 'Uwe', 'Volker', 'Waltraud', 'Wilfried', 'Wolfgang', 'Wolfram',
  ],
  familyNames: [
    'Achterberg', 'Ahlgrimm', 'Albersmeier', 'Aldenhoven', 'Altmeier', 'Amsel', 'Angermann', 'Arnsberg',
    'Aschenbrenner', 'Auerbach', 'Bachleitner', 'Baumgarten', 'Bechtold', 'Beckenbach', 'Behrendt', 'Bergmiller',
    'Biedenkopf', 'Bierbaum', 'Birkenfeld', 'Blankenburg', 'Bleibtreu', 'Bloemer', 'Bodenstein', 'Boehnke',
    'Bohlmann', 'Borchert', 'Brandhoff', 'Braunschweig', 'Breitenbach', 'Brinkmann', 'Brockhaus', 'Bruckmeier',
    'Buchholz', 'Burkhardt', 'Dahlmann', 'Damaschke', 'Dannenberg', 'Degenhardt', 'Deichmann', 'Dettmering',
    'Diekmann', 'Dohrmann', 'Draeger', 'Dreyer', 'Drossel', 'Duerkop', 'Ebersbach', 'Eichhorn',
    'Eisenreich', 'Elsholz', 'Engelhardt', 'Erlbacher', 'Eschenbach', 'Faerber', 'Fassbender', 'Feldkamp',
    'Fichtner', 'Finkbeiner', 'Fleischhauer', 'Flottmann', 'Forstner', 'Frankenberg', 'Freudenthal', 'Friedrichs',
    'Fuhrmann', 'Gaertner', 'Gerstenberg', 'Giesbrecht', 'Glockner', 'Goedeke', 'Gollwitzer', 'Grabowsky',
    'Grasshoff', 'Griesbach', 'Grohmann', 'Grunewald', 'Habermann', 'Hachmeister', 'Hagedorn', 'Hallerbach',
    'Hammerschmidt', 'Hasenkamp', 'Haussmann', 'Heckmann', 'Heidenreich', 'Heinemann', 'Hellwig', 'Herzberg',
    'Hesselbach', 'Hillebrand', 'Hinterberger', 'Hochstetter', 'Hoffmeister', 'Hollenbach', 'Holzapfel', 'Huebschmann',
    'Hufnagel', 'Imhoff', 'Isenberg', 'Jaeckel', 'Jungbluth', 'Kaltenbach', 'Kammerer', 'Kastenholz',
    'Kellermann', 'Kerschbaum', 'Kiesewetter', 'Kirchhoff', 'Kleinschmidt', 'Klingenberg', 'Knappstein', 'Kohlhaas',
    'Kortenbach', 'Krahnert', 'Kranepuhl', 'Kreuzer', 'Kronenberg', 'Kuhlmann', 'Kunkel', 'Lachmann',
    'Lammersdorf', 'Landgraf', 'Langbein', 'Lauterbach', 'Lehmkuhl', 'Leinweber', 'Lichtenstein', 'Lindemann',
    'Loewenstein', 'Luedtke', 'Mangold', 'Marquardt', 'Mehringer', 'Meiselbach', 'Mertensberg', 'Metzenbach',
    'Mielenhausen', 'Moerchen', 'Mohnhaupt', 'Muehlbauer', 'Nachtigall', 'Neuenfeldt', 'Niederhaus', 'Nussbaumer',
    'Oberlaender', 'Odenthal', 'Oestreicher', 'Ohlendorf', 'Osterhage', 'Pflueger', 'Quaschning', 'Rautenberg',
    'Rehbein', 'Reissmueller', 'Rittershaus', 'Rosenkranz', 'Sandkuehler', 'Schallenberg', 'Schierhorn', 'Wiegandt',
  ],
};
