/**
 * Multi-Currency Exchange Rate Converter - Complete JS Implementation
 * Uses real API data to ensure correct display of default currency rows
 */

document.addEventListener('DOMContentLoaded', function() {
    // ======================
    // Configuration Data
    // ======================
    const CURRENCY_OPTIONS = [
        { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
        { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
        { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', flag: '🇱🇰' },
        { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', flag: '🇧🇩' },
        { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', flag: '🇵🇰' },
        { code: 'THB', name: 'Thai Baht', symbol: '฿', flag: '🇹🇭' },
        { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', flag: '🇳🇵' },
        { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', flag: '🇲🇲' },
        { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
        { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
        { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' }
    ];

    const DEFAULT_CURRENCIES = ['CNY', 'SGD', 'THB', 'PKR'];
    const MAX_ROWS = 10;

    // Free API sources (no API key required)
    const API_SOURCES = [
        {
            name: 'Frankfurter',
            url: 'https://api.frankfurter.app/latest?from=USD',
            parser: data => data.rates
        },
        {
            name: 'Tencent Finance Proxy',
            url: `https://api.allorigins.win/get?url=${encodeURIComponent(
                'http://finance.qq.com/fund/api/v1/fund/convert/query?from=USD&to=CNY'
            )}`,
            parser: data => {
                try {
                    const realData = JSON.parse(data.contents);
                    return { CNY: parseFloat(realData.data?.rate) || 7.2 };
                } catch {
                    return { CNY: 7.2 };
                }
            }
        }
    ];

    // ======================
    // State Management
    // ======================
    let exchangeRates = {};
    let lastUpdated = null;
    let isLoading = false;
    let currentApiSource = '';

    // ======================
    // DOM Elements
    // ======================
    let refreshBtn = document.getElementById('refresh-rates');
    let addRowBtn = document.getElementById('add-row');
    const conversionTable = document.querySelector('#conversion-table tbody');
    const rateStatus = document.getElementById('rate-status');
    const loadingRow = document.getElementById('loading-row');

    // ======================
    // Initialize App
    // ======================
    async function initApp() {
        showLoading(true);
        setupUI();
        
        try {
            // 1. Try to load cached data
            await loadCachedData();
            
            // 2. If cache is empty, set initial values
            if (Object.keys(exchangeRates).length === 0) {
                DEFAULT_CURRENCIES.forEach(code => {
                    exchangeRates[code] = getFallbackRate(code);
                });
                currentApiSource = 'Default values';
                lastUpdated = new Date();
            }
            
            // 3. Create default rows
            setupDefaultRows();
            
            // 4. Try to fetch latest data
            await fetchExchangeRates();
        } catch (error) {
            handleError(error);
        } finally {
            showLoading(false);
        }
    }

    // ======================
    // Core Functions
    // ======================

    /**
     * Fetch exchange rates from multiple API sources (with fallback)
     */
    async function fetchExchangeRates() {
        if (isLoading) return;
        isLoading = true;
        updateStatus("🔄 Fetching latest rates...", 'loading');
        refreshBtn.disabled = true;

        try {
            let rates = null;
            
            // Try API sources in order
            for (const api of API_SOURCES) {
                try {
                    rates = await fetchFromApi(api);
                    if (rates) {
                        currentApiSource = api.name;
                        break;
                    }
                } catch (e) {
                    console.warn(`${api.name} request failed:`, e.message);
                }
            }

            if (!rates) throw new Error("All API sources unavailable");
            
            // Merge new rates (preserve existing values)
            Object.keys(exchangeRates).forEach(code => {
                if (rates[code]) exchangeRates[code] = rates[code];
            });
            
            // Add newly fetched currencies
            Object.assign(exchangeRates, rates);
            
            lastUpdated = new Date();
            updateStatus("✅ Rates updated", 'success');
            showNotification(`Successfully fetched rates from ${currentApiSource}`);
            saveToCache();
            updateAllConversions();
        } catch (error) {
            handleError(error);
        } finally {
            isLoading = false;
            refreshBtn.disabled = false;
            refreshBtn.querySelector('.spinner').style.display = 'none';
            refreshBtn.textContent = "Refresh Rates";
        }
    }

    /**
     * Fetch data from a single API
     */
    async function fetchFromApi(api) {
        const response = await fetch(api.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return api.parser(await response.json());
    }

    /**
     * Get fallback rate for a currency (when API is unavailable)
     */
    function getFallbackRate(currencyCode) {
        const fallbackRates = {
            CNY: 7.2,    SGD: 1.35,   THB: 36.5,
            PKR: 278.5,  USD: 1,      EUR: 0.92,
            GBP: 0.79,   JPY: 151.2,  LKR: 322.5,
            BDT: 110.2, NPR: 133.4,  MMK: 2100
        };
        return fallbackRates[currencyCode] || 1;
    }

    // ======================
    // Table Management
    // ======================

    /**
     * Set up default currency rows
     */
    function setupDefaultRows() {
        const existingCurrencies = new Set(
            Array.from(document.querySelectorAll('.currency-select'))
                .map(select => select.value)
        );
        
        DEFAULT_CURRENCIES.forEach(code => {
            if (!existingCurrencies.has(code)) {
                addNewRow(code);
            }
        });
        
        if (conversionTable.querySelectorAll('.currency-row').length === 0) {
            addNewRow('CNY');
        }
    }

    /**
     * Add new currency row (fixed version)
     */
    function addNewRow(currencyCode = 'CNY') {
        try {
            // Check row limit
            const currentRows = document.querySelectorAll('.currency-row').length;
            if (currentRows >= MAX_ROWS) {
                showNotification(`Maximum ${MAX_ROWS} currencies allowed`, 'warning');
                return false;
            }

            // Validate currency code
            const validCodes = CURRENCY_OPTIONS.map(c => c.code);
            if (!validCodes.includes(currencyCode)) {
                currencyCode = 'CNY';
                console.warn(`Invalid currency code, using default: ${currencyCode}`);
            }

            // Create row element
            const row = document.createElement('tr');
            row.className = 'currency-row';
            row.innerHTML = `
                <td>
                    <select class="currency-select">
                        ${CURRENCY_OPTIONS.map(currency => `
                            <option value="${currency.code}" 
                                    ${currency.code === currencyCode ? 'selected' : ''}>
                                ${currency.flag} ${currency.code} - ${currency.name}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td><input type="number" min="0" step="0.01" placeholder="Enter amount" class="amount-input"></td>
                <td class="usd-value">0.00</td>
                <td class="rate-value"></td>
                <td class="actions">
                    <button class="delete-btn" title="Delete row">×</button>
                </td>
            `;

            // Add event listeners
            const select = row.querySelector('.currency-select');
            const input = row.querySelector('.amount-input');
            const deleteBtn = row.querySelector('.delete-btn');

            select.addEventListener('change', () => updateRow(row));
            input.addEventListener('input', () => updateRow(row));
            deleteBtn.addEventListener('click', () => {
                row.classList.add('fade-out');
                setTimeout(() => row.remove(), 300);
            });

            // Add to table
            if (!conversionTable) {
                throw new Error('Table body not found');
            }
            conversionTable.appendChild(row);

            // Initial calculation
            updateRow(row);
            
            // Auto-focus input
            setTimeout(() => input.focus(), 50);
            
            return true;
        } catch (error) {
            console.error('Failed to add currency row:', error);
            showNotification('Failed to add currency row', 'error');
            return false;
        }
    }

    /**
     * Update single row calculation
     */
    function updateRow(row) {
        const currencySelect = row.querySelector('.currency-select');
        const amountInput = row.querySelector('.amount-input');
        const usdCell = row.querySelector('.usd-value');
        const rateCell = row.querySelector('.rate-value');
        
        const currencyCode = currencySelect.value;
        const amount = parseFloat(amountInput.value) || 0;
        const rate = exchangeRates[currencyCode] || getFallbackRate(currencyCode);
        const currency = CURRENCY_OPTIONS.find(c => c.code === currencyCode);
        
        if (currency) {
            rateCell.innerHTML = `
                <div>1 USD = <strong>${currency.symbol}${rate.toFixed(4)}</strong></div>
                <small style="color:#666">1 ${currency.code} ≈ ${(1/rate).toFixed(6)} USD</small>
            `;
            usdCell.textContent = (amount / rate).toFixed(2);
        } else {
            rateCell.textContent = 'Currency not configured';
            usdCell.textContent = '-';
        }
    }

    /**
     * Update all rows
     */
    function updateAllConversions() {
        document.querySelectorAll('.currency-row').forEach(row => {
            updateRow(row);
        });
    }

    // ======================
    // Data Persistence
    // ======================
    function loadCachedData() {
        const cached = localStorage.getItem('currencyConverterData');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                exchangeRates = data.rates || {};
                lastUpdated = new Date(data.lastUpdated);
                currentApiSource = data.source || 'Cache';
                return true;
            } catch (e) {
                console.error("Cache parse failed", e);
            }
        }
        return false;
    }

    function saveToCache() {
        const data = {
            rates: exchangeRates,
            lastUpdated: lastUpdated.toISOString(),
            source: currentApiSource,
            version: '2.1'
        };
        localStorage.setItem('currencyConverterData', JSON.stringify(data));
    }

    // ======================
    // UI Management
    // ======================
    function setupUI() {
        // Initialize API source badge
        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'api-source-badge';
        rateStatus.appendChild(document.createElement('br'));
        rateStatus.appendChild(sourceBadge);
        
        // Initialize refresh button spinner
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.style.display = 'none';
        refreshBtn.prepend(spinner);
        
        // Fix event listeners
        bindEvents();
    }

    function bindEvents() {
        // Clone and replace button to prevent duplicate listeners
        const newAddBtn = addRowBtn.cloneNode(true);
        addRowBtn.parentNode.replaceChild(newAddBtn, addRowBtn);
        addRowBtn = newAddBtn;

        // Add fresh event listener
        addRowBtn.addEventListener('click', function() {
            if (!addNewRow()) {
                console.log('Add row operation failed');
            }
        });

        // Refresh button
        refreshBtn.addEventListener('click', handleRefresh);
    }

    function showLoading(show) {
        if (loadingRow) loadingRow.style.display = show ? '' : 'none';
    }

    function updateStatus(message, type) {
        rateStatus.innerHTML = message;
        
        const badge = rateStatus.querySelector('.api-source-badge');
        if (badge) {
            badge.textContent = currentApiSource ? `Source: ${currentApiSource}` : '';
            badge.className = `api-source-badge ${type}`;
        }
        
        if (lastUpdated) {
            rateStatus.innerHTML += `<br><small>Updated: ${lastUpdated.toLocaleString()}</small>`;
        }
    }

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    // ======================
    // Event Handlers
    // ======================
    async function handleRefresh() {
        refreshBtn.textContent = "Refreshing...";
        await fetchExchangeRates();
    }

    function handleError(error) {
        console.error("Application error:", error);
        updateStatus("⚠️ Using cached data", 'cache');
        showNotification(`Rate update failed: ${error.message}`, 'error');
    }

    // ======================
    // Launch App
    // ======================
    initApp();

    // Double check default rows
    setTimeout(() => {
        if (conversionTable.querySelectorAll('.currency-row').length === 0) {
            DEFAULT_CURRENCIES.forEach(code => addNewRow(code));
        }
    }, 1000);
});
