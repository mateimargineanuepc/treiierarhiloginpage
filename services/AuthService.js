/**
 * Autentificare și mapare utilizator prin email Google.
 */
var AuthService = (function () {
    // Emailul utilizatorului pentru execuția curentă (setat din sesiune).
    var currentEmail = '';

    /**
     * Verifică un ID token Google și returnează emailul verificat.
     * @param {string} idToken
     * @returns {string}
     */
    function verifyIdToken(idToken) {
        if (!GOOGLE_CLIENT_ID) {
            throw new Error('GOOGLE_CLIENT_ID nu este configurat în Constants.js.');
        }
        if (!idToken || typeof idToken !== 'string') {
            throw new Error('Credențial Google lipsă.');
        }

        var response = UrlFetchApp.fetch(
            'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
            { muteHttpExceptions: true }
        );
        if (response.getResponseCode() !== 200) {
            throw new Error('Autentificare Google invalidă.');
        }

        var info = JSON.parse(response.getContentText());
        var issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
        if (info.aud !== GOOGLE_CLIENT_ID || !issuerOk || String(info.email_verified) !== 'true' || !info.email) {
            throw new Error('Autentificare Google invalidă.');
        }

        return String(info.email).toLowerCase();
    }

    /**
     * Creează o sesiune server-side (cache) pentru un email verificat.
     * @param {string} email
     * @returns {string} token de sesiune
     */
    function createSession(email) {
        var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
        CacheService.getScriptCache().put(SESSION_CACHE_PREFIX + token, email, SESSION_TTL_SECONDS);
        return token;
    }

    /**
     * Stabilește utilizatorul execuției curente din token-ul de sesiune.
     * @param {string} token
     */
    function useSession(token) {
        var email = token ? CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + token) : null;
        if (!email) {
            throw new Error('SESIUNE_EXPIRATA');
        }
        currentEmail = email;
    }

    /**
     * Setează direct emailul curent (doar pentru teste rulate din editor).
     * @param {string} email
     */
    function setCurrentEmail(email) {
        currentEmail = String(email || '').toLowerCase();
    }

    /**
     * Marchează un ID token ca folosit; aruncă dacă a mai fost folosit.
     * @param {string} idToken
     */
    function consumeIdTokenOnce(idToken) {
        var digest = Utilities.base64EncodeWebSafe(
            Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)
        );
        var key = USED_TOKEN_CACHE_PREFIX + digest;
        var lock = LockService.getScriptLock();
        lock.waitLock(10000);
        try {
            var cache = CacheService.getScriptCache();
            if (cache.get(key)) {
                throw new Error('Linkul de autentificare a fost deja folosit. Autentificați-vă din nou.');
            }
            cache.put(key, '1', SESSION_TTL_SECONDS);
        } finally {
            lock.releaseLock();
        }
    }

    /**
     * Login cu ID token Google (de unică folosință).
     * @param {string} idToken
     * @returns {{ token: string, user: Object }}
     */
    function loginWithIdToken(idToken) {
        var email = verifyIdToken(idToken);
        consumeIdTokenOnce(idToken);
        var token = createSession(email);
        currentEmail = email;
        return { token: token, user: getCurrentUser() };
    }

    /**
     * Șterge sesiunea.
     * @param {string} token
     */
    function logout(token) {
        if (token) {
            CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + token);
        }
        currentEmail = '';
    }

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
        var email = currentEmail;

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
        loginWithIdToken: loginWithIdToken,
        logout: logout,
        useSession: useSession,
        setCurrentEmail: setCurrentEmail,
        parseReportsAccess: parseReportsAccess,
        getUsersByEmail: getUsersByEmail,
        getEmailMap: getEmailMap,
        getCurrentUser: getCurrentUser,
        requireAuthorizedOperator: requireAuthorizedOperator,
        requireReportAccess: requireReportAccess,
    };
})();
