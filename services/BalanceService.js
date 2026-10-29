/**
 * Calcul solduri Cash și Cont Bancar.
 */
var BalanceService = (function () {
    var CACHE_KEY = 'conta_balances';
    var CACHE_TTL = 30;

    /**
     * Calculează soldurile din toate tranzacțiile.
     * @returns {{ cash: number, bank: number, cashFormatted: string, bankFormatted: string }}
     */
    function computeBalances() {
        var transactions = TransactionService.getAllTransactions();
        var cash = 0;
        var bank = 0;

        transactions.forEach(function (tx) {
            if (isNaN(tx.suma)) {
                Logger.log('Avertisment: sumă invalidă la ID ' + tx.id);
                return;
            }

            var delta = tx.tip === TIP_INTRARE ? tx.suma : -tx.suma;

            if (tx.sursa === SURSA_NUMERAR) {
                cash += delta;
            } else if (tx.sursa === SURSA_BANCAR) {
                bank += delta;
            }
        });

        cash = SheetService.roundAmount(cash);
        bank = SheetService.roundAmount(bank);

        return {
            cash: cash,
            bank: bank,
            cashFormatted: SheetService.formatAmount(cash),
            bankFormatted: SheetService.formatAmount(bank),
        };
    }

    /**
     * Returnează soldurile (cu cache 30s).
     * @returns {{ cash: number, bank: number, cashFormatted: string, bankFormatted: string }}
     */
    function getBalances() {
        AuthService.requireReportAccess();

        var cache = CacheService.getScriptCache();
        var cached = cache.get(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }

        var balances = computeBalances();
        cache.put(CACHE_KEY, JSON.stringify(balances), CACHE_TTL);
        return balances;
    }

    /**
     * Invalidează cache-ul soldurilor.
     */
    function invalidateCache() {
        CacheService.getScriptCache().remove(CACHE_KEY);
    }

    return {
        computeBalances: computeBalances,
        getBalances: getBalances,
        invalidateCache: invalidateCache,
    };
})();
