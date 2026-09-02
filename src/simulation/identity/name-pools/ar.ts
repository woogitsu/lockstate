import type { ActorNamePool } from '../name-pool';

/**
 * Arabic naming tradition, romanized. 120 given names, 160 family names,
 * ASCII only.
 *
 * **Romanization is not a loss here in the way it is in `./pl.ts`; it is a
 * choice among schemes, and this pool makes it once and states it.** Arabic
 * is not written in Latin script at all, so there is no correct ASCII
 * spelling being approximated -- there are several conventional ones, and
 * `Mahmud`/`Mahmoud`, `Khalid`/`Khaled` and `Zeinab`/`Zaynab` are all in
 * ordinary use. The scheme used throughout is the unmarked journalistic one:
 * no macrons, no dots, no apostrophes for `hamza` or `ayn`, and definite
 * articles kept attached where the name is normally written that way
 * (`Elkhouri`, `Elsayed`). One spelling per name, chosen for how a name is
 * most often written in Latin script rather than for how it transliterates.
 *
 * Family names span the Levant, Egypt and the Maghreb, and include Christian
 * Arab surnames (`Bishara`, `Boulos`, `Khoury`, `Sarkis`) alongside Muslim
 * ones, because a prison population drawn from one region contains both.
 */
export const ACTOR_NAME_POOL_AR: ActorNamePool = {
  id: 'authored.ar.v1',
  givenNames: [
    'Abbas', 'Abdallah', 'Abir', 'Adil', 'Afaf', 'Ahlam', 'Ahmad', 'Aisha',
    'Alaa', 'Amal', 'Amina', 'Amjad', 'Anwar', 'Arwa', 'Asad', 'Asma',
    'Atif', 'Ayman', 'Aziza', 'Badr', 'Bahira', 'Bakr', 'Bashir', 'Basma',
    'Bilal', 'Buthaina', 'Dalia', 'Dawud', 'Dhia', 'Dima', 'Duha', 'Fadi',
    'Fahd', 'Faiza', 'Farid', 'Fatin', 'Fawzi', 'Fidaa', 'Firas', 'Ghada',
    'Ghassan', 'Habib', 'Hadil', 'Hafsa', 'Haitham', 'Hala', 'Hamid', 'Hanan',
    'Hani', 'Hazem', 'Hiba', 'Hisham', 'Huda', 'Idris', 'Ihab', 'Imad',
    'Iman', 'Isam', 'Jalal', 'Jamila', 'Jawad', 'Kamal', 'Karima', 'Khalid',
    'Lamia', 'Latifa', 'Layla', 'Lubna', 'Maha', 'Mahmud', 'Maisa', 'Majid',
    'Manal', 'Marwan', 'Maysoon', 'Mazen', 'Muna', 'Munir', 'Mustafa', 'Nabil',
    'Nada', 'Nadim', 'Nahla', 'Naif', 'Najat', 'Nasir', 'Nawal', 'Nazih',
    'Nidal', 'Nizar', 'Nuha', 'Nur', 'Rabab', 'Rafiq', 'Raghda', 'Rania',
    'Rashid', 'Rawan', 'Riham', 'Riyad', 'Ruba', 'Sabah', 'Sadiq', 'Safaa',
    'Sahar', 'Said', 'Salma', 'Samia', 'Sawsan', 'Shadi', 'Sharif', 'Suad',
    'Suhaila', 'Tahani', 'Talal', 'Tarek', 'Wafa', 'Wisam', 'Zahra', 'Zeinab',
  ],
  familyNames: [
    'Abboud', 'Abdelaziz', 'Abdelkarim', 'Abdelnour', 'Abdelrahman', 'Aboudi', 'Abourahma', 'Abusaif',
    'Adham', 'Aflaq', 'Ajami', 'Akkawi', 'Alami', 'Ammar', 'Amrani', 'Antoun',
    'Arafa', 'Asfour', 'Ashour', 'Assaf', 'Atallah', 'Attar', 'Awad', 'Ayoub',
    'Azzam', 'Baaklini', 'Badawi', 'Badran', 'Bahri', 'Bakkar', 'Ballout', 'Barakat',
    'Bardawil', 'Basbous', 'Bashara', 'Batal', 'Bayoumi', 'Bazzi', 'Bechara', 'Beydoun',
    'Bishara', 'Bitar', 'Boulos', 'Bouraoui', 'Chahine', 'Chalhoub', 'Chammas', 'Charara',
    'Chehab', 'Cherif', 'Dabbagh', 'Daher', 'Dahmani', 'Dajani', 'Darwich', 'Dawoud',
    'Deeb', 'Dhaouadi', 'Diab', 'Doueiri', 'Eid', 'Elkhouri', 'Elsayed', 'Ezzeddine',
    'Fadel', 'Fakhoury', 'Farhat', 'Farran', 'Fattal', 'Fayad', 'Fenianos', 'Ferjani',
    'Ghanem', 'Gharib', 'Ghazal', 'Ghoneim', 'Habchi', 'Haddadin', 'Hadid', 'Hage',
    'Hajjar', 'Hakim', 'Halabi', 'Hallak', 'Hamdan', 'Hammoud', 'Hamzeh', 'Hanania',
    'Harb', 'Hasbani', 'Hattab', 'Hawa', 'Hayek', 'Hijazi', 'Hobeika', 'Homsi',
    'Hourani', 'Ibrahimi', 'Idlibi', 'Isber', 'Issa', 'Jabbour', 'Jaber', 'Jalloul',
    'Jamal', 'Jarrar', 'Jazzar', 'Jomaa', 'Jouni', 'Kabbani', 'Kaddoura', 'Kaissi',
    'Kanaan', 'Karam', 'Kassab', 'Kassem', 'Kayali', 'Khalifeh', 'Khatib', 'Khodr',
    'Khoury', 'Kurdi', 'Labaki', 'Lahoud', 'Maalouf', 'Maher', 'Makari', 'Malek',
    'Mansour', 'Marabi', 'Masri', 'Matar', 'Mawla', 'Mikhael', 'Mneimneh', 'Moukheiber',
    'Mrad', 'Msallem', 'Naaman', 'Nabhan', 'Nader', 'Naffaa', 'Najjar', 'Nakhle',
    'Nasseri', 'Nawfal', 'Obeid', 'Ojeil', 'Osseiran', 'Rahal', 'Rizk', 'Saab',
    'Sabbagh', 'Sader', 'Safi', 'Salloum', 'Samaha', 'Sarkis', 'Yazbek', 'Zeidan',
  ],
};
