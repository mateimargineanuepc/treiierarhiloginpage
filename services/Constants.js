/**
 * Constante globale ContaAPP.
 */
var SPREADSHEET_ID = '1g2P0SC-qGaBi8_yoWUZUfVfoSAhmkJUKp1Ay-FaeIzI';
// OAuth Client ID (tip Web application) din Google Cloud Console, pentru Google Sign-In.
var GOOGLE_CLIENT_ID = '';
var SESSION_TTL_SECONDS = 21600;
var SESSION_CACHE_PREFIX = 'sess_';

var SHEET_REGISTRU = 'Registru_Central';
var SHEET_NOMENCLATOR = 'Nomenclator_Setări';

var TIP_INTRARE = 'Intrare';
var TIP_IESIRE = 'Ieșire';

var SURSA_NUMERAR = 'Numerar';
var SURSA_BANCAR = 'Cont Bancar';

var TIPURI_VALIDE = [TIP_INTRARE, TIP_IESIRE];
var SURSE_VALIDE = [SURSA_NUMERAR, SURSA_BANCAR];

var CATEGORIE_AUTO = 'Întreținere Mașini & Benzină';
var CATEGORIE_PANGAR1 = 'Pangar 1';
var CATEGORIE_PANGAR2 = 'Cort / Pangar 2';

var ADD_CATEGORY_OPTION = '+ Adaugă categorie nouă';

var REGISTRU_HEADERS = [
    'ID',
    'Dată Înregistrare',
    'Dată Tranzacție',
    'Tip',
    'Sursă Bani',
    'Categorie',
    'Sumă',
    'Explicație',
    'Operat de',
];

var NOMENCLATOR_HEADERS = [
    'Categorii INTRĂRI',
    'Categorii IEȘIRI',
    'Utilizatori',
    'Email',
    'Acces Rapoarte',
];

var NOMENCLATOR_COL_UTILIZATOR = 3;
var NOMENCLATOR_COL_EMAIL = 4;
var NOMENCLATOR_COL_ACCES_RAPOARTE = 5;

var CATEGORII_INTRARI_SEED = [
    'Pangar 1',
    'Cort / Pangar 2',
    'Cutia Milei',
    'Pomelnice',
    'Donații',
];

var CATEGORII_IESIRI_SEED = [
    'Întreținere (Apă, Gaz, etc.)',
    'Cumpărături Administrative',
    'Întreținere Mașini & Benzină',
    'Salarii',
    'Alte Costuri',
];

var UTILIZATORI_SEED = ['Părintele Stareț', 'Părintele Dumi'];

var LUNI_RO = [
    'Ianuarie',
    'Februarie',
    'Martie',
    'Aprilie',
    'Mai',
    'Iunie',
    'Iulie',
    'August',
    'Septembrie',
    'Octombrie',
    'Noiembrie',
    'Decembrie',
];
