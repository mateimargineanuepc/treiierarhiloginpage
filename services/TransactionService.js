/**
 * Gestionare tranzacții în Registru_Central.
 */
var TransactionService = (function () {
    var AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

    /**
     * Generează următorul ID incrementat cu LockService.
     * @returns {number}
     */
    function getNextId() {
        var lock = LockService.getScriptLock();
        lock.waitLock(10000);

        try {
            var sheet = SheetService.getSheet(SHEET_REGISTRU);
            var lastRow = sheet.getLastRow();
            if (lastRow < 2) {
                return 1;
            }

            var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
            var maxId = 0;
            ids.forEach(function (row) {
                var id = Number(row[0]);
                if (!isNaN(id) && id > maxId) {
                    maxId = id;
                }
            });
            return maxId + 1;
        } finally {
            lock.releaseLock();
        }
    }

    /**
     * Validează payload-ul unei tranzacții.
     * @param {Object} payload - Datele tranzacției
     */
    function validatePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Date tranzacție invalide.');
        }

        if (TIPURI_VALIDE.indexOf(payload.tip) === -1) {
            throw new Error('Tip invalid. Alegeți Intrare sau Ieșire.');
        }
        if (SURSE_VALIDE.indexOf(payload.sursa) === -1) {
            throw new Error('Sursă invalidă. Alegeți Numerar sau Cont Bancar.');
        }

        var amountStr = String(payload.suma).trim();
        if (!AMOUNT_REGEX.test(amountStr)) {
            throw new Error('Sumă invalidă. Folosiți formatul 0.00 fără semne.');
        }
        var amount = parseFloat(amountStr);
        if (amount <= 0) {
            throw new Error('Suma trebuie să fie mai mare decât 0.');
        }

        var explanation = String(payload.explicatie || '').trim();
        if (!explanation) {
            throw new Error('Explicația este obligatorie.');
        }
        if (explanation.length > 200) {
            throw new Error('Explicația nu poate depăși 200 de caractere.');
        }

        var category = String(payload.categorie || '').trim();
        if (!category || category === ADD_CATEGORY_OPTION) {
            throw new Error('Selectați o categorie validă.');
        }
        if (!CategoryService.categoryExistsForTip(payload.tip, category)) {
            throw new Error('Categoria nu este validă pentru tipul selectat.');
        }

        var txDate = payload.dataTranzactie;
        if (!txDate) {
            throw new Error('Data tranzacției este obligatorie.');
        }

        if (explanation.toLowerCase().indexOf('corecție') !== -1) {
            Logger.log('Tranzacție de corecție înregistrată: ' + explanation);
        }
    }

    /**
     * Parsează data tranzacției din string ISO (yyyy-MM-dd).
     * @param {string} dateStr - Data în format ISO
     * @returns {Date}
     */
    function parseTransactionDate(dateStr) {
        var parts = String(dateStr).split('-');
        if (parts.length !== 3) {
            throw new Error('Format dată invalid.');
        }
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) - 1;
        var day = parseInt(parts[2], 10);
        var date = new Date(year, month, day);
        if (isNaN(date.getTime())) {
            throw new Error('Dată invalidă.');
        }
        return date;
    }

    /**
     * Adaugă o tranzacție în Registru_Central.
     * @param {Object} payload - { dataTranzactie, tip, sursa, categorie, suma, explicatie }
     * @returns {{ success: boolean, id: number }}
     */
    function appendTransaction(payload) {
        var operatorName = AuthService.requireAuthorizedOperator();
        validatePayload(payload);

        var id = getNextId();
        var now = new Date();
        var txDate = parseTransactionDate(payload.dataTranzactie);
        var amount = SheetService.roundAmount(parseFloat(String(payload.suma).trim()));

        var row = [
            id,
            now,
            txDate,
            payload.tip,
            payload.sursa,
            String(payload.categorie).trim(),
            amount,
            String(payload.explicatie).trim(),
            operatorName,
        ];

        var sheet = SheetService.getSheet(SHEET_REGISTRU);
        sheet.appendRow(row);

        return { success: true, id: id };
    }

    /**
     * Citește toate tranzacțiile ca obiecte.
     * @returns {Array<Object>}
     */
    function getAllTransactions() {
        var rows = SheetService.getDataRows(SHEET_REGISTRU);
        return rows
            .map(function (row) {
                return {
                    id: row[0],
                    dataInregistrare: row[1],
                    dataTranzactie: row[2],
                    tip: String(row[3]).trim(),
                    sursa: String(row[4]).trim(),
                    categorie: String(row[5]).trim(),
                    suma: Number(row[6]),
                    explicatie: String(row[7]).trim(),
                    operatDe: String(row[8]).trim(),
                };
            })
            .filter(function (tx) {
                return tx.id && !isNaN(tx.suma);
            });
    }

    return {
        getNextId: getNextId,
        appendTransaction: appendTransaction,
        getAllTransactions: getAllTransactions,
    };
})();
