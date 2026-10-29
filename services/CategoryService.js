/**
 * Gestionare categorii din Nomenclator_Setări.
 */
var CategoryService = (function () {
    /**
     * Returnează categoriile pentru un tip de tranzacție.
     * @param {string} tip - 'Intrare' sau 'Ieșire'
     * @returns {string[]}
     */
    function getCategoriesByTip(tip) {
        var sheet = SheetService.getSheet(SHEET_NOMENCLATOR);
        var col = tip === TIP_INTRARE ? 1 : 2;
        var lastRow = sheet.getLastRow();
        var categories = [];

        for (var i = 2; i <= lastRow; i++) {
            var value = String(sheet.getRange(i, col).getValue()).trim();
            if (value) {
                categories.push(value);
            }
        }

        return categories;
    }

    /**
     * Verifică dacă o categorie există pentru tipul dat.
     * @param {string} tip - Tip tranzacție
     * @param {string} category - Numele categoriei
     * @returns {boolean}
     */
    function categoryExistsForTip(tip, category) {
        var categories = getCategoriesByTip(tip);
        var normalized = category.toLowerCase();
        return categories.some(function (c) {
            return c.toLowerCase() === normalized;
        });
    }

    /**
     * Adaugă o categorie nouă în nomenclator.
     * @param {string} tip - 'Intrare' sau 'Ieșire'
     * @param {string} name - Numele categoriei
     * @returns {{ success: boolean, name: string }}
     */
    function addCategory(tip, name) {
        if (TIPURI_VALIDE.indexOf(tip) === -1) {
            throw new Error('Tip invalid pentru categorie.');
        }

        var trimmed = String(name).trim();
        if (!trimmed) {
            throw new Error('Numele categoriei nu poate fi gol.');
        }
        if (trimmed.length > 50) {
            throw new Error('Numele categoriei nu poate depăși 50 de caractere.');
        }
        if (trimmed === ADD_CATEGORY_OPTION) {
            throw new Error('Nume categorie invalid.');
        }
        if (categoryExistsForTip(tip, trimmed)) {
            throw new Error('Categoria există deja.');
        }

        var sheet = SheetService.getSheet(SHEET_NOMENCLATOR);
        var col = tip === TIP_INTRARE ? 1 : 2;
        var lastRow = sheet.getLastRow();
        var targetRow = lastRow + 1;

        for (var i = 2; i <= lastRow; i++) {
            var cellValue = String(sheet.getRange(i, col).getValue()).trim();
            if (!cellValue) {
                targetRow = i;
                break;
            }
        }

        sheet.getRange(targetRow, col).setValue(trimmed);
        return { success: true, name: trimmed };
    }

    return {
        getCategoriesByTip: getCategoriesByTip,
        categoryExistsForTip: categoryExistsForTip,
        addCategory: addCategory,
    };
})();
