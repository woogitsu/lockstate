import type { ActorNamePool } from '../name-pool';

/**
 * Spanish naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * Peninsular and Latin American stock together, which is one tradition for
 * naming purposes and two for most others -- `Bascunan`, `Grajales` and
 * `Oyarzun` are as ordinary in Chile as `Abascal` and `Balaguer` are in
 * Spain. Romanized by dropping accents and by folding `n-tilde` to `n`, so
 * `Ordonez` and `Bolanos` are not the spellings; see `./pl.ts`.
 *
 * Spanish practice gives a person two family names and this pool gives one,
 * because `ActorName` has one `familyName` field. That is a presentation
 * shape, not a data loss: nothing here would have to change if a projection
 * later composed two.
 */
export const ACTOR_NAME_POOL_ES: ActorNamePool = {
  id: 'authored.es.v1',
  givenNames: [
    'Adelina', 'Adolfo', 'Agustin', 'Alba', 'Alejandra', 'Alfonso', 'Alonso', 'Alvaro',
    'Amalia', 'Amparo', 'Anselmo', 'Araceli', 'Arturo', 'Ascension', 'Asuncion', 'Aurelio',
    'Baltasar', 'Beatriz', 'Belen', 'Benigno', 'Bernardo', 'Blanca', 'Bonifacio', 'Candelaria',
    'Carmelo', 'Casimiro', 'Catalina', 'Ceferino', 'Celestino', 'Cesar', 'Clemente', 'Concepcion',
    'Consuelo', 'Cristobal', 'Damaso', 'Dionisio', 'Dolores', 'Domingo', 'Elias', 'Eloisa',
    'Emiliano', 'Encarnacion', 'Enrique', 'Ernesto', 'Esperanza', 'Estanislao', 'Estrella', 'Eufemia',
    'Eulalia', 'Eusebio', 'Faustino', 'Federico', 'Felipa', 'Fermin', 'Fernanda', 'Fidel',
    'Florencio', 'Fructuoso', 'Gabino', 'Genoveva', 'Gerardo', 'Gervasio', 'Gonzalo', 'Gregoria',
    'Guadalupe', 'Guillermina', 'Herminia', 'Hilario', 'Horacio', 'Ildefonso', 'Inmaculada', 'Isidoro',
    'Jacinta', 'Jimena', 'Joaquina', 'Jovita', 'Leocadia', 'Leonor', 'Liborio', 'Lucrecia',
    'Ludivina', 'Macarena', 'Marcelino', 'Mariano', 'Maximiliano', 'Melchor', 'Mercedes', 'Milagros',
    'Modesto', 'Nemesio', 'Nicanor', 'Nieves', 'Norberto', 'Obdulia', 'Octavio', 'Ofelia',
    'Olegario', 'Onesimo', 'Pancracio', 'Pastora', 'Patrocinio', 'Perfecto', 'Pilar', 'Placido',
    'Porfirio', 'Prudencio', 'Purificacion', 'Ramiro', 'Remedios', 'Restituto', 'Rocio', 'Rogelio',
    'Rosario', 'Saturnino', 'Segismundo', 'Serafina', 'Severiano', 'Teodosia', 'Trinidad', 'Ubaldo',
  ],
  familyNames: [
    'Abascal', 'Acevedo', 'Aguilera', 'Alarcon', 'Albornoz', 'Alcantara', 'Aldecoa', 'Alfaro',
    'Almazan', 'Alvarado', 'Amezcua', 'Anguiano', 'Aparicio', 'Aramburu', 'Arbelaez', 'Arceo',
    'Arellano', 'Arguelles', 'Arizmendi', 'Armendariz', 'Arrieta', 'Arriola', 'Artigas', 'Astorga',
    'Avellaneda', 'Azcarate', 'Badillo', 'Balaguer', 'Ballesteros', 'Barahona', 'Barreiro', 'Bascunan',
    'Bejarano', 'Belmonte', 'Benavides', 'Berdugo', 'Berrocal', 'Betancourt', 'Bolanos', 'Bracamonte',
    'Bustamante', 'Caballero', 'Cabezas', 'Cadenas', 'Calatayud', 'Calderon', 'Camacho', 'Canseco',
    'Carbajal', 'Cardenas', 'Carranza', 'Carrizo', 'Casanueva', 'Castaneda', 'Castellanos', 'Cazares',
    'Cepeda', 'Cerezo', 'Chavarria', 'Cifuentes', 'Cisneros', 'Colmenares', 'Contreras', 'Cordero',
    'Coronado', 'Corominas', 'Corrales', 'Cuellar', 'Cuevas', 'Delgadillo', 'Devesa', 'Dominguez',
    'Echeverria', 'Elizalde', 'Encinas', 'Escalante', 'Escamilla', 'Escandon', 'Esparza', 'Espinar',
    'Esquivel', 'Estevez', 'Fajardo', 'Feijoo', 'Ferrer', 'Figueroa', 'Fonseca', 'Frias',
    'Fuentealba', 'Gallardo', 'Galvan', 'Gamboa', 'Garrido', 'Gaviria', 'Gil', 'Giraldo',
    'Godoy', 'Goicoechea', 'Grajales', 'Guajardo', 'Gurrola', 'Gutierrez', 'Guzman', 'Herrera',
    'Hidalgo', 'Hinojosa', 'Huerta', 'Ibarra', 'Iriarte', 'Izaguirre', 'Jaramillo', 'Jimenez',
    'Juarez', 'Labrador', 'Lagos', 'Landeros', 'Lastra', 'Leguizamon', 'Lezcano', 'Linares',
    'Lizarraga', 'Lombardo', 'Loyola', 'Lozano', 'Lucero', 'Madrigal', 'Maldonado', 'Manrique',
    'Marroquin', 'Matamoros', 'Medrano', 'Mejia', 'Melendez', 'Mendieta', 'Meneses', 'Merino',
    'Mesa', 'Milla', 'Miramontes', 'Mondragon', 'Monsalve', 'Montalban', 'Monteagudo', 'Morcillo',
    'Moreira', 'Mosquera', 'Munguia', 'Naranjo', 'Navarrete', 'Nogueira', 'Ocampo', 'Olivares',
    'Ordonez', 'Orozco', 'Ortuno', 'Osorio', 'Oyarzun', 'Palencia', 'Paniagua', 'Zamudio',
  ],
};
