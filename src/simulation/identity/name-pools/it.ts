import type { ActorNamePool } from '../name-pool';

/**
 * Italian naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * The only pool here that is natively ASCII: Italian marks stress with a
 * grave or acute accent on a final vowel and almost no name in either list
 * ends in one, so nothing has been romanized away. Family names are drawn
 * across the peninsula rather than from one region -- `Bernasconi` and
 * `Galimberti` are Lombard, `Esposito` and `Gargiulo` Campanian,
 * `Barbagallo` and `Cuffaro` Sicilian.
 */
export const ACTOR_NAME_POOL_IT: ActorNamePool = {
  id: 'authored.it.v1',
  givenNames: [
    'Adalgisa', 'Adelmo', 'Agostino', 'Alessio', 'Alfredo', 'Amedeo', 'Annunziata', 'Ansaldo',
    'Arcangelo', 'Argia', 'Armida', 'Arnaldo', 'Assunta', 'Attilio', 'Aurelia', 'Baldassarre',
    'Bartolomeo', 'Benedetta', 'Beniamino', 'Bernardino', 'Bianca', 'Bonaventura', 'Brunella', 'Calogero',
    'Carmela', 'Cataldo', 'Celestina', 'Cesarina', 'Cirillo', 'Clelia', 'Concetta', 'Corrado',
    'Cosimo', 'Costantino', 'Crocifissa', 'Damiano', 'Delfina', 'Desideria', 'Domenica', 'Donatella',
    'Edoardo', 'Egidio', 'Elvira', 'Emanuela', 'Enrichetta', 'Ermanno', 'Ernestina', 'Ersilia',
    'Ettore', 'Eugenia', 'Fausto', 'Fedele', 'Ferdinando', 'Fiorella', 'Firmino', 'Flavia',
    'Fortunato', 'Franca', 'Fulvio', 'Gaetana', 'Gaspare', 'Gastone', 'Gennaro', 'Gerolamo',
    'Gilberto', 'Gioacchino', 'Giordano', 'Giuditta', 'Graziella', 'Gualtiero', 'Guerrino', 'Ignazia',
    'Ilario', 'Immacolata', 'Ippolito', 'Italo', 'Ivano', 'Lamberto', 'Leandro', 'Leopoldo',
    'Liberato', 'Lodovico', 'Loredana', 'Luciana', 'Ludovica', 'Manlio', 'Marcello', 'Mariangela',
    'Marisa', 'Massimiliano', 'Melania', 'Mercurio', 'Modestino', 'Nazzareno', 'Nicandro', 'Nicoletta',
    'Nunziata', 'Oreste', 'Orlando', 'Ornella', 'Osvaldo', 'Ottavio', 'Palmira', 'Pancrazio',
    'Pantaleo', 'Pasquale', 'Pellegrino', 'Peppino', 'Pierluigi', 'Primo', 'Quirino', 'Raffaella',
    'Renzo', 'Rosalia', 'Rosaria', 'Sabatino', 'Saverio', 'Silvana', 'Tommaso', 'Umberto',
  ],
  familyNames: [
    'Abbagnale', 'Acciaioli', 'Aglietti', 'Albanesi', 'Alfieri', 'Aliprandi', 'Altobelli', 'Amabile',
    'Ambrosini', 'Anastasi', 'Andreatta', 'Angiolini', 'Antonelli', 'Arcangeli', 'Argenti', 'Ariotti',
    'Arlotta', 'Artusi', 'Aureli', 'Avallone', 'Bagnasco', 'Balbiano', 'Baldassini', 'Ballarini',
    'Bandinelli', 'Baracchini', 'Barbagallo', 'Barbieri', 'Bardelli', 'Bargellini', 'Bartolucci', 'Basaglia',
    'Battaglini', 'Beccaria', 'Belfiore', 'Bellandi', 'Bellinzona', 'Beltrame', 'Benaglia', 'Benedetti',
    'Bergamaschi', 'Bernasconi', 'Bertoldi', 'Bettinelli', 'Bevilacqua', 'Bianchini', 'Biffi', 'Bighelli',
    'Bindi', 'Bisceglia', 'Bocchini', 'Boldrini', 'Bonaccorso', 'Bonanni', 'Bordonaro', 'Borrelli',
    'Boschetti', 'Bottai', 'Bracciali', 'Brambilla', 'Brandolini', 'Brizzolara', 'Broggi', 'Bruscoli',
    'Buccellato', 'Bufalini', 'Buonocore', 'Burlando', 'Busoni', 'Cacciapuoti', 'Cafarelli', 'Calabresi',
    'Calamandrei', 'Callegaro', 'Camaggio', 'Campoli', 'Canevari', 'Cantalupo', 'Capodanno', 'Cappellaro',
    'Caprioli', 'Carbonaro', 'Cardamone', 'Carnevali', 'Casagrande', 'Cassinelli', 'Castagnoli', 'Catalano',
    'Cattaneo', 'Cavallaro', 'Cecchini', 'Ceravolo', 'Cerulli', 'Cesaroni', 'Chiaramonte', 'Chiodini',
    'Ciampolini', 'Cimarosa', 'Cinquegrana', 'Civitelli', 'Colangelo', 'Colasanti', 'Colombini', 'Comencini',
    'Consolini', 'Conticelli', 'Coppolino', 'Corradini', 'Cortellesi', 'Cosentino', 'Costanzi', 'Cremaschi',
    'Crespi', 'Cucchiaroni', 'Cuffaro', 'Curcio', 'Dallapiccola', 'Damiani', 'Danesi', 'Dattilo',
    'Delmonte', 'Diotallevi', 'Dolcetti', 'Donadoni', 'Dragonetti', 'Durighello', 'Elmi', 'Esposito',
    'Fabbrini', 'Facchinetti', 'Falcieri', 'Fantozzi', 'Farinelli', 'Fasoli', 'Fedeli', 'Ferrigno',
    'Fioravanti', 'Fochesato', 'Fontanelli', 'Formisano', 'Franceschetti', 'Frascatore', 'Fusaro', 'Gabbrielli',
    'Galimberti', 'Gallinari', 'Gambardella', 'Garbarino', 'Gargiulo', 'Gasparotto', 'Gattinoni', 'Gavazzeni',
    'Gennarelli', 'Ghiglione', 'Giacobbe', 'Giangrande', 'Gilardoni', 'Giordanelli', 'Zampieri', 'Zucconi',
  ],
};
