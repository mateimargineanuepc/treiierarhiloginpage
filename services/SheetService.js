/**
 * Acces centralizat la Google Spreadsheet.
 */
var SheetService = (function () {
    /**
     * Returnează spreadsheet-ul aplicației (după SPREADSHEET_ID).
     * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
     */
    function getSpreadsheet() {
        return SpreadsheetApp.openById(SPREADSHEET_ID);
    }

    /**
     * Returnează o foaie după nume.
     * @param {string} name - Numele foii
     * @returns {GoogleAppsScript.Spreadsheet.Sheet}
     */
    function getSheet(name) {
        var sheet = getSpreadsheet().getSheetByName(name);
        if (!sheet) {
            throw new Error('Foaia "' + name + '" nu există. Rulați setupSheets().');
        }
        return sheet;
    }

    /**
     * Returnează datele unei foi (fără header).
     * @param {string} name - Numele foii
     * @returns {Array<Array<*>>}
     */
    function getDataRows(name) {
        var sheet = getSheet(name);
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) {
            return [];
        }
        return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    }

    /**
     * Formatează o sumă la 2 zecimale.
     * @param {number} value - Valoarea numerică
     * @returns {number}
     */
    function roundAmount(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    /**
     * Formatează sumă pentru afișare (0.00).
     * @param {number} value - Valoarea numerică
     * @returns {string}
     */
    function formatAmount(value) {
        return roundAmount(value).toFixed(2);
    }

    return {
        getSpreadsheet: getSpreadsheet,
        getSheet: getSheet,
        getDataRows: getDataRows,
        roundAmount: roundAmount,
        formatAmount: formatAmount,
    };
})();
