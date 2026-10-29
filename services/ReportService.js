/**
 * Rapoarte filtrate pe interval calendaristic (Dată Tranzacție).
 */
var ReportService = (function () {
    var TZ = 'Europe/Bucharest';

    /**
     * Parsează string ISO yyyy-MM-dd.
     * @param {string} dateStr
     * @returns {Date}
     */
    function parseIsoDate(dateStr) {
        var parts = String(dateStr || '').split('-');
        if (parts.length !== 3) {
            throw new Error('Format dată invalid. Folosiți yyyy-MM-dd.');
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
     * Validează interval De la / Până la.
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {{ from: Date, to: Date }}
     */
    function validateDateRange(fromIso, toIso) {
        var from = parseIsoDate(fromIso);
        var to = parseIsoDate(toIso);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        if (from.getTime() > to.getTime()) {
            throw new Error('Data „De la” nu poate fi după „Până la”.');
        }
        return { from: from, to: to };
    }

    /**
     * Formatează dată pentru afișare.
     * @param {Date} date
     * @returns {string}
     */
    function formatDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
            return '';
        }
        return Utilities.formatDate(date, TZ, 'dd.MM.yyyy');
    }

    /**
     * Formatează dată ISO.
     * @param {Date} date
     * @returns {string}
     */
    function toIsoDate(date) {
        return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
    }

    /**
     * Filtrare tranzacții pe Dată Tranzacție în interval inclusiv.
     * @param {Array<Object>} transactions
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Array<Object>}
     */
    function filterByDateRange(transactions, fromIso, toIso) {
        var range = validateDateRange(fromIso, toIso);
        return transactions.filter(function (tx) {
            var d = new Date(tx.dataTranzactie);
            if (isNaN(d.getTime())) {
                return false;
            }
            d.setHours(12, 0, 0, 0);
            return d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
        });
    }

    /**
     * Suma pe tip.
     * @param {Array<Object>} transactions
     * @param {string} tip
     * @returns {number}
     */
    function sumByTip(transactions, tip) {
        var total = 0;
        transactions.forEach(function (tx) {
            if (tx.tip === tip) {
                total += tx.suma;
            }
        });
        return SheetService.roundAmount(total);
    }

    /**
     * Agregare pe categorie (total numeric).
     * @param {Array<Object>} transactions
     * @param {string} tip
     * @returns {Array<{ categorie: string, total: number, totalFormatted: string }>}
     */
    function aggregateByCategory(transactions, tip) {
        var map = {};
        transactions.forEach(function (tx) {
            if (tx.tip !== tip) {
                return;
            }
            var key = tx.categorie || '(fără categorie)';
            map[key] = (map[key] || 0) + tx.suma;
        });

        return Object.keys(map)
            .sort(function (a, b) {
                return a.localeCompare(b, 'ro');
            })
            .map(function (categorie) {
                var total = SheetService.roundAmount(map[categorie]);
                return {
                    categorie: categorie,
                    total: total,
                    totalFormatted: SheetService.formatAmount(total),
                };
            });
    }

    /**
     * Grupează tranzacțiile pe categorie cu detalii (raport legacy).
     * @param {Array<Object>} transactions
     * @param {string} tip
     * @returns {Array<Object>}
     */
    function buildCategoryBreakdown(transactions, tip) {
        var map = {};

        transactions.forEach(function (tx) {
            if (tx.tip !== tip) {
                return;
            }
            var key = tx.categorie || '(fără categorie)';
            if (!map[key]) {
                map[key] = { total: 0, items: [] };
            }
            map[key].total += tx.suma;
            map[key].items.push({
                date: formatDate(new Date(tx.dataTranzactie)),
                amount: SheetService.formatAmount(tx.suma),
                explanation: tx.explicatie,
                sursa: tx.sursa,
            });
        });

        return Object.keys(map)
            .sort(function (a, b) {
                return a.localeCompare(b, 'ro');
            })
            .map(function (categorie) {
                return {
                    categorie: categorie,
                    total: SheetService.formatAmount(map[categorie].total),
                    items: map[categorie].items,
                };
            });
    }

    /**
     * Ani din interval calendaristic.
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {number[]}
     */
    function getYearsInRange(fromIso, toIso) {
        var range = validateDateRange(fromIso, toIso);
        var years = [];
        for (var y = range.from.getFullYear(); y <= range.to.getFullYear(); y++) {
            years.push(y);
        }
        return years;
    }

    /**
     * Calculează diferență procentuală.
     * @param {number} a
     * @param {number} b
     * @returns {string}
     */
    function percentDiff(a, b) {
        if (a === 0) {
            return '—';
        }
        var pct = ((b - a) / a) * 100;
        var sign = pct >= 0 ? '+' : '';
        return sign + pct.toFixed(1) + '%';
    }

    /**
     * Meta-date pentru filtre rapoarte.
     * @returns {Object}
     */
    function getReportMeta() {
        AuthService.requireReportAccess();

        var transactions = TransactionService.getAllTransactions();
        var now = new Date();
        var todayIso = toIsoDate(now);
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        var minDate = todayIso;
        var maxDate = todayIso;

        transactions.forEach(function (tx) {
            var iso = toIsoDate(new Date(tx.dataTranzactie));
            if (iso < minDate) {
                minDate = iso;
            }
            if (iso > maxDate) {
                maxDate = iso;
            }
        });

        if (transactions.length === 0) {
            minDate = todayIso;
        }

        return {
            categoriiIntrari: CategoryService.getCategoriesByTip(TIP_INTRARE),
            categoriiIesiri: CategoryService.getCategoriesByTip(TIP_IESIRE),
            minDate: minDate,
            maxDate: maxDate,
            todayIso: todayIso,
            monthStartIso: toIsoDate(monthStart),
        };
    }

    /**
     * 4.1 Fișa lunii — intrări vs ieșiri pe categorii.
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Object}
     */
    function getFisaLunii(fromIso, toIso) {
        AuthService.requireReportAccess();
        validateDateRange(fromIso, toIso);

        var filtered = filterByDateRange(TransactionService.getAllTransactions(), fromIso, toIso);
        var totalIntrari = sumByTip(filtered, TIP_INTRARE);
        var totalIesiri = sumByTip(filtered, TIP_IESIRE);
        var excedent = SheetService.roundAmount(totalIntrari - totalIesiri);

        return {
            from: fromIso,
            to: toIso,
            fromLabel: formatDate(parseIsoDate(fromIso)),
            toLabel: formatDate(parseIsoDate(toIso)),
            intrari: aggregateByCategory(filtered, TIP_INTRARE),
            iesiri: aggregateByCategory(filtered, TIP_IESIRE),
            totalIntrari: totalIntrari,
            totalIesiri: totalIesiri,
            totalIntrariFormatted: SheetService.formatAmount(totalIntrari),
            totalIesiriFormatted: SheetService.formatAmount(totalIesiri),
            excedent: excedent,
            excedentFormatted: SheetService.formatAmount(Math.abs(excedent)),
            isExcedent: excedent >= 0,
            hasData: filtered.length > 0,
        };
    }

    /**
     * Cheie lună-an din dată tranzacție.
     * @param {Date|string} dateValue
     * @returns {string}
     */
    function getMonthKey(dateValue) {
        var d = new Date(dateValue);
        var month = d.getMonth() + 1;
        var monthStr = month < 10 ? '0' + month : String(month);
        return d.getFullYear() + '-' + monthStr;
    }

    /**
     * Etichetă lună pentru cheie yyyy-MM.
     * @param {string} key
     * @returns {string}
     */
    function formatMonthKeyLabel(key) {
        var parts = String(key).split('-');
        var year = parts[0];
        var monthIndex = parseInt(parts[1], 10) - 1;
        return LUNI_RO[monthIndex] + ' ' + year;
    }

    /**
     * Raport istoric lunar (intrări sau ieșiri) pe categorii selectate.
     * @param {string} tip
     * @param {string[]} categories
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Object}
     */
    function buildIstoricByMonth(tip, categories, fromIso, toIso) {
        validateDateRange(fromIso, toIso);

        var catList = validateCategorySelection(categories, tip);
        if (!catList.length) {
            var tipLabel = tip === TIP_INTRARE ? 'intrări' : 'ieșiri';
            throw new Error('Selectați cel puțin o categorie de ' + tipLabel + '.');
        }

        var catSet = {};
        catList.forEach(function (c) {
            catSet[c] = true;
        });

        var filtered = filterByDateRange(TransactionService.getAllTransactions(), fromIso, toIso);
        filtered = filtered.filter(function (tx) {
            return tx.tip === tip && catSet[tx.categorie];
        });

        var monthlyMap = {};
        filtered.forEach(function (tx) {
            var key = getMonthKey(tx.dataTranzactie);
            monthlyMap[key] = (monthlyMap[key] || 0) + tx.suma;
        });

        var sortedKeysAsc = Object.keys(monthlyMap).sort();
        var labels = [];
        var values = [];
        var monthlySummary = [];

        sortedKeysAsc.forEach(function (key) {
            var total = SheetService.roundAmount(monthlyMap[key]);
            labels.push(formatMonthKeyLabel(key));
            values.push(total);
            monthlySummary.unshift({
                key: key,
                label: formatMonthKeyLabel(key),
                total: total,
                totalFormatted: SheetService.formatAmount(total),
            });
        });

        var transactions = filtered
            .map(function (tx) {
                return {
                    monthKey: getMonthKey(tx.dataTranzactie),
                    categorie: tx.categorie,
                    date: formatDate(new Date(tx.dataTranzactie)),
                    dateSort: new Date(tx.dataTranzactie).getTime(),
                    amount: SheetService.formatAmount(tx.suma),
                    explanation: tx.explicatie,
                    operatDe: tx.operatDe,
                };
            })
            .sort(function (a, b) {
                return b.dateSort - a.dateSort;
            })
            .map(function (tx) {
                return {
                    monthKey: tx.monthKey,
                    categorie: tx.categorie,
                    date: tx.date,
                    amount: tx.amount,
                    explanation: tx.explanation,
                    operatDe: tx.operatDe,
                };
            });

        return {
            tip: tip,
            categories: catList,
            from: fromIso,
            to: toIso,
            chart: { labels: labels, values: values },
            monthlySummary: monthlySummary,
            transactions: transactions,
            hasData: filtered.length > 0,
        };
    }

    /**
     * 4.2 Istoric cheltuieli pe categorii selectate.
     * @param {string[]} categories
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Object}
     */
    function getAnalizaCheltuieli(categories, fromIso, toIso) {
        AuthService.requireReportAccess();
        return buildIstoricByMonth(TIP_IESIRE, categories, fromIso, toIso);
    }

    /**
     * 4.3 Comparativ temporal între două perioade, pe categorii selectate.
     * @param {string} fromA
     * @param {string} toA
     * @param {string} fromB
     * @param {string} toB
     * @param {string[]} intrariCategories
     * @param {string[]} iesiriCategories
     * @param {boolean} includePeriodB
     * @returns {Object}
     */
    function getComparativTemporal(fromA, toA, fromB, toB, intrariCategories, iesiriCategories, includePeriodB) {
        AuthService.requireReportAccess();
        validateDateRange(fromA, toA);

        var intrariList = validateCategorySelection(intrariCategories, TIP_INTRARE);
        var iesiriList = validateCategorySelection(iesiriCategories, TIP_IESIRE);

        if (!intrariList.length && !iesiriList.length) {
            throw new Error('Selectați cel puțin o categorie de intrări sau ieșiri.');
        }

        var txs = TransactionService.getAllTransactions();
        var periodA = filterByDateRange(txs, fromA, toA);

        var intrariMapA = categoryTotalsMap(periodA, TIP_INTRARE);
        var iesiriMapA = categoryTotalsMap(periodA, TIP_IESIRE);
        var categories = [];

        if (!includePeriodB) {
            intrariList.forEach(function (cat) {
                categories.push(buildCategorySingleRow(cat, TIP_INTRARE, intrariMapA[cat] || 0));
            });
            iesiriList.forEach(function (cat) {
                categories.push(buildCategorySingleRow(cat, TIP_IESIRE, iesiriMapA[cat] || 0));
            });

            var hasSingle = categories.some(function (row) {
                return row.periodA > 0;
            });

            return {
                mode: 'single',
                periodA: {
                    from: fromA,
                    to: toA,
                    fromLabel: formatDate(parseIsoDate(fromA)),
                    toLabel: formatDate(parseIsoDate(toA)),
                },
                periodB: null,
                categories: categories,
                hasData: hasSingle,
            };
        }

        validateDateRange(fromB, toB);
        var periodB = filterByDateRange(txs, fromB, toB);
        var intrariMapB = categoryTotalsMap(periodB, TIP_INTRARE);
        var iesiriMapB = categoryTotalsMap(periodB, TIP_IESIRE);

        intrariList.forEach(function (cat) {
            categories.push(buildCategoryCompareRow(cat, TIP_INTRARE, intrariMapA[cat] || 0, intrariMapB[cat] || 0));
        });

        iesiriList.forEach(function (cat) {
            categories.push(buildCategoryCompareRow(cat, TIP_IESIRE, iesiriMapA[cat] || 0, iesiriMapB[cat] || 0));
        });

        var hasDual = categories.some(function (row) {
            return row.periodA > 0 || row.periodB > 0;
        });

        return {
            mode: 'dual',
            periodA: {
                from: fromA,
                to: toA,
                fromLabel: formatDate(parseIsoDate(fromA)),
                toLabel: formatDate(parseIsoDate(toA)),
            },
            periodB: {
                from: fromB,
                to: toB,
                fromLabel: formatDate(parseIsoDate(fromB)),
                toLabel: formatDate(parseIsoDate(toB)),
            },
            categories: categories,
            hasData: hasDual,
        };
    }

    /**
     * Validează și deduplică categoriile selectate pentru un tip.
     * @param {string[]} categories
     * @param {string} tip
     * @returns {string[]}
     */
    function validateCategorySelection(categories, tip) {
        var catSet = {};
        (categories || []).forEach(function (c) {
            var trimmed = String(c).trim();
            if (trimmed && CategoryService.categoryExistsForTip(tip, trimmed)) {
                catSet[trimmed] = true;
            }
        });
        return Object.keys(catSet).sort(function (a, b) {
            return a.localeCompare(b, 'ro');
        });
    }

    /**
     * Map categorie → total numeric pentru un tip.
     * @param {Array<Object>} transactions
     * @param {string} tip
     * @returns {Object<string, number>}
     */
    function categoryTotalsMap(transactions, tip) {
        var map = {};
        aggregateByCategory(transactions, tip).forEach(function (row) {
            map[row.categorie] = row.total;
        });
        return map;
    }

    /**
     * Construiește rând comparativ pe o singură perioadă (categorii între ele).
     * @param {string} categorie
     * @param {string} tip
     * @param {number} valA
     * @returns {Object}
     */
    function buildCategorySingleRow(categorie, tip, valA) {
        var amountA = SheetService.roundAmount(valA);
        return {
            categorie: categorie,
            tip: tip,
            periodA: amountA,
            periodAFormatted: SheetService.formatAmount(amountA),
        };
    }

    /**
     * Construiește rând comparativ pentru o categorie (două perioade).
     * @param {string} categorie
     * @param {string} tip
     * @param {number} valA
     * @param {number} valB
     * @returns {Object}
     */
    function buildCategoryCompareRow(categorie, tip, valA, valB) {
        var amountA = SheetService.roundAmount(valA);
        var amountB = SheetService.roundAmount(valB);
        var diff = SheetService.roundAmount(amountB - amountA);
        var diffSign = diff >= 0 ? '+' : '-';

        return {
            categorie: categorie,
            tip: tip,
            periodA: amountA,
            periodB: amountB,
            periodAFormatted: SheetService.formatAmount(amountA),
            periodBFormatted: SheetService.formatAmount(amountB),
            diffValue: diffSign + SheetService.formatAmount(Math.abs(diff)),
            diffPercent: percentDiff(amountA, amountB),
        };
    }

    /**
     * 4.4 Istoric venituri pe categorii selectate (aceeași structură ca cheltuieli).
     * @param {string[]} categories
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Object}
     */
    function getIstoricVenituri(categories, fromIso, toIso) {
        AuthService.requireReportAccess();
        return buildIstoricByMonth(TIP_INTRARE, categories, fromIso, toIso);
    }

    /**
     * Raport detaliat legacy (tab 5).
     * @param {string} fromIso
     * @param {string} toIso
     * @returns {Object}
     */
    function getReports(fromIso, toIso) {
        AuthService.requireReportAccess();
        validateDateRange(fromIso, toIso);

        var filtered = filterByDateRange(TransactionService.getAllTransactions(), fromIso, toIso);

        var totalIntrari = 0;
        var totalIesiri = 0;
        var autoExpenses = [];
        var autoTotal = 0;
        var pangar1Total = 0;
        var pangar2Total = 0;

        filtered.forEach(function (tx) {
            if (tx.tip === TIP_INTRARE) {
                totalIntrari += tx.suma;
            } else if (tx.tip === TIP_IESIRE) {
                totalIesiri += tx.suma;
            }

            if (tx.tip === TIP_IESIRE && tx.categorie === CATEGORIE_AUTO) {
                autoTotal += tx.suma;
                autoExpenses.push({
                    date: formatDate(new Date(tx.dataTranzactie)),
                    amount: SheetService.formatAmount(tx.suma),
                    explanation: tx.explicatie,
                });
            }

            if (tx.tip === TIP_INTRARE && tx.categorie === CATEGORIE_PANGAR1) {
                pangar1Total += tx.suma;
            }
            if (tx.tip === TIP_INTRARE && tx.categorie === CATEGORIE_PANGAR2) {
                pangar2Total += tx.suma;
            }
        });

        return {
            from: fromIso,
            to: toIso,
            fromLabel: formatDate(parseIsoDate(fromIso)),
            toLabel: formatDate(parseIsoDate(toIso)),
            summary: {
                totalIntrari: SheetService.formatAmount(totalIntrari),
                totalIesiri: SheetService.formatAmount(totalIesiri),
            },
            intrariByCategory: buildCategoryBreakdown(filtered, TIP_INTRARE),
            iesiriByCategory: buildCategoryBreakdown(filtered, TIP_IESIRE),
            autoExpenses: {
                total: SheetService.formatAmount(autoTotal),
                items: autoExpenses,
            },
            pangarComparison: {
                pangar1Total: SheetService.formatAmount(pangar1Total),
                pangar2Total: SheetService.formatAmount(pangar2Total),
            },
            hasData: filtered.length > 0,
        };
    }

    return {
        getReportMeta: getReportMeta,
        getFisaLunii: getFisaLunii,
        getAnalizaCheltuieli: getAnalizaCheltuieli,
        getComparativTemporal: getComparativTemporal,
        getIstoricVenituri: getIstoricVenituri,
        getReports: getReports,
    };
})();
