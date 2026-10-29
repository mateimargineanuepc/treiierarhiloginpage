/**
 * Punct de intrare ContaAPP — Web App și API handlers.
 */

/**
 * Servește aplicația web.
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('ContaAPP — Contabilitate Primară')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include fișiere HTML parțiale.
 * @param {string} filename - Numele fișierului fără extensie
 * @returns {string}
 */
function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- API handlers (apelate din client via google.script.run) ---

/**
 * @returns {{ email: string, displayName: string, authorized: boolean, operatorName: string, canAccessReports: boolean }}
 */
function apiGetCurrentUser() {
    return AuthService.getCurrentUser();
}

/**
 * URL-ul web app-ului publicat (pentru reautentificare cu alt cont Google).
 * @returns {string}
 */
function apiGetAppUrl() {
    return ScriptApp.getService().getUrl();
}

/**
 * @param {string} tip
 * @returns {string[]}
 */
function apiGetCategoriesByTip(tip) {
    AuthService.requireAuthorizedOperator();
    return CategoryService.getCategoriesByTip(tip);
}

/**
 * @param {string} tip
 * @param {string} name
 * @returns {{ success: boolean, name: string }}
 */
function apiAddCategory(tip, name) {
    AuthService.requireAuthorizedOperator();
    return CategoryService.addCategory(tip, name);
}

/**
 * @param {Object} payload
 * @returns {{ success: boolean, id: number }}
 */
function apiAppendTransaction(payload) {
    var result = TransactionService.appendTransaction(payload);
    BalanceService.invalidateCache();
    return result;
}

/**
 * @returns {{ cash: number, bank: number, cashFormatted: string, bankFormatted: string }}
 */
function apiGetBalances() {
    return BalanceService.getBalances();
}

/**
 * @param {string} fromIso - yyyy-MM-dd
 * @param {string} toIso - yyyy-MM-dd
 * @returns {Object}
 */
function apiGetReports(fromIso, toIso) {
    return ReportService.getReports(fromIso, toIso);
}

/**
 * Meta-date rapoarte (categorii, min/max dată).
 * @returns {Object}
 */
function apiGetReportMeta() {
    return ReportService.getReportMeta();
}

/**
 * 4.1 Fișa lunii.
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportFisaLunii(fromIso, toIso) {
    return ReportService.getFisaLunii(fromIso, toIso);
}

/**
 * 4.2 Analiză cheltuieli.
 * @param {string} categoriesJson - JSON array de categorii ieșire
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportCheltuieli(categoriesJson, fromIso, toIso) {
    var categories = JSON.parse(categoriesJson || '[]');
    return ReportService.getAnalizaCheltuieli(categories, fromIso, toIso);
}

/**
 * 4.3 Comparativ temporal.
 * @param {string} fromA
 * @param {string} toA
 * @param {string} fromB
 * @param {string} toB
 * @param {string} categoriesJson - JSON { intrari: string[], iesiri: string[] }
 * @returns {Object}
 */
function apiGetReportComparativ(fromA, toA, fromB, toB, categoriesJson) {
    var payload = JSON.parse(categoriesJson || '{}');
    return ReportService.getComparativTemporal(
        fromA,
        toA,
        fromB,
        toB,
        payload.intrari || [],
        payload.iesiri || [],
        payload.includePeriodB === true
    );
}

/**
 * 4.4 Istoric venituri.
 * @param {string} categoriesJson - JSON array de categorii
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportIstoricVenituri(categoriesJson, fromIso, toIso) {
    var categories = JSON.parse(categoriesJson || '[]');
    return ReportService.getIstoricVenituri(categories, fromIso, toIso);
}

// --- Setup și teste (rulare din editor Apps Script) ---

/**
 * Creează/inițializează foile și datele seed.
 */
function setupSheets() {
    var ss = SheetService.getSpreadsheet();

    var registru = ss.getSheetByName(SHEET_REGISTRU);
    if (!registru) {
        var first = ss.getSheets()[0];
        first.setName(SHEET_REGISTRU);
        registru = first;
    }

    var nomenclator = ss.getSheetByName(SHEET_NOMENCLATOR);
    if (!nomenclator) {
        nomenclator = ss.insertSheet(SHEET_NOMENCLATOR);
    }

    registru.clear();
    nomenclator.clear();

    registru.getRange(1, 1, 1, REGISTRU_HEADERS.length).setValues([REGISTRU_HEADERS]);
    registru.getRange(1, 1, 1, REGISTRU_HEADERS.length).setFontWeight('bold');
    registru.setFrozenRows(1);

    nomenclator.getRange(1, 1, 1, NOMENCLATOR_HEADERS.length).setValues([NOMENCLATOR_HEADERS]);
    nomenclator.getRange(1, 1, 1, NOMENCLATOR_HEADERS.length).setFontWeight('bold');
    nomenclator.setFrozenRows(1);

    var maxSeed = Math.max(
        CATEGORII_INTRARI_SEED.length,
        CATEGORII_IESIRI_SEED.length,
        UTILIZATORI_SEED.length
    );
    var seedData = [];
    for (var i = 0; i < maxSeed; i++) {
        seedData.push([
            CATEGORII_INTRARI_SEED[i] || '',
            CATEGORII_IESIRI_SEED[i] || '',
            UTILIZATORI_SEED[i] || '',
            '',
            UTILIZATORI_SEED[i] ? 'Da' : '',
        ]);
    }
    nomenclator.getRange(2, 1, seedData.length, NOMENCLATOR_HEADERS.length).setValues(seedData);

    protectHeaders(registru, nomenclator);

    Logger.log('setupSheets() complet. Completați coloana Email și Acces Rapoarte (Da/Nu) în Nomenclator_Setări.');
}

