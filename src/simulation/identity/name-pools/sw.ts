import type { ActorNamePool } from '../name-pool';

/**
 * Swahili naming tradition, East Africa. 120 given names, 160 family names,
 * ASCII only.
 *
 * **Chosen because its orthography is ASCII already, and that is a cost of
 * the ASCII rule rather than a happy accident.** The placeholder pool
 * `PLACEHOLDER_ACTOR_NAME_POOL` deliberately carried West African forms
 * (`Abara`, `Okafor`), and this pool does not replace them with West African
 * ones: Yoruba and Igbo write with subdotted vowels and Hausa with hooked
 * consonants, none of which ASCII can represent, so an ASCII Yoruba pool
 * would misspell every entry that carries one. Swahili is written in plain
 * Latin letters with no diacritics at all, so nothing here is romanized and
 * nothing is misspelled. The rule therefore *selected the language*, which is
 * the sharpest illustration in this directory of what
 * `docs/adr/0094-which-names-a-prison-draws-from.md` decision 3 is about.
 *
 * Given names overlap the Arabic pool (`Amina`, `Salma`, `Issa`) and that is
 * correct rather than a leak: coastal Swahili name stock is substantially
 * Arabic by way of Indian Ocean trade. Family names are drawn across
 * Tanzania, Kenya and Uganda -- Chagga, Kikuyu, Luo, Kamba, Sukuma and
 * Baganda forms together -- because no single one of those fills 160 entries
 * and a prison draws from a region, not from one community.
 */
export const ACTOR_NAME_POOL_SW: ActorNamePool = {
  id: 'authored.sw.v1',
  givenNames: [
    'Adila', 'Ahadi', 'Amani', 'Amina', 'Anisa', 'Arafa', 'Asha', 'Ashura',
    'Asumini', 'Athumani', 'Ayubu', 'Azizi', 'Bahati', 'Bakari', 'Baraka', 'Barke',
    'Bashiri', 'Bimkubwa', 'Busara', 'Chausiku', 'Chiku', 'Dalila', 'Daudi', 'Dhahabu',
    'Faraji', 'Fatuma', 'Fikirini', 'Furaha', 'Gharibu', 'Habiba', 'Hadija', 'Halima',
    'Hamadi', 'Hamisi', 'Hawa', 'Hidaya', 'Husna', 'Idi', 'Imani', 'Inaya',
    'Issa', 'Jabali', 'Jabari', 'Jaha', 'Jamila', 'Jokha', 'Juma', 'Jumaane',
    'Kaduma', 'Kamaria', 'Karimu', 'Kesi', 'Kibwana', 'Kijakazi', 'Kito', 'Kitwana',
    'Kondo', 'Kulwa', 'Lulu', 'Maalim', 'Maimuna', 'Majuto', 'Malaika', 'Mariamu',
    'Mashaka', 'Masika', 'Maulidi', 'Mosi', 'Msafiri', 'Mwajuma', 'Mwanaidi', 'Mwanajuma',
    'Mwinyi', 'Nadhiri', 'Nasra', 'Nassoro', 'Neema', 'Nuru', 'Nyota', 'Omari',
    'Pendo', 'Rajabu', 'Rehema', 'Riziki', 'Rukia', 'Saada', 'Safia', 'Saidi',
    'Salama', 'Salehe', 'Salma', 'Sauda', 'Selemani', 'Shabani', 'Shani', 'Sharifa',
    'Shukuru', 'Sifa', 'Sikudhani', 'Simba', 'Subira', 'Sudi', 'Suleimani', 'Tabu',
    'Tatu', 'Thabiti', 'Tumaini', 'Tunu', 'Upendo', 'Uzuri', 'Wema', 'Zahara',
    'Zainabu', 'Zaituni', 'Zawadi', 'Zena', 'Zuberi', 'Zuhura', 'Zulfa', 'Zuwena',
  ],
  familyNames: [
    'Abdalla', 'Achieng', 'Bulugu', 'Byaruhanga', 'Chande', 'Chelule', 'Cheruiyot', 'Chuma',
    'Gitau', 'Githinji', 'Kabwe', 'Kaggwa', 'Kagoma', 'Kalunde', 'Kamau', 'Karanja',
    'Kariuki', 'Kessy', 'Kigongo', 'Kileo', 'Kimani', 'Kimaro', 'Kimutai', 'Kinuthia',
    'Kioko', 'Kirui', 'Kiwanuka', 'Kyeyune', 'Ligate', 'Lule', 'Lyimo', 'Mabula',
    'Macharia', 'Mahenge', 'Maina', 'Marealle', 'Masanja', 'Mayunga', 'Mbugua', 'Mchome',
    'Mfinanga', 'Mgeni', 'Moshi', 'Mrema', 'Msemo', 'Msuya', 'Mudathir', 'Mueni',
    'Muhumuza', 'Mukasa', 'Muriithi', 'Musyoka', 'Mutahi', 'Mutua', 'Mwaipopo', 'Mwakalinga',
    'Mwakyembe', 'Mwangi', 'Mwanri', 'Mwansasu', 'Mwendwa', 'Nabirye', 'Namuli', 'Ndege',
    'Ngassa', 'Ngowi', 'Njau', 'Njoroge', 'Njuguna', 'Nkya', 'Nsereko', 'Nzioka',
    'Obonyo', 'Ochieng', 'Oduor', 'Odhiambo', 'Ogola', 'Ojwang', 'Okoth', 'Okumu',
    'Omondi', 'Onyango', 'Opiyo', 'Orwa', 'Otieno', 'Owino', 'Oyugi', 'Rotich',
    'Sanga', 'Shayo', 'Ssempala', 'Sserwadda', 'Swai', 'Temba', 'Tumusiime', 'Wachira',
    'Wanjala', 'Wasswa', 'Waweru', 'Bulemo', 'Chacha', 'Chami', 'Dausi', 'Fundi',
    'Gachanja', 'Gichuru', 'Hando', 'Ikonje', 'Ilomo', 'Isaya', 'Jengo', 'Kabaka',
    'Kachwamba', 'Kadege', 'Kafulila', 'Kaganda', 'Kahigi', 'Kaijage', 'Kalinga', 'Kamanda',
    'Kanyeki', 'Karume', 'Kasyoki', 'Katabaro', 'Kavishe', 'Kayanda', 'Kayombo', 'Kibuuka',
    'Kihiu', 'Kilonzo', 'Kinyua', 'Kipruto', 'Kisamo', 'Kitema', 'Kombo', 'Kondoro',
    'Kweka', 'Lukwaro', 'Lupembe', 'Maganga', 'Magesa', 'Makweta', 'Malando', 'Manyanga',
    'Marwa', 'Masenga', 'Mashala', 'Matata', 'Mbise', 'Mbogo', 'Mdachi', 'Meshack',
    'Mhando', 'Mkomwa', 'Mlelwa', 'Mnyanyi', 'Mollel', 'Mpoki', 'Msangi', 'Mwaseba',
  ],
};
