import type { ActorNamePool } from '../name-pool';

/**
 * French naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * Romanized by dropping accents (`Adele`, `Genevieve`, `Remy`, `Segolene`),
 * which French does not itself sanction the way German sanctions `ae`/`oe`.
 * The forms stay readable, but they are not the spellings; see `./pl.ts` for
 * the same loss stated at its sharpest, and the ADR for the proposal that
 * would let a `v2` carry the accents.
 */
export const ACTOR_NAME_POOL_FR: ActorNamePool = {
  id: 'authored.fr.v1',
  givenNames: [
    'Adele', 'Adrien', 'Agathe', 'Alain', 'Albane', 'Alphonse', 'Amandine', 'Ambroise',
    'Anatole', 'Andre', 'Anouk', 'Ariane', 'Armand', 'Armelle', 'Arnaud', 'Aurelien',
    'Aurore', 'Baptiste', 'Bastien', 'Benedicte', 'Benoit', 'Bertrand', 'Blandine', 'Briac',
    'Camille', 'Capucine', 'Cedric', 'Celestin', 'Chantal', 'Charline', 'Clemence', 'Clothilde',
    'Colette', 'Corentin', 'Cyprien', 'Damien', 'Delphine', 'Didier', 'Dominique', 'Edouard',
    'Eliane', 'Elodie', 'Emmanuelle', 'Fabienne', 'Fabrice', 'Faustine', 'Firmin', 'Flavien',
    'Florentin', 'Francoise', 'Gaetan', 'Gaspard', 'Genevieve', 'Ghislaine', 'Gilles', 'Guillaume',
    'Gwenaelle', 'Honorine', 'Hortense', 'Hugues', 'Isaure', 'Jacinthe', 'Jocelyne', 'Josiane',
    'Julien', 'Laurent', 'Leontine', 'Lisandre', 'Loic', 'Lucien', 'Ludivine', 'Madeleine',
    'Maelys', 'Margaux', 'Marguerite', 'Marielle', 'Mathurin', 'Maurice', 'Maxence', 'Melisande',
    'Micheline', 'Mireille', 'Morgane', 'Nathalie', 'Nicaise', 'Noemie', 'Octave', 'Odile',
    'Olivier', 'Ondine', 'Pascaline', 'Perrine', 'Philomene', 'Pierrick', 'Prosper', 'Raoul',
    'Regine', 'Remy', 'Renaud', 'Roselyne', 'Sandrine', 'Segolene', 'Severine', 'Sidonie',
    'Solange', 'Sylvain', 'Sylvestre', 'Tancrede', 'Thibault', 'Thierry', 'Tristan', 'Valentin',
    'Valerie', 'Vianney', 'Victorine', 'Vincent', 'Violaine', 'Xavier', 'Yannick', 'Yolande',
  ],
  familyNames: [
    'Abadie', 'Aillaud', 'Allard', 'Amblard', 'Andrieux', 'Anselme', 'Arbogast', 'Arnoult',
    'Aubertin', 'Audouin', 'Auffret', 'Aussourd', 'Bachelier', 'Baillargeon', 'Barbereau', 'Bardin',
    'Barrandon', 'Bastide', 'Baudelot', 'Beauchesne', 'Beaufreton', 'Belloc', 'Bergeron', 'Bernadet',
    'Berthelot', 'Besnard', 'Bettencourt', 'Bienvenu', 'Billaudel', 'Blanchard', 'Bocquet', 'Boisseau',
    'Bonnefoy', 'Bordenave', 'Bouchard', 'Bougault', 'Bourdaloue', 'Bourgeois', 'Boutillier', 'Bregeon',
    'Bretonniere', 'Brissaud', 'Brunetiere', 'Cadiou', 'Cambon', 'Capdeville', 'Carbonnel', 'Cassagne',
    'Castellane', 'Cauchois', 'Cazenave', 'Chabrier', 'Chaigneau', 'Chamboredon', 'Chapoutier', 'Charpentier',
    'Chastenet', 'Chauveau', 'Chevallier', 'Clergeau', 'Coquelin', 'Cordonnier', 'Cornuault', 'Coudert',
    'Courtade', 'Cousinard', 'Crozatier', 'Dabadie', 'Daigremont', 'Dalibard', 'Damiron', 'Danglade',
    'Dartigues', 'Daubigny', 'Dauphin', 'Debroise', 'Dechaume', 'Delacourt', 'Delaunay', 'Delmotte',
    'Demarquette', 'Deniaud', 'Derennes', 'Desbordes', 'Descloitres', 'Desjardins', 'Desnoyers', 'Devereux',
    'Dieudonne', 'Doucet', 'Drouineau', 'Dubreuil', 'Ducasse', 'Dufresne', 'Dujardin', 'Dulaurier',
    'Dumesnil', 'Duplessis', 'Duquesne', 'Durandeau', 'Duvivier', 'Esclangon', 'Estienne', 'Fabregue',
    'Faucheux', 'Ferrandiz', 'Feuillade', 'Fillastre', 'Fleuriot', 'Fontenelle', 'Forestier', 'Fouquereau',
    'Fournillon', 'Fraisse', 'Gaboriau', 'Gachet', 'Gaillardet', 'Galtier', 'Garnerin', 'Gastinel',
    'Gauthier', 'Gavarret', 'Geoffroy', 'Gerbault', 'Gervaise', 'Gimonet', 'Girardot', 'Godefroy',
    'Gontier', 'Gourdon', 'Grandmaison', 'Grasset', 'Grenier', 'Guerineau', 'Guilbaud', 'Guillemot',
    'Haguenier', 'Halbout', 'Hamelin', 'Hauterive', 'Heurtebise', 'Hocquart', 'Hourdequin', 'Huchet',
    'Jaffrenou', 'Jourdain', 'Jouvenel', 'Labarthe', 'Lachaud', 'Lacombe', 'Ladoucette', 'Lafarge',
    'Laffitte', 'Lagarrigue', 'Lambelin', 'Lamoureux', 'Langlade', 'Lanoue', 'Lapointe', 'Larcheveque',
  ],
};
