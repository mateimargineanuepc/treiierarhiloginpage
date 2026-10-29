/**
 * Autentificare și mapare utilizator prin email Google.
 */
var AuthService = (function () {
    /**
     * Interpretează valoarea din coloana Acces Rapoarte.
     * @param {*} value
     * @param {boolean} columnMissing - true dacă foaia nu are încă coloana E
     * @returns {boolean}
     */
    function parseReportsAccess(value, columnMissing) {
        if (columnMissing) {
            return true;
        }

        if (value === true) {
            return true;
        }
        if (value === false) {
            return false;
        }

        var normalized = String(value).trim().toLowerCase();
        if (!normalized) {
            return true;
        }

        if (
            normalized === 'da' ||
            normalized === 'yes' ||
            normalized === 'y' ||
            normalized === '1' ||
            normalized === 'true' ||
            normalized === 'x' ||
            normalized === '✓'
        ) {
            return true;
        }

        if (normalized === 'nu' || normalized === 'no' || normalized === 'n' || normalized === '0' || normalized === 'false') {
            return false;
        }

        return false;
    }

    /**
     * Citește utilizatorii din Nomenclator (email → profil).
     * @returns {Object<string, { operatorName: string, canAccessReports: boolean }>}
     */
    function getUsersByEmail() {
        var sheet = SheetService.getSheet(SHEET_NOMENCLATOR);
        var lastRow = sheet.getLastRow();
        var lastCol = sheet.getLastColumn();
        var hasReportsCol = lastCol >= NOMENCLATOR_COL_ACCES_RAPOARTE;
        var map = {};

        for (var i = 2; i <= lastRow; i++) {
            var name = String(sheet.getRange(i, NOMENCLATOR_COL_UTILIZATOR).getValue()).trim();
            var email = String(sheet.getRange(i, NOMENCLATOR_COL_EMAIL).getValue()).trim().toLowerCase();
            if (!name || !email) {
                continue;
            }

            var reportsRaw = hasReportsCol ? sheet.getRange(i, NOMENCLATOR_COL_ACCES_RAPOARTE).getValue() : '';
            map[email] = {
                operatorName: name,
                canAccessReports: parseReportsAccess(reportsRaw, !hasReportsCol),
            };
        }

        return map;
    }

    /**
     * Citește maparea email → nume din Nomenclator.
     * @returns {Object<string, string>}
     */
    function getEmailMap() {
        var users = getUsersByEmail();
        var map = {};

        Object.keys(users).forEach(function (email) {
            map[email] = users[email].operatorName;
        });

        return map;
    }

    /**
     * Returnează utilizatorul curent și statusul de autorizare.
     * @returns {{ email: string, displayName: string, authorized: boolean, operatorName: string, canAccessReports: boolean }}
     */
    function getCurrentUser() {
        var email = '';
        try {
            email = Session.getActiveUser().getEmail().toLowerCase();
        } catch (e) {
            email = '';
        }

        var users = getUsersByEmail();
        var profile = users[email];
        var operatorName = profile ? profile.operatorName : '';
        var authorized = Boolean(operatorName);
        var canAccessReports = authorized && profile.canAccessReports;

        return {
            email: email,
            displayName: operatorName || email,
            authorized: authorized,
            operatorName: operatorName,
            canAccessReports: canAccessReports,
        };
    }

    /**
     * Verifică autorizarea și returnează numele operatorului.
     * @returns {string}
     */
    function requireAuthorizedOperator() {
        var user = getCurrentUser();
        if (!user.authorized) {
            throw new Error('Acces neautorizat. Emailul nu este în lista de utilizatori.');
        }
        return user.operatorName;
    }

    /**
     * Verifică permisiunea de acces la rapoarte și solduri.
     * @returns {string}
     */
    function requireReportAccess() {
        var user = getCurrentUser();
        if (!user.authorized) {
            throw new Error('Acces neautorizat. Emailul nu este în lista de utilizatori.');
        }
        if (!user.canAccessReports) {
            throw new Error('Nu aveți permisiunea de a accesa rapoartele.');
        }
        return user.operatorName;
    }

    return {
        parseReportsAccess: parseReportsAccess,
        getUsersByEmail: getUsersByEmail,
        getEmailMap: getEmailMap,
        getCurrentUser: getCurrentUser,
        requireAuthorizedOperator: requireAuthorizedOperator,
        requireReportAccess: requireReportAccess,
    };
})();
