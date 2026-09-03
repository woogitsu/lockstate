import type { ActorNamePool } from '../name-pool';

/**
 * Turkish naming tradition. 120 given names, 160 family names, ASCII only.
 *
 * Romanized by the mapping Turkish keyboards themselves fall back to:
 * dotless-i to `i`, `c-cedilla` to `c`, `g-breve` to `g`, `s-cedilla` to `s`,
 * and the two umlauts to `o` and `u`. So `Yildiz`, `Cetin`, `Bozdag`,
 * `Aktas`, `Ozturk`.
 *
 * **This is the one romanization here that loses a distinction rather than a
 * mark.** Turkish has two separate letters, dotted and dotless I, with
 * separate uppercase forms; folding both to ASCII `i` merges two letters into
 * one, which the German digraphs and the dropped French accents do not do.
 * `PLACEHOLDER_ACTOR_NAME_POOL` already shipped `Yilmaz` on exactly this
 * fold, so the precedent is the placeholder's, not this file's.
 */
export const ACTOR_NAME_POOL_TR: ActorNamePool = {
  id: 'authored.tr.v1',
  givenNames: [
    'Ahmet', 'Akin', 'Alev', 'Alparslan', 'Arzu', 'Asli', 'Aslan', 'Aybars',
    'Aydin', 'Aylin', 'Ayse', 'Aytac', 'Baris', 'Basak', 'Batuhan', 'Bedirhan',
    'Behice', 'Belgin', 'Berkant', 'Beyza', 'Bilge', 'Birol', 'Bugra', 'Burcu',
    'Burhan', 'Cahide', 'Canan', 'Cansu', 'Cemile', 'Cetin', 'Ceyda', 'Cihan',
    'Coskun', 'Damla', 'Demet', 'Dilek', 'Duygu', 'Ebru', 'Ece', 'Elif',
    'Emrah', 'Enes', 'Ercument', 'Erdal', 'Ergun', 'Erkan', 'Ertan', 'Esra',
    'Evren', 'Ezgi', 'Fadime', 'Ferhat', 'Feride', 'Fikret', 'Filiz', 'Funda',
    'Gamze', 'Gizem', 'Gokhan', 'Gonca', 'Gulay', 'Gulsen', 'Gurkan', 'Hakan',
    'Halil', 'Hamdi', 'Handan', 'Hicran', 'Hulya', 'Husnu', 'Ilhan', 'Ilkay',
    'Iremnur', 'Ismail', 'Kadir', 'Kamuran', 'Kenan', 'Kerem', 'Kivanc', 'Kubra',
    'Levent', 'Mehtap', 'Meltem', 'Merve', 'Mesut', 'Muazzez', 'Muharrem', 'Munevver',
    'Murat', 'Nalan', 'Nazli', 'Nebahat', 'Necmi', 'Nedret', 'Nergis', 'Nihat',
    'Nurten', 'Okan', 'Oktay', 'Onur', 'Orkun', 'Oykum', 'Ozan', 'Ozlem',
    'Pelin', 'Perihan', 'Rabia', 'Recep', 'Sadik', 'Safak', 'Sedef', 'Selami',
    'Semra', 'Serkan', 'Sevil', 'Tansu', 'Tolga', 'Tugba', 'Ufuk', 'Yildiz',
  ],
  familyNames: [
    'Acar', 'Acikgoz', 'Adiguzel', 'Agaoglu', 'Akalin', 'Akbulut', 'Akcay', 'Akdogan',
    'Akgunduz', 'Akkaya', 'Aksoy', 'Aktas', 'Albayrak', 'Alemdar', 'Alkan', 'Altinbas',
    'Altiparmak', 'Altundag', 'Arikan', 'Arslanoglu', 'Asilturk', 'Atalay', 'Ataman', 'Avcilar',
    'Aybek', 'Aydemir', 'Aygun', 'Ayhan', 'Aytekin', 'Bagci', 'Bahceli', 'Bakirci',
    'Balaban', 'Balci', 'Baltaci', 'Barutcu', 'Basaran', 'Baskaya', 'Bastug', 'Batur',
    'Bayindir', 'Bayraktar', 'Bekiroglu', 'Berber', 'Bicakci', 'Bilgin', 'Binici', 'Bozdag',
    'Bozkurt', 'Bulutlu', 'Buyukkaya', 'Cakmak', 'Calikoglu', 'Camdali', 'Candan', 'Canpolat',
    'Cavusoglu', 'Cebeci', 'Celebi', 'Celikkaya', 'Cetinkaya', 'Cevahir', 'Ciftci', 'Cinar',
    'Cingoz', 'Coban', 'Cokgezen', 'Comert', 'Corlu', 'Dagdeviren', 'Damar', 'Danisman',
    'Dedeoglu', 'Demirag', 'Demirci', 'Denizli', 'Dereli', 'Dikmen', 'Dilbaz', 'Dinckol',
    'Dogramaci', 'Dokumaci', 'Donmez', 'Duman', 'Dursunoglu', 'Duzgun', 'Ekinci', 'Elmastas',
    'Emiroglu', 'Erbil', 'Erdemli', 'Ergenc', 'Erkoc', 'Ersoylu', 'Ertugrul', 'Esenyel',
    'Evcimen', 'Fidanci', 'Gedikli', 'Gencer', 'Gokalp', 'Golbasi', 'Gonenc', 'Gorgulu',
    'Gozubuyuk', 'Gulbahar', 'Gulec', 'Gumusay', 'Gunaydin', 'Gunduzalp', 'Gursoy', 'Guvenc',
    'Hacioglu', 'Halici', 'Hamzaoglu', 'Hasgul', 'Hatipoglu', 'Ilgaz', 'Inanc', 'Ipekci',
    'Isikli', 'Kabakci', 'Kahveci', 'Kalaycioglu', 'Kandemir', 'Kaplanoglu', 'Karaaslan', 'Karabulut',
    'Karagoz', 'Karahan', 'Kavakci', 'Kayacan', 'Kazanci', 'Keskinoglu', 'Kilicdar', 'Kirkpinar',
    'Kocabas', 'Kolcuoglu', 'Korkmaz', 'Kucukoglu', 'Kurtulus', 'Kuzucu', 'Mengu', 'Mermerci',
    'Mutlu', 'Nalbantoglu', 'Nurlu', 'Ocakli', 'Odabasi', 'Oguzhan', 'Onaran', 'Ordulu',
    'Ozdemir', 'Ozgentas', 'Ozkaya', 'Ozturk', 'Pamukcu', 'Sarikaya', 'Yagcioglu', 'Zorlu',
  ],
};
