/**
 * Punct de intrare ContaAPP — Web App și API handlers.
 */

/**
 * Servește aplicația web. Dacă URL-ul conține id_token (venit de la pagina de login),
 * îl verifică și trimite sesiunea direct paginii.
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
    var bootstrap = null;
    var idToken = e && e.parameter && e.parameter.id_token;
    if (idToken) {
        try {
            bootstrap = AuthService.loginWithIdToken(idToken);
        } catch (err) {
            bootstrap = { error: err.message };
        }
    }

    var template = HtmlService.createTemplateFromFile('Index');
    template.bootstrapJson = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    template.loginPageUrl = LOGIN_PAGE_URL;
    return template
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
 * Încheie sesiunea curentă.
 * @param {string} token - Token de sesiune
 */
function apiLogout(token) {
    AuthService.logout(token);
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @returns {{ email: string, displayName: string, authorized: boolean, operatorName: string, canAccessReports: boolean }}
 */
function apiGetCurrentUser(token) {
    AuthService.useSession(token);
    return AuthService.getCurrentUser();
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} tip
 * @returns {string[]}
 */
function apiGetCategoriesByTip(token, tip) {
    AuthService.useSession(token);
    AuthService.requireAuthorizedOperator();
    return CategoryService.getCategoriesByTip(tip);
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} tip
 * @param {string} name
 * @returns {{ success: boolean, name: string }}
 */
function apiAddCategory(token, tip, name) {
    AuthService.useSession(token);
    AuthService.requireAuthorizedOperator();
    return CategoryService.addCategory(tip, name);
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {Object} payload
 * @returns {{ success: boolean, id: number }}
 */
function apiAppendTransaction(token, payload) {
    AuthService.useSession(token);
    var result = TransactionService.appendTransaction(payload);
    BalanceService.invalidateCache();
    return result;
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @returns {{ cash: number, bank: number, cashFormatted: string, bankFormatted: string }}
 */
function apiGetBalances(token) {
    AuthService.useSession(token);
    return BalanceService.getBalances();
}

/**
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} fromIso - yyyy-MM-dd
 * @param {string} toIso - yyyy-MM-dd
 * @returns {Object}
 */
function apiGetReports(token, fromIso, toIso) {
    AuthService.useSession(token);
    return ReportService.getReports(fromIso, toIso);
}

/**
 * Meta-date rapoarte (categorii, min/max dată).
 * @param {string} token - Token de sesiune (din apiLogin)
 * @returns {Object}
 */
function apiGetReportMeta(token) {
    AuthService.useSession(token);
    return ReportService.getReportMeta();
}

/**
 * 4.1 Fișa lunii.
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportFisaLunii(token, fromIso, toIso) {
    AuthService.useSession(token);
    return ReportService.getFisaLunii(fromIso, toIso);
}

/**
 * 4.2 Analiză cheltuieli.
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} categoriesJson - JSON array de categorii ieșire
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportCheltuieli(token, categoriesJson, fromIso, toIso) {
    AuthService.useSession(token);
    var categories = JSON.parse(categoriesJson || '[]');
    return ReportService.getAnalizaCheltuieli(categories, fromIso, toIso);
}

/**
 * 4.3 Comparativ temporal.
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} fromA
 * @param {string} toA
 * @param {string} fromB
 * @param {string} toB
 * @param {string} categoriesJson - JSON { intrari: string[], iesiri: string[] }
 * @returns {Object}
 */
function apiGetReportComparativ(token, fromA, toA, fromB, toB, categoriesJson) {
    AuthService.useSession(token);
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
 * @param {string} token - Token de sesiune (din apiLogin)
 * @param {string} categoriesJson - JSON array de categorii
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {Object}
 */
function apiGetReportIstoricVenituri(token, categoriesJson, fromIso, toIso) {
    AuthService.useSession(token);
    var categories = JSON.parse(categoriesJson || '[]');
    return ReportService.getIstoricVenituri(categories, fromIso, toIso);
}

// --- Setup și teste (rulare din editor Apps Script) ---

/**
 * Permite rularea doar din editorul Apps Script de către utilizatorul care rulează scriptul.
 * Funcțiile globale pot fi apelate din browser prin google.script.run, deci setup-ul și
 * testele trebuie protejate. Setează și utilizatorul curent pentru verificările de autorizare.
 */
function beginEditorRun_() {
    var active = Session.getActiveUser().getEmail();
    var owner = Session.getEffectiveUser().getEmail();
    if (!active || active !== owner) {
        throw new Error('Funcție disponibilă doar din editorul Apps Script.');
    }
    AuthService.setCurrentEmail(active);
}

/**
 * Creează/inițializează foile și datele seed.
 */
function setupSheets() {
    beginEditorRun_();
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

    protectHeaders_(registru, nomenclator);

    Logger.log('setupSheets() complet. Completați coloana Email și Acces Rapoarte (Da/Nu) în Nomenclator_Setări.');
}

/**
 * Adaugă coloana Acces Rapoarte pe o foaie existentă (fără reset).
 * Rulează o singură dată după upgrade.
 */
function migrateNomenclatorReportsColumn() {
    beginEditorRun_();
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
function protectHeaders_(registru, nomenclator) {
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
    beginEditorRun_();
    var originalEmail = SheetService.getSpreadsheet()
        .getSheetByName(SHEET_NOMENCLATOR)
        .getRange(2, 4)
        .getValue();

    var testEmail = Session.getEffectiveUser().getEmail();
    AuthService.setCurrentEmail(testEmail);
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
    beginEditorRun_();
    Logger.log('Intrări: ' + JSON.stringify(CategoryService.getCategoriesByTip(TIP_INTRARE)));
    Logger.log('Ieșiri: ' + JSON.stringify(CategoryService.getCategoriesByTip(TIP_IESIRE)));
}

/**
 * Test: solduri.
 */
function testBalances() {
    beginEditorRun_();
    var balances = BalanceService.computeBalances();
    Logger.log('Solduri: ' + JSON.stringify(balances));
}

/**
 * Test: rapoarte interval luna curentă.
 */
function testReports() {
    beginEditorRun_();
    var meta = ReportService.getReportMeta();
    var reports = ReportService.getReports(meta.monthStartIso, meta.todayIso);
    Logger.log('Rapoarte legacy: ' + JSON.stringify(reports));
}

function testReportFisaLunii() {
    beginEditorRun_();
    var meta = ReportService.getReportMeta();
    Logger.log(JSON.stringify(ReportService.getFisaLunii(meta.monthStartIso, meta.todayIso)));
}

function testReportComparativ() {
    beginEditorRun_();
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