/**
 * Adaugă coloana Acces Rapoarte pe o foaie existentă (fără reset).
 * Rulează o singură dată după upgrade.
 */
function migrateNomenclatorReportsColumn() {
    var sheet = SheetService.getSpreadsheet().getSheetByName(SHEET_NOMENCLATOR);
    if (!sheet) {
        throw new Error('Foaia Nomenclator_Setări lipsește.');
    }

    var header = String(sheet.getRange(1, NOMENCLATOR_COL_ACCES_RAPOARTE).getValue()).trim();
    if (!header) {
        sheet.getRange(1, NOMENCLATOR_COL_ACCES_RAPOARTE).setValue('Acces Rapoarte');
        sheet.getRange(1, NOMENCLATOR_COL_ACCES_RAPOARTE).setFontWeight('bold');
    }

    Logger.log(
        'Coloana Acces Rapoarte este gata. Setați Da pentru utilizatorii cu acces la rapoarte, Nu pentru restul.'
    );
}

/**
 * Protejează rândul de header pe ambele foi.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} registru
 * @param {GoogleAppsScript.Spreadsheet.Sheet} nomenclator
 */
function protectHeaders(registru, nomenclator) {
    var me = Session.getEffectiveUser().getEmail();

    [registru, nomenclator].forEach(function (sheet) {
        var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
        existing.forEach(function (p) {
            p.remove();
        });

        var protection = sheet.getRange(1, 1, 1, sheet.getLastColumn()).protect();
        protection.setDescription('Header protejat ContaAPP');
        protection.addEditor(me);
        if (protection.canDomainEdit()) {
            protection.setDomainEdit(false);
        }
    });
}

/**
 * Test: append tranzacție de test.
 */
function testAppendTransaction() {
    var originalEmail = SheetService.getSpreadsheet()
        .getSheetByName(SHEET_NOMENCLATOR)
        .getRange(2, 4)
        .getValue();

    var testEmail = Session.getEffectiveUser().getEmail();
    SheetService.getSpreadsheet()
        .getSheetByName(SHEET_NOMENCLATOR)
        .getRange(2, 4)
        .setValue(testEmail);

    try {
        var result = TransactionService.appendTransaction({
            dataTranzactie: Utilities.formatDate(new Date(), 'Europe/Bucharest', 'yyyy-MM-dd'),
            tip: TIP_INTRARE,
            sursa: SURSA_NUMERAR,
            categorie: CATEGORIE_PANGAR1,
            suma: '100.50',
            explicatie: 'Test automat',
        });
        Logger.log('testAppendTransaction OK: ' + JSON.stringify(result));
    } finally {
        SheetService.getSpreadsheet()
            .getSheetByName(SHEET_NOMENCLATOR)
            .getRange(2, 4)
            .setValue(originalEmail);
    }
}

/**
 * Test: categorii pe tip.
 */
function testCategories() {
    Logger.log('Intrări: ' + JSON.stringify(CategoryService.getCategoriesByTip(TIP_INTRARE)));
    Logger.log('Ieșiri: ' + JSON.stringify(CategoryService.getCategoriesByTip(TIP_IESIRE)));
}

/**
 * Test: solduri.
 */
function testBalances() {
    var balances = BalanceService.computeBalances();
    Logger.log('Solduri: ' + JSON.stringify(balances));
}

/**
 * Test: rapoarte interval luna curentă.
 */
function testReports() {
    var meta = ReportService.getReportMeta();
    var reports = ReportService.getReports(meta.monthStartIso, meta.todayIso);
    Logger.log('Rapoarte legacy: ' + JSON.stringify(reports));
}

function testReportFisaLunii() {
    var meta = ReportService.getReportMeta();
    Logger.log(JSON.stringify(ReportService.getFisaLunii(meta.monthStartIso, meta.todayIso)));
}

function testReportComparativ() {
    var meta = ReportService.getReportMeta();
    var now = new Date();
    var lastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    var lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
    var fromB = Utilities.formatDate(lastYear, 'Europe/Bucharest', 'yyyy-MM-dd');
    var toB = Utilities.formatDate(lastYearEnd, 'Europe/Bucharest', 'yyyy-MM-dd');
    var cats = {
        intrari: meta.categoriiIntrari.slice(0, 2),
        iesiri: meta.categoriiIesiri.slice(0, 2),
    };
    Logger.log(
        'dual: ' +
            JSON.stringify(
                ReportService.getComparativTemporal(
                    meta.monthStartIso,
                    meta.todayIso,
                    fromB,
                    toB,
                    cats.intrari,
                    cats.iesiri,
                    true
                )
            )
    );
    Logger.log(
        'single: ' +
            JSON.stringify(
                ReportService.getComparativTemporal(
                    meta.monthStartIso,
                    meta.todayIso,
                    '',
                    '',
                    cats.intrari,
                    cats.iesiri,
                    false
                )
            )
    );
}
