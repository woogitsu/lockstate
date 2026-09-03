import type { ActorNamePool } from '../name-pool';

/**
 * English naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * See `./index.ts` for what these pools are, what "language" means here and
 * why every entry is ASCII. Family names lean on the place-derived English
 * stock, which is deep enough to fill 160 entries without reaching for a
 * surname that identifies one living person.
 */
export const ACTOR_NAME_POOL_EN: ActorNamePool = {
  id: 'authored.en.v1',
  givenNames: [
    'Abigail', 'Adrian', 'Aidan', 'Alan', 'Albert', 'Alfred', 'Alice', 'Amber',
    'Andrew', 'Angela', 'Anthony', 'Arthur', 'Ashley', 'Audrey', 'Barbara', 'Beatrice',
    'Bernard', 'Bethany', 'Blake', 'Bradley', 'Brandon', 'Brenda', 'Brian', 'Bridget',
    'Callum', 'Carol', 'Cecil', 'Charlotte', 'Chester', 'Clara', 'Clifford', 'Colin',
    'Connor', 'Cora', 'Craig', 'Curtis', 'Daisy', 'Damian', 'Darren', 'Deborah',
    'Dennis', 'Derek', 'Dominic', 'Doreen', 'Dorothy', 'Duncan', 'Edith', 'Edmund',
    'Edwin', 'Eileen', 'Elaine', 'Eleanor', 'Elliot', 'Emmett', 'Ernest', 'Esther',
    'Evelyn', 'Fenton', 'Fiona', 'Frances', 'Franklin', 'Gareth', 'Gavin', 'Geoffrey',
    'Georgina', 'Gerald', 'Gillian', 'Glenda', 'Godfrey', 'Gordon', 'Grace', 'Graham',
    'Gregory', 'Hannah', 'Harold', 'Harriet', 'Hazel', 'Heather', 'Hilda', 'Horace',
    'Howard', 'Imogen', 'Jasper', 'Jocelyn', 'Jonathan', 'Joyce', 'Judith', 'Julian',
    'Keith', 'Kenneth', 'Lawrence', 'Leonard', 'Lesley', 'Lilian', 'Lloyd', 'Lorna',
    'Lydia', 'Malcolm', 'Marcus', 'Marjorie', 'Maureen', 'Maxwell', 'Melvin', 'Meredith',
    'Millicent', 'Miranda', 'Mortimer', 'Nadine', 'Neville', 'Nigel', 'Norman', 'Olive',
    'Ophelia', 'Oswald', 'Percival', 'Phoebe', 'Quentin', 'Rosalind', 'Rupert', 'Sybil',
  ],
  familyNames: [
    'Ashcombe', 'Ashworth', 'Atkinson', 'Bagshaw', 'Bainbridge', 'Barlowe', 'Barrington', 'Beckford',
    'Bellamy', 'Benfield', 'Birchall', 'Blackwood', 'Blakeney', 'Bollingham', 'Bramley', 'Brantwood',
    'Bredon', 'Brightwell', 'Bromley', 'Burnaby', 'Cadwell', 'Calverley', 'Camberwell', 'Cardew',
    'Carlisle', 'Cartwright', 'Chadwick', 'Chalmers', 'Chesterton', 'Clayborne', 'Cleaverly', 'Coldwell',
    'Copperthwaite', 'Cranleigh', 'Cresswell', 'Crompton', 'Culverhouse', 'Danbury', 'Darlington', 'Denholm',
    'Dewhurst', 'Dinsdale', 'Doverton', 'Drayton', 'Dunstable', 'Eastbrook', 'Edgeworth', 'Ellingham',
    'Elmsley', 'Everly', 'Fairbrother', 'Fallowfield', 'Farnsworth', 'Featherstone', 'Fenwick', 'Fetherby',
    'Fitzwarren', 'Follett', 'Framley', 'Frostwick', 'Gainsford', 'Garforth', 'Gatesby', 'Glanville',
    'Goodliffe', 'Granger', 'Greenhalgh', 'Grimsby', 'Grindleford', 'Halstead', 'Hambledon', 'Harcourt',
    'Hardacre', 'Hargreaves', 'Harkness', 'Haverfield', 'Hawksworth', 'Heathcote', 'Hepworth', 'Hollingsworth',
    'Holmwood', 'Hopkirk', 'Horncastle', 'Ingleby', 'Inkersall', 'Ironside', 'Jephcott', 'Kelsall',
    'Kenworthy', 'Kirkbride', 'Knightwood', 'Ladbroke', 'Lambourne', 'Langtree', 'Larkfield', 'Latimer',
    'Leathwaite', 'Ledbury', 'Linthorpe', 'Lockesley', 'Loxbourne', 'Ludlow', 'Maidment', 'Mallinson',
    'Marchbank', 'Marlbeck', 'Mawdsley', 'Meltham', 'Merribeck', 'Micklethwaite', 'Millbank', 'Monkhouse',
    'Mortlake', 'Netherwood', 'Newbolt', 'Northcote', 'Oakeshott', 'Ockenden', 'Ollerton', 'Osgood',
    'Padgett', 'Pargeter', 'Peverell', 'Pickersgill', 'Ponsonby', 'Prendergast', 'Quarrington', 'Radcliffe',
    'Ravensworth', 'Redmarley', 'Rickerby', 'Rothwell', 'Rowntree', 'Ruddock', 'Sandholme', 'Satterthwaite',
    'Sedgwick', 'Shalcross', 'Sheldrake', 'Shorrock', 'Silverdale', 'Skelmore', 'Southgate', 'Standish',
    'Stapleford', 'Stonebridge', 'Swinderby', 'Tallantyre', 'Thirlwell', 'Thorncroft', 'Tillotson', 'Trelawney',
    'Underhill', 'Vardley', 'Wainwright', 'Wetherby', 'Whitcombe', 'Wollaston', 'Wyndham', 'Yardley',
  ],
};
