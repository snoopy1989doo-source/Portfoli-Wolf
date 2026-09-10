/* ==========================================================================
   PIXEL STEWARD 2.0 - CORE JAVASCRIPT APPLICATION ENGINE
   Dual Currency (USD/THB) | Dime-Style Holdings | Dedicated Cash Buffer
   Realtime Firebase Sync | Live Market Data | Obsidian & AI Exporter
   ========================================================================== */

// --- 1. FIREBASE CONFIGURATION (Reusing Existing Project) ---
const firebaseConfig = {
  apiKey: "AIzaSyD-FLJd2vKaFX-2F8kzE87inrmGEH5pyzY",
  authDomain: "pixel-steward-db.firebaseapp.com",
  databaseURL: "https://pixel-steward-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pixel-steward-db",
  storageBucket: "pixel-steward-db.firebasestorage.app",
  messagingSenderId: "36576321084",
  appId: "1:36576321084:web:315c61237093e616e06d39"
};

// New accounts start empty; no personal sample positions are shipped.

// --- 3. MAIN APPLICATION CLASS ---
class PixelStewardApp {
  constructor() {
    this.portfolios = [];
    this.tradingData = {};
    this.quarterlySnapshots = [];
    this.dividends = [];
    this.achievements = [];
    this.achievementFilter = 'in_progress'; // 'in_progress', 'completed', 'all'
    this.exchangeRate = 32.59;
    this.displayCurrency = 'USD'; // 'USD' or 'THB'
    this.currentTab = 'dashboard';
    this.selectedPortfolioId = 'zero1';
    this.selectedQuarterYear = new Date().getFullYear();
    this.selectedDividendYear = new Date().getFullYear();
    this.dividendTableFilter = 'all'; // 'all' or 'year'
    this.finnhubApiKey = localStorage.getItem('pixel_finnhub_key') || '';
    this.isPrivacyMode = false;
    this.isSidebarCollapsed = false;
    this.allocationViewMode = 'donut'; // 'donut' or 'treemap'
    
    // Firebase & Sync State
    this.dbRef = null;
    this.isFirebaseOnline = false;
    this.charts = {};

    this.init();
  }


  // --- COLLAPSIBLE & SLIDE-OUT SIDEBAR ---
  loadSidebarPreference() {
    this.isSidebarCollapsed = localStorage.getItem('pixel_sidebar_collapsed') === '1';
    this.applySidebarState();
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    localStorage.setItem('pixel_sidebar_collapsed', this.isSidebarCollapsed ? '1' : '0');
    this.applySidebarState();
  }

  applySidebarState() {
    const icon1 = document.getElementById('sidebar-toggle-icon');
    const icon2 = document.getElementById('pin-sidebar-icon');
    if (this.isSidebarCollapsed) {
      document.body.classList.add('sidebar-collapsed');
      if (icon1) icon1.textContent = '▶';
      if (icon2) icon2.textContent = '▶';
    } else {
      document.body.classList.remove('sidebar-collapsed');
      if (icon1) icon1.textContent = '◀';
      if (icon2) icon2.textContent = '◀';
    }
  }

  // --- PRIVACY MODE ---
  loadPrivacyPreference() {
    this.isPrivacyMode = localStorage.getItem('pixel_privacy_mode') === '1';
    this.applyPrivacyMode();
  }

  togglePrivacyMode() {
    this.isPrivacyMode = !this.isPrivacyMode;
    localStorage.setItem('pixel_privacy_mode', this.isPrivacyMode ? '1' : '0');
    this.applyPrivacyMode();
  }

  applyPrivacyMode() {
    const icon = document.getElementById('privacy-icon');
    if (this.isPrivacyMode) {
      document.body.classList.add('privacy-mode');
      if (icon) icon.textContent = '🙈';
    } else {
      document.body.classList.remove('privacy-mode');
      if (icon) icon.textContent = '👁️';
    }
  }

  // --- GAMIFICATION & MILESTONE BADGES ---
  evaluateMilestones() {
    const grand = this.calculateGrandTotalStats();
    const zero1 = this.portfolios.find(p => p.id === 'zero1');
    const zero1Stats = zero1 ? this.calculatePortfolioStats(zero1) : null;
    const totalDivUSD = this.dividends.reduce((acc, d) => acc + (parseFloat(d.netUSD) || 0), 0);
    
    let totalCash = 0;
    this.portfolios.forEach(p => totalCash += (parseFloat(p.cashBufferUSD) || 0));

    const totalHoldingsCount = this.portfolios.reduce((c, p) => c + (p.holdings || []).length, 0);

    const badges = [
      {
        id: 'emergency_shield',
        icon: '🛡️',
        name: 'Emergency Shield',
        desc: 'มีเงินสำรองฉุกเฉิน (Zero 1) ครบ 100%',
        unlocked: zero1Stats ? zero1Stats.goalProgressPct >= 100 : false
      },
      {
        id: 'cash_buffer',
        icon: '💧',
        name: 'Cash Buffer Master',
        desc: 'มีเงินสดไว้ช้อนรวมกันมากกว่า $50',
        unlocked: totalCash >= 50
      },
      {
        id: 'dividend_starter',
        icon: '💰',
        name: 'Dividend Pioneer',
        desc: 'ได้รับเงินปันผลสะสมเข้าพอร์ตแล้ว',
        unlocked: totalDivUSD > 0
      },
      {
        id: 'trader_discipline',
        icon: '📈',
        name: 'Cashflow Disciplined',
        desc: 'บันทึกยอดเงินเทรด Forex/Option ครบถ้วน',
        unlocked: grand.totalTradingUSD > 0
      },
      {
        id: 'portfolio_diversity',
        icon: '🌐',
        name: 'World Class Diversified',
        desc: 'มีสินทรัพย์ในพอร์ตมากกว่า 5 รายการ',
        unlocked: totalHoldingsCount >= 5
      },
      {
        id: 'millionaire_path',
        icon: '👑',
        name: 'Freedom Seeker',
        desc: 'มูลค่าสินทรัพย์รวมแตะระดับ $1,000',
        unlocked: grand.grandTotalUSD >= 1000
      }
    ];

    return badges;
  }

  triggerCelebration() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  // --- FIREBASE INITIALIZATION & REALTIME SYNC ---

  setCloudStatus(status, text) {
    const indicator = document.getElementById('cloud-indicator');
    const textEl = document.getElementById('cloud-status-text');
    if (indicator && textEl) {
      indicator.querySelector('.status-dot').className = `status-dot ${status}`;
      textEl.textContent = text;
    }
  }

  renderStockLogoHTML(ticker, borderColor = '#10b981', size = 42) {
    if (!ticker) return '';
    const raw = ticker.toUpperCase().trim();
    const isThai = raw.endsWith('.BK') || ['ADVANC', 'SCB', 'PTT', 'DIF', 'WHART', 'CPALL', 'KBANK', 'BBL', 'KTB', 'BDMS', 'AOT', 'DELTA', 'GULF', 'TISCO', 'CPN', 'MINT', 'SCC', 'TRUE', 'OR', 'CRC', 'BEM', 'BTS', 'LH', 'AP', 'SIRI', 'MEGA', 'EA', 'HMPRO', 'WHA', 'OSP', 'IVL', 'TOP', 'GPSC', 'BGRIM', 'EGCO', 'RATCH', 'STA', 'STGT', 'TU', 'CBG', 'SAWAD', 'MTC', 'TIDLOR', 'JMT', 'CHG', 'BCH', 'VGI', 'MAJOR'].includes(raw.replace('.BK', ''));
    const clean = raw.replace('.BK', '');

    if (clean === 'BTC') {
      return `<div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:#151a24; overflow:hidden;"><img src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png" alt="BTC" style="width:100%; height:100%; object-fit:contain; padding:4px;" referrerpolicy="no-referrer"></div>`;
    }
    if (clean === 'ETH') {
      return `<div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:#151a24; overflow:hidden;"><img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" style="width:100%; height:100%; object-fit:contain; padding:4px;" referrerpolicy="no-referrer"></div>`;
    }
    if (clean === 'BNB') {
      return `<div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:#151a24; overflow:hidden;"><img src="https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" alt="BNB" style="width:100%; height:100%; object-fit:contain; padding:4px;" referrerpolicy="no-referrer"></div>`;
    }

    if (['SSO', 'กอช.', 'KEPT', 'CASH', 'THB', 'USD'].includes(clean)) {
      return `<div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:linear-gradient(135deg, #1e293b, #0f172a); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${size > 36 ? 11 : 9}px; color:#fff; font-family:var(--font-mono);">${clean.slice(0, 4)}</div>`;
    }

    // Thai Stock Brand Color Map
    const thaiColors = {
      'ADVANC': '#72bf44',
      'SCB': '#4e2a84',
      'PTT': '#0072ce',
      'DIF': '#00a2e8',
      'WHART': '#ea580c',
      'CPALL': '#008037',
      'KBANK': '#138f2d',
      'BBL': '#1e3a8a',
      'KTB': '#00a3e0',
      'BDMS': '#004b87',
      'AOT': '#0066b2',
      'DELTA': '#0088cc',
      'GULF': '#002f6c',
      'TISCO': '#0055a5',
      'CPN': '#c9920e',
      'MINT': '#00508a',
      'SCC': '#d32f2f',
      'TRUE': '#ed1c24',
      'OR': '#0072ce',
      'CRC': '#e60000',
      'BEM': '#003399',
      'BTS': '#006633',
      'LH': '#800020',
      'SIRI': '#d97706',
      'HMPRO': '#005ba8',
      'CBG': '#008542',
      'EA': '#16a34a',
      'OSP': '#d97706',
      'MEGA': '#0284c7',
      'TU': '#0284c7',
      'IVL': '#1e40af',
      'TOP': '#0369a1',
      'GPSC': '#15803d',
      'BGRIM': '#0369a1',
      'EGCO': '#0284c7',
      'RATCH': '#0369a1',
      'STA': '#15803d',
      'STGT': '#0284c7',
      'SAWAD': '#d97706',
      'MTC': '#00508a',
      'TIDLOR': '#0284c7',
      'JMT': '#00508a',
      'CHG': '#008037',
      'BCH': '#004b87',
      'VGI': '#006633',
      'MAJOR': '#d32f2f'
    };

    const brandBg = thaiColors[clean] || '#334155';

    if (isThai) {
      const primaryThaiUrl = `https://assets.parqet.com/logos/symbol/${clean}.BK?format=png`;
      const fallbackThaiUrl = `https://financialmodelingprep.com/image-stock/${clean}.BK.png`;
      const fallbackUSUrl = `https://assets.parqet.com/logos/symbol/${clean}?format=png`;

      return `
        <div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:#151a24; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;">
          <img src="${primaryThaiUrl}" 
               alt="${clean}" 
               loading="lazy" 
               referrerpolicy="no-referrer"
               onerror="
                 if (!this.dataset.step) {
                   this.dataset.step = '1';
                   this.src = '${fallbackThaiUrl}';
                 } else if (this.dataset.step === '1') {
                   this.dataset.step = '2';
                   this.src = '${fallbackUSUrl}';
                 } else {
                   this.style.display = 'none';
                   if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
                 }
               " 
               style="width:100%; height:100%; object-fit:contain; padding:4px; border-radius:50%;">
          <div style="display:none; width:100%; height:100%; background:linear-gradient(135deg, ${brandBg}, #0f172a); flex-direction:column; align-items:center; justify-content:center; border-radius:50%; box-shadow:inset 0 0 6px rgba(0,0,0,0.6);">
            <span style="font-size:${size > 36 ? '11px' : '9px'}; font-weight:800; color:#fff; font-family:var(--font-mono); line-height:1;">${clean.slice(0, 4)}</span>
            <span style="font-size:${size > 36 ? '8px' : '6.5px'}; color:rgba(255,255,255,0.85); font-weight:700; margin-top:1px;">SET 🇹🇭</span>
          </div>
        </div>
      `;
    }

    const primaryUrl = `https://assets.parqet.com/logos/symbol/${clean}?format=png`;
    const fallback1 = `https://financialmodelingprep.com/image-stock/${clean}.png`;
    const fallback2 = `https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/${clean}.png`;

    return `
      <div class="ticker-icon-circle" style="width:${size}px; height:${size}px; border-color:${borderColor}; background:#151a24; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;">
        <img src="${primaryUrl}" 
             alt="${clean}" 
             loading="lazy" 
             referrerpolicy="no-referrer"
             onerror="
               if (!this.dataset.step) {
                 this.dataset.step = '1';
                 this.src = '${fallback1}';
               } else if (this.dataset.step === '1') {
                 this.dataset.step = '2';
                 this.src = '${fallback2}';
               } else {
                 this.style.display = 'none';
                 if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
               }
             " 
             style="width:100%; height:100%; object-fit:contain; padding:4px; border-radius:50%;">
        <div style="display:none; width:100%; height:100%; background:linear-gradient(135deg, #1e293b, #0f172a); align-items:center; justify-content:center; font-weight:800; font-size:${size > 36 ? 11 : 9}px; color:#fff; font-family:var(--font-mono);">${clean.slice(0, 4)}</div>
      </div>
    `;
  }

  getTickerCompanyName(ticker) {
    if (!ticker) return '';
    const clean = ticker.replace('.BK', '').toUpperCase().trim();
    const map = {
      'NVDA': 'NVIDIA Corporation',
      'MSFT': 'Microsoft Corp.',
      'TSLA': 'Tesla Inc.',
      'AAPL': 'Apple Inc.',
      'AMZN': 'Amazon.com Inc.',
      'GOOGL': 'Alphabet Inc.',
      'GOOG': 'Alphabet Inc.',
      'META': 'Meta Platforms Inc.',
      'V': 'Visa Inc.',
      'WMT': 'Walmart Inc.',
      'CRWD': 'CrowdStrike Holdings',
      'SMR': 'NuScale Power Corp',
      'RKLB': 'Rocket Lab USA',
      'ABBV': 'AbbVie Inc.',
      'ETN': 'Eaton Corporation',
      'ABT': 'Abbott Laboratories',
      'TMO': 'Thermo Fisher Scientific',
      'NEE': 'NextEra Energy',
      'JPM': 'JPMorgan Chase & Co.',
      'PLTR': 'Palantir Technologies',
      'COST': 'Costco Wholesale Corp.',
      'LLY': 'Eli Lilly and Company',
      'UNH': 'UnitedHealth Group',
      'HD': 'Home Depot Inc.',
      'MCD': 'McDonald\'s Corp.',
      'TSM': 'Taiwan Semiconductor (TSMC)',
      'ASML': 'ASML Holding N.V.',
      'LMT': 'Lockheed Martin Corp.',
      'SPGI': 'S&P Global Inc.',
      'BWXT': 'BWX Technologies',
      'AMD': 'Advanced Micro Devices',
      'AVGO': 'Broadcom Inc.',
      'O': 'Realty Income Corp.',
      'PG': 'Procter & Gamble Co.',
      'CVX': 'Chevron Corporation',
      'KO': 'Coca-Cola Company',
      'PEP': 'PepsiCo Inc.',
      'ISRG': 'Intuitive Surgical',
      'NU': 'Nu Holdings Ltd.',
      'GEV': 'GE Vernova Inc.',
      'VOO': 'Vanguard S&P 500 ETF',
      'QQQ': 'Invesco QQQ Trust',
      'SPY': 'SPDR S&P 500 ETF',
      'DE': 'Deere & Company',
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'BNB': 'BNB Token',
      'ADVANC': 'Advanced Info Service',
      'SCB': 'SCB X Public Company',
      'PTT': 'PTT Public Company',
      'DIF': 'Digital Telecom Infra Fund',
      'WHART': 'WHA Premium Growth Freehold',
      'CPALL': 'CP ALL Public Company',
      'KBANK': 'Kasikornbank Public Company',
      'BBL': 'Bangkok Bank Public Company',
      'KTB': 'Krungthai Bank Public Company',
      'BDMS': 'Bangkok Dusit Medical Services',
      'AOT': 'Airports of Thailand Public Company',
      'DELTA': 'Delta Electronics (Thailand)',
      'GULF': 'Gulf Energy Development',
      'TISCO': 'TISCO Financial Group',
      'CPN': 'Central Pattana Public Company',
      'MINT': 'Minor International Public Company',
      'SCC': 'Siam Cement Public Company (SCG)',
      'TRUE': 'True Corporation Public Company',
      'OR': 'PTT Oil and Retail Business',
      'CRC': 'Central Retail Corporation',
      'BEM': 'Bangkok Expressway and Metro',
      'BTS': 'BTS Group Holdings',
      'LH': 'Land and Houses Public Company',
      'AP': 'AP (Thailand) Public Company',
      'SIRI': 'Sansiri Public Company',
      'HMPRO': 'Home Product Center',
      'CBG': 'Carabao Group Public Company',
      'EA': 'Energy Absolute Public Company',
      'OSP': 'Osotspa Public Company',
      'MEGA': 'Mega Lifesciences Public Company',
      'TU': 'Thai Union Group Public Company',
      'IVL': 'Indorama Ventures Public Company',
      'TOP': 'Thai Oil Public Company',
      'GPSC': 'Global Power Synergy',
      'BGRIM': 'B.Grimm Power Public Company',
      'EGCO': 'Electricity Generating Public Company',
      'RATCH': 'RATCH Group Public Company',
      'STA': 'Sri Trang Agro-Industry',
      'STGT': 'Sri Trang Gloves (Thailand)',
      'SAWAD': 'Srisawad Corporation',
      'MTC': 'Muangthai Capital Public Company',
      'TIDLOR': 'Ngern Tid Lor Public Company',
      'JMT': 'JMT Network Services',
      'CHG': 'Chularat Hospital Public Company',
      'BCH': 'Bangkok Chain Hospital',
      'VGI': 'VGI Public Company',
      'MAJOR': 'Major Cineplex Group',
      'KEPT': 'Kept by Krungsri (Cash)',
      'SSO': 'ประกันสังคม',
      'กอช.': 'กองทุนการออมแห่งชาติ'
    };
    return map[clean] || '';
  }

  updateHoldingTickerPreview(sym) {
    const logoBox = document.getElementById('holding-ticker-logo-preview');
    const nameInput = document.getElementById('holding-name');
    if (!logoBox) return;

    if (!sym) {
      logoBox.innerHTML = `<span id="holding-ticker-preview-text" style="font-size: 11px; font-weight: 800; color: var(--text-muted);">---</span>`;
      return;
    }

    logoBox.innerHTML = this.renderStockLogoHTML(sym, '#10b981', 42);

    if (nameInput && (!nameInput.value || nameInput.getAttribute('data-autofilled') === 'true')) {
      const compName = this.getTickerCompanyName(sym);
      if (compName) {
        nameInput.value = compName;
        nameInput.setAttribute('data-autofilled', 'true');
      }
    }
  }






  // --- CURRENCY & FORMATTING HELPERS ---
  usdToThb(usdVal) {
    return (usdVal || 0) * this.exchangeRate;
  }

  thbToUsd(thbVal) {
    return (thbVal || 0) / (this.exchangeRate || 32.59);
  }

  formatUSD(num) {
    return '$' + (num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatTHB(num) {
    return '฿' + (num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDual(usdVal, forcePrimary = null) {
    const primaryMode = forcePrimary || this.displayCurrency;
    const usdStr = this.formatUSD(usdVal);
    const thbStr = this.formatTHB(this.usdToThb(usdVal));
    if (primaryMode === 'USD') {
      return { main: usdStr, sub: `≈ ${thbStr}` };
    } else {
      return { main: thbStr, sub: `≈ ${usdStr}` };
    }
  }

  formatPercent(pct) {
    const p = pct || 0;
    const sign = p > 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
  }

  updateSidebarFxRate() {
    const fxEl = document.getElementById('sidebar-fx-rate');
    if (fxEl) fxEl.textContent = this.exchangeRate.toFixed(2);
    const inputFx = document.getElementById('input-fx-rate');
    if (inputFx) inputFx.value = this.exchangeRate.toFixed(2);
  }

  // --- CALCULATIONS: HOLDING, PORTFOLIO & TOTAL NET WORTH ---

  calculatePortfolioStats(port) {
    let holdingsTotalUSD = 0;
    let holdingsCostUSD = 0;
    let previousHoldingsUSD = 0;
    const holdings = port.holdings || [];

    holdings.forEach(h => {
      const stats = this.calculateHoldingStats(h);
      holdingsTotalUSD += stats.marketValueUSD;
      holdingsCostUSD += stats.totalCostUSD;
      previousHoldingsUSD += stats.change1d > -100 ? stats.marketValueUSD / (1 + stats.change1d / 100) : stats.marketValueUSD;
    });

    const cashBufferUSD = parseFloat(port.cashBufferUSD) || 0;
    const totalValueUSD = holdingsTotalUSD + cashBufferUSD;
    const totalCostUSD = holdingsCostUSD + cashBufferUSD;
    const totalPLUSD = totalValueUSD - totalCostUSD;
    const totalPLPct = holdingsCostUSD > 0 ? ((holdingsTotalUSD - holdingsCostUSD) / holdingsCostUSD) * 100 : 0;
    const previousTotalUSD = previousHoldingsUSD + cashBufferUSD;
    const avg1dChangePct = previousTotalUSD > 0 ? (totalValueUSD / previousTotalUSD - 1) * 100 : 0;
    const goalUSD = parseFloat(port.goalUSD) || 1;
    const goalProgressPct = Math.min(100, Math.max(0, (totalValueUSD / goalUSD) * 100));

    return {
      holdingsTotalUSD,
      holdingsCostUSD,
      cashBufferUSD,
      totalValueUSD,
      totalCostUSD,
      totalPLUSD,
      totalPLPct,
      avg1dChangePct,
      previousTotalUSD,
      goalUSD,
      goalProgressPct,
      assetCount: holdings.filter(h => (parseFloat(h.shares) || 0) > 0).length,
      totalAssetsListed: holdings.length
    };
  }

  getTradingLatestBalances() {
    let totalTradingUSD = 0;
    const balances = {};
    for (const [key, item] of Object.entries(this.tradingData || {})) {
      const list = item.monthlyBalances || [];
      const sorted = list.slice().sort((a,b)=>a.year*12+a.month-b.year*12-b.month);
      const latest = sorted.length > 0 ? sorted[sorted.length - 1].balanceUSD : 0;
      balances[key] = latest;
      totalTradingUSD += latest;
    }
    return { balances, totalTradingUSD };
  }

  calculateGrandTotalStats() {
    let totalStocksUSD = 0;
    let totalCashBufferUSD = 0;
    let totalStockCostUSD = 0;
    let previousPortfoliosUSD = 0;

    this.portfolios.forEach(p => {
      const stats = this.calculatePortfolioStats(p);
      totalStocksUSD += stats.holdingsTotalUSD;
      totalCashBufferUSD += stats.cashBufferUSD;
      totalStockCostUSD += stats.holdingsCostUSD;
      previousPortfoliosUSD += stats.previousTotalUSD;
    });

    const { totalTradingUSD } = this.getTradingLatestBalances();
    const grandTotalUSD = totalStocksUSD + totalCashBufferUSD + totalTradingUSD;
    const grandTotalTHB = this.usdToThb(grandTotalUSD);
    const previousGrandUSD = previousPortfoliosUSD + totalTradingUSD;
    const avg1dChangePct = previousGrandUSD > 0 ? (grandTotalUSD / previousGrandUSD - 1) * 100 : 0;
    const totalPLUSD = totalStocksUSD - totalStockCostUSD;
    const totalPLPct = totalStockCostUSD > 0 ? (totalPLUSD / totalStockCostUSD) * 100 : 0;
    const stockGainTHB = totalPLUSD * this.exchangeRate;
    // Historical base FX rate reference approx 32.50 THB/USD
    const fxGainTHB = 0; // Historical FX cost basis is not available.
    const totalNetReturnTHB = stockGainTHB;

    return {
      grandTotalUSD,
      grandTotalTHB,
      totalStocksUSD,
      totalCashBufferUSD,
      totalTradingUSD,
      totalStockCostUSD,
      avg1dChangePct,
      totalPLUSD,
      totalPLPct,
      stockGainTHB,
      fxGainTHB,
      totalNetReturnTHB
    };
  }

  // --- ULTRA-FAST & RESILIENT LIVE MARKET DATA ENGINE ---
  async fetchWithTimeout(url, timeoutMs = 4500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }


  async fetchLiveExchangeRate() {
    if (Date.now()-(this.lastFxAttempt||0)<3600000) return this.exchangeRate;
    this.lastFxAttempt=Date.now();
    const fxEndpoints = [
      async () => {
        const res = await this.fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 3000);
        if (res.ok) {
          const data = await res.json();
          return parseFloat(data?.rates?.THB);
        }
        return null;
      },
      async () => {
        const res = await this.fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', 3000);
        if (res.ok) {
          const data = await res.json();
          return parseFloat(data?.rates?.THB);
        }
        return null;
      },
      async () => {
        const res = await this.fetchWithTimeout('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 3000);
        if (res.ok) {
          const data = await res.json();
          return parseFloat(data?.usd?.thb);
        }
        return null;
      }
    ];

    for (const fetcher of fxEndpoints) {
      try {
        const rate = await fetcher();
        if (rate && rate > 20 && rate < 50) {
          this.exchangeRate = rate;
          this.updateSidebarFxRate();
          return rate;
        }
      } catch (e) {
        // Continue to next FX provider
      }
    }
    return this.exchangeRate;
  }

  async fetchCryptoPrices(cryptoTickers, priceUpdates) {
    if (!cryptoTickers || cryptoTickers.length === 0) return;

    // Binance quotes USDT pairs; USDT is treated as approximately USD.
    try {
      const symbolsParam = JSON.stringify(cryptoTickers.map(c => `${c}USDT`));
      const res = await this.fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`, 3000);
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items)) {
          items.forEach(item => {
            const sym = item.symbol.replace('USDT', '');
            const price = parseFloat(item.lastPrice);
            const changePct = parseFloat(item.priceChangePercent);
            if (price > 0) {
              priceUpdates[sym] = { priceUSD: price, change1dPct: changePct, source:'Binance USDT≈USD (rolling 24h)', marketAt:item.closeTime?new Date(item.closeTime).toISOString():null };
            }
          });
          return;
        }
      }
    } catch (e) {
      console.warn('Binance crypto fast fetch fallback:', e);
    }

    // 2. CoinGecko Fallback
    try {
      const geckoMap = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin', 'SOL': 'solana', 'XRP': 'ripple', 'DOGE':'dogecoin' };
      const ids = cryptoTickers.map(c => geckoMap[c]).filter(Boolean).join(',');
      if (ids) {
        const res = await this.fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`, 3500);
        if (res.ok) {
          const data = await res.json();
          for (const [sym, gid] of Object.entries(geckoMap)) {
            if (data[gid]) {
              const price = data[gid].usd;
              const change = data[gid].usd_24h_change || 0;
              if (price > 0) {
                priceUpdates[sym] = { priceUSD: price, change1dPct: change,source:'CoinGecko (24h)',marketAt:data[gid].last_updated_at?new Date(data[gid].last_updated_at*1000).toISOString():null };
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('CoinGecko crypto fetch fallback:', e);
    }
  }


  async fetchThaiStockPrices(thaiTickers, priceUpdates) {
    if (!thaiTickers || thaiTickers.length === 0) return;

    const rate = this.exchangeRate || 32.59;
    const chartPromises = thaiTickers.map(async (sym, idx) => {
      try {
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 25));
        const chartUrl1 = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
        const chartUrl2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
        const chartData = (await this.fetchViaFastProxies(chartUrl1)) || (await this.fetchViaFastProxies(chartUrl2));
        const meta = chartData?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
          const priceTHB = meta.regularMarketPrice;
          const prev = meta.previousClose || meta.chartPreviousClose || priceTHB;
          const changePct = prev > 0 ? ((priceTHB - prev) / prev) * 100 : 0;
          const priceUSD = priceTHB / rate;
          priceUpdates[sym] = { priceUSD, change1dPct: changePct,source:'Yahoo SET (ล่าช้า)',marketAt:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null };
        }
      } catch (e) {}
    });
    await Promise.allSettled(chartPromises);
  }


  // --- MODERN CYBERPUNK TOAST NOTIFICATION SYSTEM ---
  showToast({ icon = '⚡', title = '', message = '', badges = [], type = 'success', duration = 3800 }) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `cyber-toast ${type}`;

    let badgesHTML = '';
    if (Array.isArray(badges) && badges.length > 0) {
      badgesHTML = `
        <div class="cyber-toast-badges">
          ${badges.map(b => `<span class="cyber-toast-badge">${b}</span>`).join('')}
        </div>
      `;
    }

    toast.innerHTML = `
      <div class="cyber-toast-glow"></div>
      <div class="cyber-toast-icon">${icon}</div>
      <div class="cyber-toast-content">
        <div class="cyber-toast-title">${title}</div>
        ${message ? `<div class="cyber-toast-msg">${message}</div>` : ''}
        ${badgesHTML}
      </div>
      <button class="cyber-toast-close">&times;</button>
    `;

    container.appendChild(toast);

    const removeToast = () => {
      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    const timer = setTimeout(removeToast, duration);

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      removeToast();
    });
  }

  // --- INDUSTRIAL SPEC COUNTERS BAR (NO MARQUEE / HIGH PERFORMANCE) ---
  renderSpecCountersBar() {
    const track = document.getElementById('spec-gauges-track');
    if (!track) return;

    // Aggregate stats
    const totalPorts = this.portfolios.length;
    let totalStocksCount = 0;
    let totalCashUSD = 0;

    const symSet = new Set();
    this.portfolios.forEach(p => {
      (p.holdings || []).forEach(h => {
        const sym = (h.ticker || '').toUpperCase();
        if (sym) symSet.add(sym);
      });
      totalCashUSD += (p.cashBufferUSD || 0);
    });
    totalStocksCount = symSet.size;

    const totalCashTHB = totalCashUSD * (this.exchangeRate || 32.59);
    const completedGoals = (this.achievements || []).filter(a => a.completed).length;
    const totalGoals = (this.achievements || []).length;

    track.innerHTML = `
      <div class="spec-gauge-group">
        <div class="spec-gauge-item">
          <span class="spec-gauge-label">พอร์ต / หุ้น</span>
          <span class="spec-gauge-val">${totalPorts} พอร์ต <span style="color:var(--text-muted); font-size:10px;">/</span> ${totalStocksCount} ตัว</span>
        </div>
        <div class="spec-divider"></div>
        <div class="spec-gauge-item">
          <span class="spec-gauge-label">💧 เงินไว้ช้อน</span>
          <span class="spec-gauge-val highlight">$${totalCashUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="color:var(--text-muted); font-size:10px;">(฿${totalCashTHB.toLocaleString(undefined, {maximumFractionDigits: 0})})</span></span>
        </div>
        <div class="spec-divider"></div>
        <div class="spec-gauge-item">
          <span class="spec-gauge-label">🏆 เป้าหมาย</span>
          <span class="spec-gauge-val purple">${completedGoals}/${totalGoals}</span>
        </div>
        <div class="spec-divider"></div>
        <div class="spec-gauge-item">
          <span class="spec-gauge-label">💱 ค่าเงิน</span>
          <span class="spec-gauge-val">1 USD = ฿${(this.exchangeRate || 32.59).toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  // --- VIEW RENDERING ENGINE ---
  renderActiveTab() {
    this.renderSpecCountersBar();
    const container = document.getElementById('app-view-container');
    if (!container) return;

    // Destroy existing charts to avoid memory leaks
    Object.values(this.charts).forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
    this.charts = {};

    switch (this.currentTab) {
      case 'dashboard':
        this.renderDashboardView(container);
        break;
      case 'portfolios':
        this.renderPortfoliosView(container);
        break;
      case 'trading':
        this.renderTradingView(container);
        break;
      case 'dividends':
        this.renderDividendsView(container);
        break;
      case 'simulator':
        this.renderSimulatorView(container);
        break;
      case 'quarterly':
        this.renderQuarterlyView(container);
        break;
      case 'obsidian':
        this.renderObsidianExportView(container);
        break;
      case 'settings':
        this.renderSettingsView(container);
        break;
      default:
        this.renderDashboardView(container);
    }
  }

  // --- DIP OPPORTUNITY SCANNER RADAR (INVESTNEET STYLE) ---
  renderDipOpportunityScannerHTML() {
    const opportunities = [];

    this.portfolios.forEach(p => {
      (p.holdings || []).forEach(h => {
        const stats = this.calculateHoldingStats(h);
        const currentPrice = stats.currentPrice;

        const targets = [
          { tier: 1, label: 'ไม้ 1', val: h.dipTarget1 || h.dipTargetUSD },
          { tier: 2, label: 'ไม้ 2', val: h.dipTarget2 },
          { tier: 3, label: 'ไม้ 3', val: h.dipTarget3 }
        ].filter(t => t.val && t.val > 0);

        if (targets.length === 0) return;

        let bestTarget = null;
        let minDistancePct = 999;
        let isHit = false;
        let activeTier = null;

        targets.forEach(t => {
          const diffPct = ((currentPrice - t.val) / currentPrice) * 100;
          if (currentPrice <= t.val) {
            isHit = true;
            if (!bestTarget || t.tier > activeTier) {
              bestTarget = t;
              minDistancePct = diffPct;
              activeTier = t.tier;
            }
          } else if (!isHit && diffPct < minDistancePct) {
            minDistancePct = diffPct;
            bestTarget = t;
            activeTier = t.tier;
          }
        });

        opportunities.push({
          portfolioId: p.id,
          portfolioName: p.name,
          portfolioColor: p.color,
          holdingId: h.id,
          ticker: h.ticker,
          name: h.name,
          currentPrice,
          change1d: stats.change1d,
          targets,
          bestTarget,
          minDistancePct,
          isHit,
          activeTier
        });
      });
    });

    if (opportunities.length === 0) return '';

    // Sort: Hits first, then closest distance %
    opportunities.sort((a, b) => {
      if (a.isHit && !b.isHit) return -1;
      if (!a.isHit && b.isHit) return 1;
      return a.minDistancePct - b.minDistancePct;
    });

    const hitCount = opportunities.filter(o => o.isHit).length;
    const nearCount = opportunities.filter(o => !o.isHit && o.minDistancePct <= 5.0).length;

    const currentFilter = this.dipRadarFilter || 'all';

    const cardsHTML = opportunities.map(o => {
      const isUp = o.change1d >= 0;
      let statusBadge = '';
      let filterCategory = 'far';
      if (o.isHit) {
        statusBadge = `<span class="dip-radar-hit-status hit">🔥 ถึงจุดช้อน ${o.bestTarget.label}!</span>`;
        filterCategory = 'hit';
      } else if (o.minDistancePct <= 5.0) {
        statusBadge = `<span class="dip-radar-hit-status near">⚡ จ่อแนวรับ (อีก ${o.minDistancePct.toFixed(1)}%)</span>`;
        filterCategory = 'near';
      } else {
        statusBadge = `<span class="dip-radar-hit-status far">⏳ ห่าง ${o.minDistancePct.toFixed(1)}%</span>`;
        filterCategory = 'far';
      }

      const isHidden = (currentFilter === 'hit' && filterCategory !== 'hit') ||
                       (currentFilter === 'near' && filterCategory !== 'near');

      const tiersTags = o.targets.map(t => {
        const isTierHit = o.currentPrice <= t.val;
        return `<span class="dip-radar-tier-tag ${isTierHit ? 'active-hit' : ''}">${t.label}: $${t.val.toFixed(2)}</span>`;
      }).join('');

      return `
        <div class="dip-radar-item ${o.isHit ? 'hit' : ''} ${isHidden ? 'dip-item-hidden' : ''}" data-dip-category="${filterCategory}">
          <div class="dip-radar-item-top">
            <div class="dip-radar-sym-block">
              ${this.renderStockLogoHTML(o.ticker, o.portfolioColor || '#10b981', 18)}
              <span class="dip-radar-sym font-mono">${o.ticker}</span>
              <span class="dip-radar-port-badge">${o.portfolioName}</span>
            </div>
            ${statusBadge}
          </div>

          <div class="dip-radar-tiers-row">
            ${tiersTags}
          </div>

          <div class="dip-radar-bottom">
            <div class="dip-radar-price-info">
              ราคา: <strong>$${o.currentPrice.toFixed(2)}</strong> 
              <span class="${isUp ? 'text-emerald' : 'text-rose'}">(${isUp ? '+' : ''}${o.change1d.toFixed(2)}%)</span>
            </div>
            <button type="button" class="btn-dip-quick-buy" 
              data-dip-port="${o.portfolioId}" 
              data-dip-ticker="${o.ticker}" 
              data-dip-price="${o.bestTarget ? o.bestTarget.val : o.currentPrice}">
              <span>⚡ ช้อนเลย</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="dip-radar-card">
        <div class="dip-radar-header">
          <div class="dip-radar-title-group">
            <h3>📡 เรดาร์สแกนจุดช้อน (Dip Opportunity Radar)</h3>
            <span class="dip-radar-badge-count font-mono">${hitCount > 0 ? `🔥 ${hitCount} หุ้นถึงจุดช้อน` : `ติดตาม ${opportunities.length} หุ้น`}</span>
          </div>

          <div class="dip-radar-filter-tabs">
            <button type="button" class="dip-filter-btn ${currentFilter === 'hit' ? 'active' : ''}" data-dip-filter="hit">
              🔥 ถึงจุดช้อน (${hitCount})
            </button>
            <button type="button" class="dip-filter-btn ${currentFilter === 'near' ? 'active' : ''}" data-dip-filter="near">
              ⚡ จ่อแนวรับ (${nearCount})
            </button>
            <button type="button" class="dip-filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-dip-filter="all">
              🌟 ทั้งหมด (${opportunities.length})
            </button>
          </div>
        </div>

        <div class="dip-radar-swipe-container">
          <div class="dip-radar-grid" id="dip-radar-grid">
            ${cardsHTML}
          </div>
        </div>
      </div>
    `;
  }

  // --- SHAREABLE CYBERPUNK PORTFOLIO CARD ENGINE (DUCKSREEN & CERFINITS STYLE) ---
  openShareCardModal() {
    this.shareCardPrivacy = this.isPrivacyMode;
    this.shareCardFormat = 'square'; // 'square' (1080x1080) or 'story' (1080x1920)
    this.openModal('modal-share-card');
    setTimeout(() => {
      this.renderShareableCardCanvas();
    }, 60);
  }

  renderShareableCardCanvas() {
    const canvas = document.getElementById('share-card-canvas');
    if (!canvas) return;

    const isStory = this.shareCardFormat === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1080;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grand = this.calculateGrandTotalStats();

    // 1. Background Gradient (Dark Cyberpunk / Industrial)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#090d16');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Glow accents
    const radGlow1 = ctx.createRadialGradient(width * 0.8, 100, 10, width * 0.8, 100, 400);
    radGlow1.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
    radGlow1.addColorStop(1, 'transparent');
    ctx.fillStyle = radGlow1;
    ctx.fillRect(0, 0, width, height);

    const radGlow2 = ctx.createRadialGradient(200, height * 0.8, 10, 200, height * 0.8, 450);
    radGlow2.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    radGlow2.addColorStop(1, 'transparent');
    ctx.fillStyle = radGlow2;
    ctx.fillRect(0, 0, width, height);

    // 2. Outer Frame & Screws (Industrial Faceplate aesthetic)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    const drawScrew = (sx, sy) => {
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.stroke();
    };
    drawScrew(50, 50);
    drawScrew(width - 50, 50);
    drawScrew(50, height - 50);
    drawScrew(width - 50, height - 50);

    // 3. Header Branding
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('PIXEL STEWARD', 120, 100);

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('PORTFOLIO & WEALTH TRACKER', 120, 128);

    // Date
    const nowStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(nowStr, width - 70, 105);
    ctx.textAlign = 'left';

    // 4. Hero Net Worth Card
    const cardY = 170;
    const cardW = width - 140;
    const cardH = 260;
    
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.beginPath();
    ctx.roundRect(70, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText('สินทรัพย์รวมทั้งหมด (TOTAL NET WORTH)', 100, cardY + 50);

    const netWorthText = this.shareCardPrivacy 
      ? '฿ ••••••••••' 
      : `$${grand.grandTotalUSD.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} (฿${(grand.grandTotalUSD * (this.exchangeRate||32.59)).toLocaleString(undefined, {maximumFractionDigits:0})})`;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px monospace';
    ctx.fillText(netWorthText, 100, cardY + 115);

    // Return & Profit Chips
    const isProfitable = grand.totalPLUSD >= 0;
    const plText = this.shareCardPrivacy
      ? `${isProfitable ? '▲ +' : '▼ '}${this.formatPercent(grand.totalPLPct)}`
      : `${isProfitable ? '▲ +' : '▼ '}${this.formatPercent(grand.totalPLPct)} ($${grand.totalPLUSD.toFixed(2)} / ฿${(grand.totalPLUSD * (this.exchangeRate||32.59)).toFixed(0)})`;

    ctx.fillStyle = isProfitable ? '#10b981' : '#f43f5e';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`กำไรหุ้น: ${plText}`, 100, cardY + 170);

    const fxGainText = this.shareCardPrivacy ? '•••••' : `฿${(grand.fxGainTHB || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    ctx.fillStyle = '#38bdf8';
    ctx.font = '18px monospace';
    ctx.fillText(`ผลตอบแทนค่าเงิน (FX): ${fxGainText}`, 100, cardY + 215);

    // 5. Sub-Portfolios Summary Section
    const subY = cardY + cardH + 40;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('📁 สัดส่วนการลงทุน (Sub-Portfolios)', 70, subY);

    let currY = subY + 30;
    this.portfolios.forEach((p, idx) => {
      if (idx >= 4) return;
      const pTotal = this.calculatePortfolioStats(p).totalValueUSD;
      const pct = grand.grandTotalUSD > 0 ? (pTotal / grand.grandTotalUSD) * 100 : 0;
      const portVal = this.shareCardPrivacy ? '•••••' : `$${pTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath(); ctx.roundRect(70, currY, cardW, 60, 12); ctx.fill();
      ctx.strokeStyle = p.color || 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px sans-serif';
      ctx.fillText(p.name, 95, currY + 37);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#c084fc'; ctx.font = 'bold 18px monospace';
      ctx.fillText(`${pct.toFixed(1)}%`, width - 230, currY + 37);

      ctx.fillStyle = '#94a3b8'; ctx.font = '16px monospace';
      ctx.fillText(portVal, width - 95, currY + 37);
      ctx.textAlign = 'left';

      currY += 72;
    });

    // 6. Achievements Section
    const achY = currY + 30;
    const completedAchs = (this.achievements || []).filter(a => a.completed);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`🏆 เหรียญความสำเร็จ (${completedAchs.length}/${(this.achievements||[]).length})`, 70, achY);

    const achBoxY = achY + 20;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.beginPath(); ctx.roundRect(70, achBoxY, cardW, 70, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)'; ctx.lineWidth = 1.5; ctx.stroke();

    const emojiIcons = completedAchs.slice(0, 10).map(a => a.icon || '🏆').join('  ');
    ctx.font = '28px sans-serif';
    ctx.fillText(emojiIcons || '🌱 เริ่มต้นสร้างอิสรภาพทางการเงิน', 95, achBoxY + 45);

    // 7. Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GENERATED BY PIXEL STEWARD • SECURE & PRIVATE WEALTH MANAGEMENT', width / 2, height - 55);
    ctx.textAlign = 'left';
  }

  downloadShareCardPNG() {
    const canvas = document.getElementById('share-card-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `pixel-steward-portfolio-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    this.showToast({
      icon: '📸',
      title: 'ดาวน์โหลดรูปภาพสำเร็จ!',
      message: 'บันทึกการ์ดพอร์ตเป็นไฟล์ PNG เรียบร้อยแล้ว',
      type: 'success'
    });
  }

  async copyShareCardToClipboard() {
    const canvas = document.getElementById('share-card-canvas');
    if (!canvas) return;

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        this.showToast({
          icon: '📋',
          title: 'คัดลอกรูปภาพแล้ว!',
          message: 'สามารถกด Paste (Ctrl+V) ลงใน LINE หรือ Facebook ได้ทันที',
          type: 'success'
        });
      }, 'image/png');
    } catch (e) {
      this.downloadShareCardPNG();
    }
  }

  // 1. DASHBOARD VIEW (DIME AESTHETIC & DUAL CHARTS)
  renderDashboardView(container) {
    const grand = this.calculateGrandTotalStats();
    const dualMain = this.formatDual(grand.grandTotalUSD);
    const dateStr = new Date().toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const milestones = this.evaluateMilestones();
    const unlockedCount = milestones.filter(m => m.unlocked).length;

    let html = `
      <!-- DIME HERO BANNER -->
      <div class="dime-hero-banner">
        <div class="dime-hero-header">
          <span class="dime-hero-label">สินทรัพย์รวมทั้งหมด (Total Net Worth)</span>
          <span class="dime-timestamp font-mono">อัปเดต: ${dateStr} น.</span>
        </div>
        <div class="dime-main-value font-mono">${dualMain.main}</div>
        <div class="dime-sub-value font-mono">${dualMain.sub} (อิงอัตราแลกเปลี่ยน ฿${this.exchangeRate.toFixed(2)})</div>

        <div class="dime-hero-metrics">
          <div class="hero-metric-item">
            <span class="text-muted">เปลี่ยนแปลงเฉลี่ย 1 วัน:</span>
            <span class="metric-pill ${grand.avg1dChangePct >= 0 ? 'positive' : 'negative'} font-mono">
              ${grand.avg1dChangePct >= 0 ? '↗' : '↘'} ${this.formatPercent(grand.avg1dChangePct)}
            </span>
          </div>
          <div class="hero-metric-item">
            <span class="text-muted">กำไร/ขาดทุนสินทรัพย์หุ้น:</span>
            <span class="metric-pill ${grand.totalPLUSD >= 0 ? 'positive' : 'negative'} font-mono">
              ${grand.totalPLUSD >= 0 ? '↗' : '↘'} ${this.formatPercent(grand.totalPLPct)} (${this.formatUSD(grand.totalPLUSD)} / ${this.formatTHB(this.usdToThb(grand.totalPLUSD))})
            </span>
          </div>
        </div>

        <!-- FX RETURN VS STOCK GAIN BREAKDOWN CHIPS -->
        <div class="fx-breakdown-card">
          <div class="fx-chip">
            <span class="fx-chip-label">📈 กำไรจากหุ้น:</span>
            <strong class="${grand.totalPLUSD >= 0 ? 'text-emerald' : 'text-rose'} font-mono">
              ${grand.totalPLUSD >= 0 ? '+' : ''}${this.formatUSD(grand.totalPLUSD)} (${this.formatPercent(grand.totalPLPct)})
            </strong>
          </div>
          <div class="fx-chip">
            <span class="fx-chip-label">💵 กำไรค่าเงิน (ยังไม่มีต้นทุน FX):</span>
            <strong class="${grand.fxGainTHB >= 0 ? 'text-emerald' : 'text-rose'} font-mono">
              ยังไม่คำนวณ
            </strong>
          </div>
          <div class="fx-chip">
            <span class="fx-chip-label">กำไรหุ้นที่ยังไม่ขาย แปลงเป็นบาท:</span>
            <strong class="${grand.totalNetReturnTHB >= 0 ? 'text-emerald' : 'text-rose'} font-mono">
              ${grand.totalNetReturnTHB >= 0 ? '+' : ''}${this.formatTHB(grand.totalNetReturnTHB)}
            </strong>
          </div>
        </div>
      </div>

      <!-- DIP OPPORTUNITY SCANNER RADAR -->
      ${this.renderDipOpportunityScannerHTML()}

      <!-- CUSTOM FINANCIAL ACHIEVEMENTS & GOALS SECTION -->
      <div class="achievements-section-wrapper">
        <div class="achievements-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 15px; font-weight: 800; color: #fff;">🏆 เป้าหมาย & เหรียญความสำเร็จ (Goals & Achievements)</span>
            <span class="badge font-mono" style="background: rgba(16, 185, 129, 0.15); color: var(--color-emerald); font-size: 11px; padding: 2px 8px; border-radius: var(--radius-full);">
              ${this.achievements.filter(a => a.completed).length}/${this.achievements.length} สำเร็จแล้ว
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div class="achievement-filter-tabs">
              <button type="button" class="ach-tab-btn ${this.achievementFilter === 'in_progress' ? 'active' : ''}" data-ach-filter="in_progress">
                ⏳ กำลังพิชิต (${this.achievements.filter(a => !a.completed).length})
              </button>
              <button type="button" class="ach-tab-btn ${this.achievementFilter === 'completed' ? 'active' : ''}" data-ach-filter="completed">
                ✅ สำเร็จแล้ว (${this.achievements.filter(a => a.completed).length})
              </button>
              <button type="button" class="ach-tab-btn ${this.achievementFilter === 'all' ? 'active' : ''}" data-ach-filter="all">
                🌟 ทั้งหมด (${this.achievements.length})
              </button>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" id="btn-add-achievement-modal" title="สร้างเป้าหมายทางการเงินใหม่">
              <span>➕ เพิ่มเป้าหมาย</span>
            </button>
          </div>
        </div>

        <div class="achievements-list-grid" id="achievements-list-container">
          ${this.renderAchievementsListHTML()}
        </div>
      </div>

      <!-- VIEW MODE SWITCHER: DONUT VS HEATMAP -->
      <div class="view-mode-selector-wrapper">
        <div class="section-title" style="margin: 0;">
          <span>📊 แผนภาพสัดส่วนการลงทุน (Asset Allocation)</span>
        </div>
        <div class="view-mode-pill">
          <button type="button" class="view-pill-btn ${this.allocationViewMode !== 'heatmap' ? 'active' : ''}" id="btn-view-donut">
            <span>🍩 กราฟโดนัท</span>
          </button>
          <button type="button" class="view-pill-btn ${this.allocationViewMode === 'heatmap' ? 'active' : ''}" id="btn-view-heatmap">
            <span>🔥 แผนภาพ Heatmap</span>
          </button>
        </div>
      </div>

      <!-- 1. DONUT CHARTS SWIPEABLE CAROUSEL CONTAINER -->
      <div class="analytics-charts-wrapper" id="dashboard-donut-container" style="${this.allocationViewMode === 'heatmap' ? 'display:none;' : ''}">
        <div class="donut-carousel-nav-header">
          <div class="donut-swipe-hint font-mono">
            <span>👆 ปัดซ้าย-ขวาเพื่อดูสัดส่วน</span>
          </div>

          <div class="donut-carousel-controls">
            <button type="button" class="btn-carousel-arrow" id="btn-donut-prev" title="ก่อนหน้า">‹</button>
            <div class="donut-carousel-dots" id="donut-carousel-dots">
              <span class="carousel-dot active" data-index="0"></span>
              <span class="carousel-dot" data-index="1"></span>
              <span class="carousel-dot" data-index="2"></span>
            </div>
            <button type="button" class="btn-carousel-arrow" id="btn-donut-next" title="ถัดไป">›</button>
          </div>
        </div>

        <div class="analytics-charts-grid donut-swipe-track" id="donut-swipe-track">
          <div class="chart-card donut-chart-slide active" data-slide-index="0" id="donut-slide-asset">
            <div class="chart-title">
              <span>🍩 สัดส่วนตามประเภทสินทรัพย์ (Asset Allocation)</span>
            </div>
            <div class="chart-canvas-container">
              <canvas id="chart-asset-classes"></canvas>
            </div>
            <div class="chart-legend-list" id="legend-asset-classes"></div>
          </div>

          <div class="chart-card donut-chart-slide" data-slide-index="1" id="donut-slide-port">
            <div class="chart-title">
              <span>🎯 สัดส่วนตามพอร์ตเป้าหมาย (Sub-Portfolios)</span>
            </div>
            <div class="chart-canvas-container">
              <canvas id="chart-portfolio-weights"></canvas>
            </div>
            <div class="chart-legend-list" id="legend-portfolio-weights"></div>
          </div>

          <div class="chart-card donut-chart-slide" data-slide-index="2" id="donut-slide-holding">
            <div class="chart-title">
              <span>🍩 สัดส่วนสินทรัพย์ย่อยทั้งหมด (Holdings Allocation)</span>
            </div>
            <div class="chart-canvas-container">
              <canvas id="chart-all-holdings"></canvas>
            </div>
            <div class="chart-legend-list" id="legend-all-holdings"></div>
          </div>
        </div>
      </div>

      <!-- 2. HEATMAP CONTAINER -->
      <div class="heatmap-wrapper" id="dashboard-heatmap-container" style="${this.allocationViewMode === 'heatmap' ? '' : 'display:none;'}">
        <div class="heatmap-header">
          <div class="heatmap-title-box">
            <span class="heatmap-title-text font-mono">🔥 Heatmap สัดส่วนพอร์ต & กำไร/ขาดทุน</span>
            <span style="font-size:11px; color:var(--text-muted);">คลิกที่กล่องเพื่อเปิดพอร์ต</span>
          </div>
          <div class="heatmap-sort-pill">
            <button type="button" class="heatmap-sort-btn ${this.heatmapSortBy !== 'pl' ? 'active' : ''}" data-heatmap-sort="val">💰 ตามมูลค่า</button>
            <button type="button" class="heatmap-sort-btn ${this.heatmapSortBy === 'pl' ? 'active' : ''}" data-heatmap-sort="pl">📈 ตาม % P/L</button>
          </div>
        </div>
        <div class="heatmap-grid" id="heatmap-tiles-grid">
          ${this.renderHeatmapTilesHTML()}
        </div>
      </div>

      <!-- SUB-PORTFOLIOS CARDS SECTION -->
      <div class="section-header">
        <div class="section-title">
          <span>📁 พอร์ตการลงทุน</span>
          <span class="section-count-badge font-mono">${this.portfolios.length} พอร์ต</span>
        </div>
        <div class="port-section-actions">
          <div class="port-view-pill">
            <button type="button" class="port-view-btn ${(!this.portLayoutMode || this.portLayoutMode === 'slider') ? 'active' : ''}" data-port-layout="slider" title="สไลด์การ์ดแนวนอน">🎴 สไลด์</button>
            <button type="button" class="port-view-btn ${this.portLayoutMode === 'compact' ? 'active' : ''}" data-port-layout="compact" title="กริด 2 คอลัมน์">📑 กระชับ</button>
            <button type="button" class="port-view-btn ${this.portLayoutMode === 'list' ? 'active' : ''}" data-port-layout="list" title="รายการปกติ">📋 ทั้งหมด</button>
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-open-reorder-modal" title="จัดเรียงลำดับ">
            <span>↕️</span>
          </button>
          <button class="btn btn-sm btn-secondary" id="btn-add-portfolio-modal" title="เพิ่มพอร์ตใหม่">
            <span>➕</span>
          </button>
        </div>
      </div>

      <div id="dashboard-portfolios-container">
        ${this.renderDashboardPortfoliosLayoutHTML()}
      </div>
    `;

    container.innerHTML = html;

    // Setup View Mode Toggle (Donut vs Heatmap)
    const btnDonut = document.getElementById('btn-view-donut');
    const btnHeatmap = document.getElementById('btn-view-heatmap');
    const donutContainer = document.getElementById('dashboard-donut-container');
    const heatmapContainer = document.getElementById('dashboard-heatmap-container');

    btnDonut?.addEventListener('click', () => {
      this.allocationViewMode = 'donut';
      btnDonut.classList.add('active');
      btnHeatmap?.classList.remove('active');
      if (donutContainer) donutContainer.style.display = 'block';
      if (heatmapContainer) heatmapContainer.style.display = 'none';
    });

    btnHeatmap?.addEventListener('click', () => {
      this.allocationViewMode = 'heatmap';
      btnHeatmap.classList.add('active');
      btnDonut?.classList.remove('active');
      if (donutContainer) donutContainer.style.display = 'none';
      if (heatmapContainer) heatmapContainer.style.display = 'block';
    });

    // Heatmap Sort click
    container.querySelectorAll('[data-heatmap-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sort = btn.getAttribute('data-heatmap-sort');
        this.heatmapSortBy = sort;
        container.querySelectorAll('[data-heatmap-sort]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const grid = document.getElementById('heatmap-tiles-grid');
        if (grid) {
          grid.innerHTML = this.renderHeatmapTilesHTML();
          this.rebindHeatmapTileEvents(container);
        }
      });
    });

    // Heatmap Tile click to view portfolio
    this.rebindHeatmapTileEvents(container);

    // Setup Portfolio Layout Switcher (Slider vs Compact vs List)
    container.querySelectorAll('[data-port-layout]').forEach(btn => {
      btn.addEventListener('click', () => {
        const layout = btn.getAttribute('data-port-layout');
        this.portLayoutMode = layout;
        localStorage.setItem('pixel_port_layout', layout);
        container.querySelectorAll('[data-port-layout]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const portContainer = document.getElementById('dashboard-portfolios-container');
        if (portContainer) {
          portContainer.innerHTML = this.renderDashboardPortfoliosLayoutHTML();
          this.setupPortfolioSliderEvents();
        }
      });
    });

    this.setupPortfolioSliderEvents();

    // Dip Opportunity Quick Buy Button
    container.querySelectorAll('.btn-dip-quick-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const portId = btn.getAttribute('data-dip-port');
        const ticker = btn.getAttribute('data-dip-ticker');
        const price = parseFloat(btn.getAttribute('data-dip-price'));
        const port = this.portfolios.find(p => p.id === portId);
        const h = port?.holdings?.find(x => x.ticker === ticker);
        if (port && h) {
          this.openTradeModalForHolding(h.id, port.id, price);
        }
      });
    });

    // Dip Opportunity Radar Filter Tabs
    container.querySelectorAll('.dip-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-dip-filter');
        this.dipRadarFilter = filter;
        container.querySelectorAll('.dip-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const items = container.querySelectorAll('.dip-radar-item');
        items.forEach(item => {
          const cat = item.getAttribute('data-dip-category');
          if (filter === 'all') {
            item.classList.remove('dip-item-hidden');
          } else if (filter === 'hit') {
            item.classList.toggle('dip-item-hidden', cat !== 'hit');
          } else if (filter === 'near') {
            item.classList.toggle('dip-item-hidden', cat !== 'near');
          }
        });
      });
    });

    // Setup Achievements Mini-Tabs & Click Events
    this.setupAchievementsEvents(container);

    // Setup Donut Carousel Tabs & Charts
    this.setupDonutTabs();
    setTimeout(() => {
      this.initDashboardCharts();
    }, 50);
  }

  setupAchievementsEvents(container) {
    // Mini-Tab Filter Click
    container.querySelectorAll('[data-ach-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-ach-filter');
        this.achievementFilter = filter;
        container.querySelectorAll('[data-ach-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const listEl = document.getElementById('achievements-list-container');
        if (listEl) {
          listEl.innerHTML = this.renderAchievementsListHTML();
          this.rebindAchievementItemEvents(container);
        }
      });
    });

    // Add Achievement Modal Button
    document.getElementById('btn-add-achievement-modal')?.addEventListener('click', () => {
      this.openAchievementModal(null);
    });

    this.rebindAchievementItemEvents(container);
  }

  rebindAchievementItemEvents(container) {
    // Toggle Completion (Check button)
    container.querySelectorAll('[data-ach-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-ach-toggle');
        this.toggleAchievementCompleted(id);
      });
    });

    // Edit Achievement on Edit Button Click
    container.querySelectorAll('[data-ach-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-ach-edit');
        this.openAchievementModal(id);
      });
    });

    // Edit Achievement on Card Click
    container.querySelectorAll('.achievement-card-compact').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-ach-toggle]')) return;
        const id = card.getAttribute('data-ach-id');
        if (id) this.openAchievementModal(id);
      });
    });
  }

  renderAchievementsListHTML() {
    let list = this.achievements || [];
    if (this.achievementFilter === 'in_progress') {
      list = list.filter(a => !a.completed);
    } else if (this.achievementFilter === 'completed') {
      list = list.filter(a => a.completed);
    }

    if (list.length === 0) {
      const msg = this.achievementFilter === 'completed' 
        ? 'ยังไม่มีเป้าหมายที่สำเร็จ มาเริ่มพิชิตเป้าหมายกันเถอะ!' 
        : (this.achievementFilter === 'in_progress' ? '🎉 ยินดีด้วย! คุณพิชิตเป้าหมายทั้งหมดเรียบร้อยแล้ว' : 'ยังไม่มีเป้าหมายที่บันทึกไว้');
      return `<div style="text-align: center; padding: 20px; color: var(--text-muted); grid-column: 1/-1; font-size: 13px;">${msg}</div>`;
    }

    return list.map(a => `
      <div class="achievement-card-compact ${a.completed ? 'unlocked' : 'locked'}" data-ach-id="${a.id}">
        <div class="ach-card-left">
          <span class="ach-icon">${a.emoji || '🎯'}</span>
          <div class="ach-meta">
            <div class="ach-title">
              <span>${this.escapeHtml(a.name)}</span>
              ${a.completed ? '<span style="color:var(--color-emerald); font-size:11px;">✅</span>' : '<span style="color:var(--text-muted); font-size:11px;">⏳</span>'}
            </div>
            <div class="ach-desc" title="${this.escapeHtml(a.desc || '')}">${this.escapeHtml(a.desc || 'เป้าหมายทางการเงิน')}</div>
          </div>
        </div>
        <div class="ach-actions">
          <button type="button" class="ach-check-btn ${a.completed ? 'completed' : ''}" data-ach-toggle="${a.id}" title="${a.completed ? 'คลิกเพื่อเปลี่ยนเป็นกำลังทำ' : 'คลิกเมื่อทำสำเร็จแล้ว 🎉'}">
            ${a.completed ? '✓' : '○'}
          </button>
          <button type="button" class="ach-edit-btn" data-ach-edit="${a.id}" title="แก้ไขเป้าหมาย">✏️</button>
        </div>
      </div>
    `).join('');
  }

  openAchievementModal(achId = null) {
    const titleEl = document.getElementById('modal-achievement-title');
    const idInput = document.getElementById('achievement-id');
    const emojiInput = document.getElementById('achievement-emoji');
    const nameInput = document.getElementById('achievement-name');
    const descInput = document.getElementById('achievement-desc');
    const completedInput = document.getElementById('achievement-completed');
    const btnDelete = document.getElementById('btn-delete-achievement');

    if (achId) {
      const ach = (this.achievements || []).find(a => a.id === achId);
      if (!ach) return;
      if (titleEl) titleEl.textContent = '✏️ แก้ไขเป้าหมายความสำเร็จ';
      if (idInput) idInput.value = ach.id;
      if (emojiInput) emojiInput.value = ach.emoji || '🎯';
      if (nameInput) nameInput.value = ach.name || '';
      if (descInput) descInput.value = ach.desc || '';
      if (completedInput) completedInput.checked = !!ach.completed;
      btnDelete?.classList.remove('hidden');
    } else {
      if (titleEl) titleEl.textContent = '➕ สร้างเป้าหมายความสำเร็จใหม่';
      if (idInput) idInput.value = '';
      if (emojiInput) emojiInput.value = '🎯';
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (completedInput) completedInput.checked = false;
      btnDelete?.classList.add('hidden');
    }

    this.setupAchievementEmojiPicker();
    this.openModal('modal-achievement');
  }

  setupAchievementEmojiPicker() {
    const container = document.getElementById('achievement-emoji-picker');
    const emojiInput = document.getElementById('achievement-emoji');
    if (!container || !emojiInput) return;

    container.querySelectorAll('.emoji-pick-btn').forEach(btn => {
      btn.onclick = () => {
        const em = btn.getAttribute('data-emoji');
        if (em) {
          emojiInput.value = em;
          container.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      };
    });
  }

  async saveAchievementFromForm(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('achievement-id')?.value;
    const emoji = (document.getElementById('achievement-emoji')?.value || '🎯').trim();
    const name = (document.getElementById('achievement-name')?.value || '').trim();
    const desc = (document.getElementById('achievement-desc')?.value || '').trim();
    const completed = !!document.getElementById('achievement-completed')?.checked;

    if (!name) {
      alert('กรุณากรอกชื่อเป้าหมายความสำเร็จ');
      return;
    }

    if (id) {
      // Edit existing
      const idx = this.achievements.findIndex(a => a.id === id);
      if (idx >= 0) {
        const wasCompleted = this.achievements[idx].completed;
        this.achievements[idx] = {
          ...this.achievements[idx],
          emoji,
          name,
          desc,
          completed
        };
        if (!wasCompleted && completed) {
          this.triggerCelebration();
        }
      }
    } else {
      // Create new
      const newAch = {
        id: 'ach_' + Date.now(),
        emoji,
        name,
        desc,
        completed,
        createdAt: new Date().toISOString().split('T')[0]
      };
      this.achievements.push(newAch);
      if (completed) {
        this.triggerCelebration();
      }
    }

    if (!await this.saveData()) return;
    this.closeModal('modal-achievement');
    this.showToast({
      icon: emoji,
      title: 'บันทึกเป้าหมายสำเร็จ!',
      message: name,
      type: 'success'
    });
  }

  async deleteAchievement(achId) {
    if (!achId) return;
    if (confirm('คุณต้องการลบเป้าหมายนี้ใช่หรือไม่?')) {
      this.achievements = this.achievements.filter(a => a.id !== achId);
      if (!await this.saveData()) return;
      this.closeModal('modal-achievement');
      this.showToast({
        icon: '🗑️',
        title: 'ลบเป้าหมายแล้ว',
        type: 'info'
      });
    }
  }

  async toggleAchievementCompleted(achId) {
    const ach = (this.achievements || []).find(a => a.id === achId);
    if (!ach) return;
    ach.completed = !ach.completed;
    if (!await this.saveData()) return;
    if (ach.completed) {
      this.triggerCelebration();
      this.showToast({
        icon: ach.emoji || '🎉',
        title: '🏆 ปลดล็อกเป้าหมายสำเร็จ!',
        message: ach.name,
        type: 'success'
      });
    } else {
      this.showToast({
        icon: '⏳',
        title: 'เปลี่ยนสถานะเป็นกำลังพิชิต',
        message: ach.name,
        type: 'info'
      });
    }
  }

  rebindHeatmapTileEvents(container) {
    container.querySelectorAll('.heatmap-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const portId = tile.getAttribute('data-heatmap-port');
        if (portId) {
          this.selectedPortfolioId = portId;
          this.switchTab('portfolios');
          const holdingId=tile.getAttribute('data-heatmap-holding');
          if(holdingId)this.openHoldingModal(holdingId,portId);
        }
      });
      tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tile.click();}});
    });
  }

  renderDashboardPortfoliosLayoutHTML() {
    const layout = this.portLayoutMode || 'slider';

    if (layout === 'compact') {
      return `
        <div class="port-compact-grid">
          ${this.portfolios.map(p => {
            const stats = this.calculatePortfolioStats(p);
            const dualVal = this.formatDual(stats.totalValueUSD);
            const dualCash = this.formatDual(stats.cashBufferUSD);
            const isUp = stats.avg1dChangePct >= 0;
            return `
              <div class="port-compact-mini-card" data-open-port="${p.id}" style="border-left: 3.5px solid ${p.color || '#10b981'};">
                <div class="port-mini-header">
                  <div class="port-emoji-avatar small" style="background: ${p.color || '#10b981'}20; border: 1px solid ${p.color || '#10b981'}50;">
                    ${p.emoji || '📁'}
                  </div>
                  <div style="flex:1; min-width:0;">
                    <div class="port-mini-name">${this.escapeHtml(p.name)}</div>
                    <div class="port-mini-sub font-mono">💧 ${dualCash.main}</div>
                  </div>
                </div>
                <div class="port-mini-body">
                  <div class="port-mini-val font-mono">${dualVal.main}</div>
                  <div class="port-mini-pl font-mono ${isUp ? 'text-emerald' : 'text-rose'}">
                    ${isUp ? '▲ +' : '▼ '}${Math.abs(stats.avg1dChangePct).toFixed(1)}% (1D)
                  </div>
                </div>
                <div class="progress-bar-bg compact" style="margin-top:6px;">
                  <div class="progress-bar-fill" style="width: ${stats.goalProgressPct}%; background: ${p.color || '#10b981'};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (layout === 'list') {
      return `
        <div class="portfolios-grid">
          ${this.portfolios.map(p => {
            const stats = this.calculatePortfolioStats(p);
            const dualVal = this.formatDual(stats.totalValueUSD);
            const dualCash = this.formatDual(stats.cashBufferUSD);
            return `
              <div class="port-card port-card-compact" data-open-port="${p.id}" style="border-left: 4px solid ${p.color || '#10b981'};">
                <div class="port-card-top">
                  <div class="port-emoji-avatar" style="background: ${p.color || '#10b981'}20; border: 1.5px solid ${p.color || '#10b981'}50;">
                    ${p.emoji || '📁'}
                  </div>
                  <div class="port-info-col">
                    <div class="port-card-name-row">
                      <span class="port-card-name">${this.escapeHtml(p.name)}</span>
                      <span class="port-card-compact-badge font-mono">${this.escapeHtml(p.tier)}</span>
                      <span class="port-cash-buffer-pill font-mono">💧 ${dualCash.main}</span>
                    </div>
                  </div>
                  <div class="port-card-value-box">
                    <div class="port-card-val-primary font-mono">${dualVal.main}</div>
                    <div class="port-card-val-secondary font-mono">${dualVal.sub}</div>
                  </div>
                </div>

                <div class="port-card-compact-meta font-mono">
                  <div class="port-meta-left">
                    <span class="${stats.avg1dChangePct >= 0 ? 'text-emerald' : 'text-rose'}">
                      ${stats.avg1dChangePct >= 0 ? '▲ +' : '▼ '}${stats.avg1dChangePct.toFixed(2)}% (1D)
                    </span>
                    <span class="text-muted">•</span>
                    <span class="${stats.totalPLPct >= 0 ? 'text-emerald' : 'text-rose'}">
                      P/L ${stats.totalPLPct >= 0 ? '+' : ''}${stats.totalPLPct.toFixed(2)}% (${this.formatUSD(stats.totalPLUSD)})
                    </span>
                  </div>
                  <div class="port-meta-right">
                    <span class="text-muted">เป้า: ${this.formatUSD(stats.goalUSD)}</span>
                    <strong style="color:#fff;">${stats.goalProgressPct.toFixed(1)}%</strong>
                  </div>
                </div>

                <div class="progress-bar-bg compact">
                  <div class="progress-bar-fill" style="width: ${stats.goalProgressPct}%; background: ${p.color || '#10b981'};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Default 'slider' mode (Horizontal Snap Carousel Deck)
    return `
      <div class="port-slider-deck-wrapper">
        <div class="port-slider-track" id="port-slider-track">
          ${this.portfolios.map((p, idx) => {
            const stats = this.calculatePortfolioStats(p);
            const dualVal = this.formatDual(stats.totalValueUSD);
            const dualCash = this.formatDual(stats.cashBufferUSD);
            return `
              <div class="port-slide-card ${idx === 0 ? 'active' : ''}" data-open-port="${p.id}" data-slide-index="${idx}" style="border-left: 4px solid ${p.color || '#10b981'};">
                <div class="port-card-top">
                  <div class="port-emoji-avatar" style="background: ${p.color || '#10b981'}20; border: 1.5px solid ${p.color || '#10b981'}50;">
                    ${p.emoji || '📁'}
                  </div>
                  <div class="port-info-col">
                    <div class="port-card-name-row">
                      <span class="port-card-name">${this.escapeHtml(p.name)}</span>
                      <span class="port-card-compact-badge font-mono">${this.escapeHtml(p.tier)}</span>
                      <span class="port-cash-buffer-pill font-mono">💧 ${dualCash.main}</span>
                    </div>
                  </div>
                  <div class="port-card-value-box">
                    <div class="port-card-val-primary font-mono">${dualVal.main}</div>
                    <div class="port-card-val-secondary font-mono">${dualVal.sub}</div>
                  </div>
                </div>

                <div class="port-card-compact-meta font-mono">
                  <div class="port-meta-left">
                    <span class="${stats.avg1dChangePct >= 0 ? 'text-emerald' : 'text-rose'}">
                      ${stats.avg1dChangePct >= 0 ? '▲ +' : '▼ '}${stats.avg1dChangePct.toFixed(2)}% (1D)
                    </span>
                    <span class="text-muted">•</span>
                    <span class="${stats.totalPLPct >= 0 ? 'text-emerald' : 'text-rose'}">
                      P/L ${stats.totalPLPct >= 0 ? '+' : ''}${stats.totalPLPct.toFixed(2)}% (${this.formatUSD(stats.totalPLUSD)})
                    </span>
                  </div>
                  <div class="port-meta-right">
                    <span class="text-muted">เป้า: ${this.formatUSD(stats.goalUSD)}</span>
                    <strong style="color:#fff;">${stats.goalProgressPct.toFixed(1)}%</strong>
                  </div>
                </div>

                <div class="progress-bar-bg compact">
                  <div class="progress-bar-fill" style="width: ${stats.goalProgressPct}%; background: ${p.color || '#10b981'};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="port-slider-nav-bar">
          <button type="button" class="btn-port-arrow" id="btn-port-prev" title="พอร์ตก่อนหน้า">‹</button>
          <div class="port-slider-dots" id="port-slider-dots">
            ${this.portfolios.map((p, idx) => `<span class="port-dot ${idx === 0 ? 'active' : ''}" data-port-dot-index="${idx}"></span>`).join('')}
          </div>
          <span class="port-slider-counter font-mono" id="port-slider-counter">1 / ${this.portfolios.length}</span>
          <button type="button" class="btn-port-arrow" id="btn-port-next" title="พอร์ตถัดไป">›</button>
        </div>
      </div>
    `;
  }

  setupPortfolioSliderEvents() {
    const track = document.getElementById('port-slider-track');
    const dots = document.querySelectorAll('.port-dot');
    const counter = document.getElementById('port-slider-counter');
    const btnPrev = document.getElementById('btn-port-prev');
    const btnNext = document.getElementById('btn-port-next');
    const slides = document.querySelectorAll('.port-slide-card');

    if (!track || slides.length === 0) return;

    let currentIndex = 0;

    const goToPortSlide = (index) => {
      if (index < 0) index = 0;
      if (index >= slides.length) index = slides.length - 1;
      currentIndex = index;

      const targetSlide = slides[index];
      if (targetSlide) {
        track.scrollTo({
          left: targetSlide.offsetLeft - track.offsetLeft,
          behavior: 'smooth'
        });
      }

      slides.forEach((s, idx) => s.classList.toggle('active', idx === index));
      dots.forEach((d, idx) => d.classList.toggle('active', idx === index));
      if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
    };

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => goToPortSlide(idx));
    });

    btnPrev?.addEventListener('click', () => goToPortSlide(currentIndex - 1));
    btnNext?.addEventListener('click', () => goToPortSlide(currentIndex + 1));

    let scrollTimer = null;
    track.addEventListener('scroll', () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const scrollLeft = track.scrollLeft;
        const width = track.clientWidth;
        if (width <= 0) return;
        const newIndex = Math.round(scrollLeft / width);
        if (newIndex >= 0 && newIndex < slides.length && newIndex !== currentIndex) {
          currentIndex = newIndex;
          slides.forEach((s, idx) => s.classList.toggle('active', idx === currentIndex));
          dots.forEach((d, idx) => d.classList.toggle('active', idx === currentIndex));
          if (counter) counter.textContent = `${currentIndex + 1} / ${slides.length}`;
        }
      }, 40);
    }, { passive: true });
  }

  renderHeatmapTilesHTML() {
    const allHoldings = [];
    this.portfolios.forEach(p => {
      (p.holdings || []).forEach(h => {
        const stats = this.calculateHoldingStats(h);
        if (stats.marketValueUSD > 0) {
          allHoldings.push({
            id: h.id,
            ticker: h.ticker,
            name: h.name || h.ticker,
            portId: p.id,
            portName: p.name,
            portEmoji: p.emoji || '📁',
            color: p.color || '#10b981',
            valUSD: stats.marketValueUSD,
            valTHB: stats.marketValueTHB,
            plPct: stats.unrealizedPLPct,
            plUSD: stats.unrealizedPLUSD,
            shares: stats.shares
          });
        }
      });
    });

    if (allHoldings.length === 0) {
      return `<div style="text-align:center; padding:32px; color:var(--text-muted); grid-column: 1/-1;">ยังไม่มีรายการสินทรัพย์ในพอร์ต</div>`;
    }

    // Sort by selected mode (value or pl)
    if (this.heatmapSortBy === 'pl') {
      allHoldings.sort((a, b) => b.plPct - a.plPct);
    } else {
      allHoldings.sort((a, b) => b.valUSD - a.valUSD);
    }

    const holdingsSum = allHoldings.reduce((sum,h)=>sum+h.valUSD,0);
    return allHoldings.map(h => {
      const isUp = h.plPct >= 0;
      let intensityClass = 'heatmap-flat';
      if (h.plPct >= 20) intensityClass = 'heatmap-up-strong';
      else if (h.plPct >= 8) intensityClass = 'heatmap-up-med';
      else if (h.plPct >= 0) intensityClass = 'heatmap-up-light';
      else if (h.plPct >= -8) intensityClass = 'heatmap-down-light';
      else if (h.plPct >= -20) intensityClass = 'heatmap-down-med';
      else intensityClass = 'heatmap-down-strong';

      return `
        <div class="heatmap-tile ${intensityClass}" role="button" tabindex="0" data-heatmap-holding="${h.id}" data-heatmap-port="${h.portId}" title="${this.escapeHtml(h.ticker)} (${this.escapeHtml(h.name)}) - P/L: ${isUp ? '+' : ''}${h.plPct.toFixed(2)}%">
          <div class="heatmap-tile-header">
            <div style="display:flex; align-items:center; gap:6px;">
              ${this.renderStockLogoHTML(h.ticker, h.color, 20)}
              <span class="heatmap-tile-sym font-mono">${this.escapeHtml(h.ticker)}</span>
            </div>
            <span class="heatmap-tile-pct font-mono">
              ${isUp ? '▲ +' : '▼ '}${Math.abs(h.plPct).toFixed(1)}%
            </span>
          </div>
          <div class="heatmap-tile-body">
            <div class="heatmap-tile-val font-mono">${this.formatDual(h.valUSD).main}</div><div class="heatmap-weight">${(h.valUSD / holdingsSum * 100).toFixed(2)}% ของสินทรัพย์ที่ถือ</div><div class="weight-track"><span style="width:${h.valUSD / holdingsSum * 100}%"></span></div>
            <div class="heatmap-tile-sub font-mono">${h.portEmoji} ${this.escapeHtml(h.portName)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  initDashboardCharts() {
    // 1. Asset Class Donut Chart
    const grand = this.calculateGrandTotalStats();
    const ctxAsset = document.getElementById('chart-asset-classes')?.getContext('2d');
    if (ctxAsset) {
      const labels = ['หุ้นและกองทุน (US Stocks)', 'เงินสดไว้ช้อน (Cash Buffer)', 'พอร์ตเทรด (Forex & Option)'];
      const dataValues = [grand.totalStocksUSD, grand.totalCashBufferUSD, grand.totalTradingUSD];
      const colors = ['#a855f7', '#38bdf8', '#f59e0b'];

      this.charts.asset = new Chart(ctxAsset, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: dataValues,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: { legend: { display: false } }
        }
      });

      // Render custom legend
      const legendEl = document.getElementById('legend-asset-classes');
      if (legendEl) {
        const total = grand.grandTotalUSD || 1;
        legendEl.innerHTML = labels.map((lbl, idx) => {
          const val = dataValues[idx];
          const pct = ((val / total) * 100).toFixed(2);
          return `
            <div class="chart-legend-item">
              <div><span class="legend-color-dot" style="background: ${colors[idx]}"></span>${lbl}</div>
              <strong class="font-mono">${pct}% (${this.formatUSD(val)})</strong>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Sub-Portfolio Weights Donut Chart
    const ctxPort = document.getElementById('chart-portfolio-weights')?.getContext('2d');
    if (ctxPort) {
      const portLabels = [];
      const portValues = [];
      const portColors = [];

      this.portfolios.forEach(p => {
        const s = this.calculatePortfolioStats(p);
        if (s.totalValueUSD > 0) {
          portLabels.push(`${p.emoji || ''} ${this.escapeHtml(p.name)}`);
          portValues.push(s.totalValueUSD);
          portColors.push(p.color || '#10b981');
        }
      });

      const { totalTradingUSD } = this.getTradingLatestBalances();
      if (totalTradingUSD > 0) {
        portLabels.push('💱 Trading (Forex & Option)');
        portValues.push(totalTradingUSD);
        portColors.push('#f59e0b');
      }

      this.charts.ports = new Chart(ctxPort, {
        type: 'doughnut',
        data: {
          labels: portLabels,
          datasets: [{
            data: portValues,
            backgroundColor: portColors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: { legend: { display: false } }
        }
      });

      const legendEl = document.getElementById('legend-portfolio-weights');
      if (legendEl) {
        const grandTotal = grand.grandTotalUSD || 1;
        legendEl.innerHTML = portLabels.map((lbl, idx) => {
          const val = portValues[idx];
          const pct = ((val / grandTotal) * 100).toFixed(2);
          return `
            <div class="chart-legend-item">
              <div><span class="legend-color-dot" style="background: ${portColors[idx]}"></span>${lbl}</div>
              <strong class="font-mono">${pct}% (${this.formatUSD(val)})</strong>
            </div>
          `;
        }).join('');
      }
    }

    // 3. All Holdings Allocation Donut Chart (Dynamic Ticker Breakdown with Logos & %)
    const ctxHoldings = document.getElementById('chart-all-holdings')?.getContext('2d');
    if (ctxHoldings) {
      const tickerMap = {};
      let totalStockValue = 0;

      this.portfolios.forEach(p => {
        (p.holdings || []).forEach(h => {
          const stats = this.calculateHoldingStats(h);
          if (stats.marketValueUSD > 0) {
            const sym = h.ticker.toUpperCase().trim();
            if (!tickerMap[sym]) {
              tickerMap[sym] = { ticker: sym, marketValueUSD: 0 };
            }
            tickerMap[sym].marketValueUSD += stats.marketValueUSD;
            totalStockValue += stats.marketValueUSD;
          }
        });
      });

      const sortedHoldings = Object.values(tickerMap).sort((a, b) => b.marketValueUSD - a.marketValueUSD);

      const holdingsLabels = sortedHoldings.map(item => item.ticker);
      const holdingsValues = sortedHoldings.map(item => item.marketValueUSD);
      const palette = ['#3b82f6', '#f97316', '#a855f7', '#10b981', '#ec4899', '#eab308', '#06b6d4', '#8b5cf6', '#f43f5e', '#6366f1', '#14b8a6', '#f59e0b'];
      const holdingsColors = sortedHoldings.map((_, idx) => palette[idx % palette.length]);

      this.charts.allHoldings = new Chart(ctxHoldings, {
        type: 'doughnut',
        data: {
          labels: holdingsLabels,
          datasets: [{
            data: holdingsValues,
            backgroundColor: holdingsColors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: { legend: { display: false } }
        }
      });

      const legendEl = document.getElementById('legend-all-holdings');
      if (legendEl) {
        if (sortedHoldings.length === 0) {
          legendEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px;">ไม่มีรายการหุ้นในขณะนี้</div>`;
        } else {
          legendEl.innerHTML = sortedHoldings.map((item, idx) => {
            const pct = totalStockValue > 0 ? ((item.marketValueUSD / totalStockValue) * 100).toFixed(1) : '0.0';
            return `
              <div class="chart-legend-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="legend-color-dot" style="background: ${holdingsColors[idx]}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
                  ${this.renderStockLogoHTML(item.ticker, holdingsColors[idx], 24)}
                  <strong style="font-size: 13px; color: #fff;">${this.escapeHtml(item.ticker)}</strong>
                </div>
                <div style="text-align: right;" class="font-mono">
                  <span style="color: var(--color-emerald); font-weight: 700; font-size: 13px;">${pct}%</span>
                  <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">(${this.formatUSD(item.marketValueUSD)})</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  }

  setupDonutTabs() {
    const track = document.getElementById('donut-swipe-track');
    const tabBtns = document.querySelectorAll('.donut-tab-btn');
    const dots = document.querySelectorAll('.carousel-dot');
    const btnPrev = document.getElementById('btn-donut-prev');
    const btnNext = document.getElementById('btn-donut-next');
    const slides = document.querySelectorAll('.donut-chart-slide');

    if (!track) return;

    let currentIndex = 0;

    const goToSlide = (index) => {
      if (index < 0) index = 0;
      if (index >= slides.length) index = slides.length - 1;
      currentIndex = index;

      // Smooth scroll the track to that slide on mobile
      if (window.innerWidth <= 1024) {
        const targetSlide = slides[index];
        if (targetSlide) {
          track.scrollTo({
            left: targetSlide.offsetLeft - track.offsetLeft,
            behavior: 'smooth'
          });
        }
      }

      // Update UI active state
      slides.forEach((s, idx) => s.classList.toggle('active', idx === index));
      tabBtns.forEach((b, idx) => b.classList.toggle('active', idx === index));
      dots.forEach((d, idx) => d.classList.toggle('active', idx === index));
    };

    // Tab buttons click
    tabBtns.forEach((btn, idx) => {
      btn.addEventListener('click', () => goToSlide(idx));
    });

    // Dots click
    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => goToSlide(idx));
    });

    // Arrows click
    btnPrev?.addEventListener('click', () => goToSlide(currentIndex - 1));
    btnNext?.addEventListener('click', () => goToSlide(currentIndex + 1));

    // Scroll listener on track for Touch Swipe / Wheel
    let scrollTimeout = null;
    track.addEventListener('scroll', () => {
      if (window.innerWidth > 1024) return;
      if (scrollTimeout) clearTimeout(scrollTimeout);

      scrollTimeout = setTimeout(() => {
        const scrollLeft = track.scrollLeft;
        const width = track.clientWidth;
        if (width <= 0) return;
        const newIndex = Math.round(scrollLeft / width);

        if (newIndex >= 0 && newIndex < slides.length && newIndex !== currentIndex) {
          currentIndex = newIndex;
          slides.forEach((s, idx) => s.classList.toggle('active', idx === currentIndex));
          tabBtns.forEach((b, idx) => b.classList.toggle('active', idx === currentIndex));
          dots.forEach((d, idx) => d.classList.toggle('active', idx === currentIndex));
        }
      }, 40);
    }, { passive: true });

    // Mouse drag support for desktop/trackpad gesture
    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;

    track.addEventListener('mousedown', (e) => {
      if (window.innerWidth > 1024) return;
      isDown = true;
      track.classList.add('dragging');
      startX = e.pageX - track.offsetLeft;
      scrollLeftStart = track.scrollLeft;
    });

    track.addEventListener('mouseleave', () => {
      isDown = false;
      track.classList.remove('dragging');
    });

    track.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      track.classList.remove('dragging');
      const width = track.clientWidth;
      if (width > 0) {
        const closestIndex = Math.round(track.scrollLeft / width);
        goToSlide(closestIndex);
      }
    });

    track.addEventListener('mousemove', (e) => {
      if (!isDown || window.innerWidth > 1024) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeftStart - walk;
    });
  }

  // 2. SUB-PORTFOLIO & DIME HOLDINGS VIEW
  renderPortfoliosView(container) {
    const port = this.portfolios.find(p => p.id === this.selectedPortfolioId) || this.portfolios[0];
    if (!port) {
      container.innerHTML = '<section class="benchmark-card"><h2>เริ่มพอร์ตของคุณ</h2><p>ยังไม่มีพอร์ตหรือข้อมูลตัวอย่าง</p><button class="btn btn-primary" id="btn-empty-add-port">เพิ่มพอร์ต</button></section>';
      container.querySelector('button').onclick = () => this.openPortfolioEditModal(null);
      return;
    }

    const stats = this.calculatePortfolioStats(port);
    const dualTotal = this.formatDual(stats.totalValueUSD);
    const dualGoal = this.formatDual(stats.goalUSD);
    const dualCash = this.formatDual(stats.cashBufferUSD);
    const holdings = port.holdings || [];

    let html = `
      <!-- SUBPORTFOLIO HERO HEADER (DIME APP ACCURATE) -->
      <div class="subport-hero-header" style="--hero-theme-bg: ${port.color}15; --hero-theme-border: ${port.color}40;">
        <div class="subport-hero-top">
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${this.portfolios.map(p => `
              <button class="btn btn-sm ${p.id === port.id ? 'btn-primary' : 'btn-secondary'}" data-select-port="${p.id}" style="${p.id === port.id ? `background: ${p.color}; border-color: ${p.color};` : ''}">
                ${p.emoji || '📁'} ${p.name.split(' ')[0]}
              </button>
            `).join('')}
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-edit-current-port">⚙️ แก้ไขพอร์ต</button>
        </div>

        <div class="subport-hero-main">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 13px; color: ${port.color}; font-weight: 700; text-transform: uppercase;">${this.escapeHtml(port.tier)} • ${port.category}</span>
              ${port.timeHorizon ? `<span class="badge font-mono" style="background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: var(--radius-full); font-size: 11px; color: var(--text-secondary);">⏱️ Horizon: ${this.escapeHtml(port.timeHorizon)}</span>` : ''}
            </div>
            <h2 style="font-size: 26px; font-weight: 800; color: #fff; margin-top: 2px;">${port.emoji || ''} ${this.escapeHtml(port.name)}</h2>
            <div class="subport-target-goal-text font-mono">
              🎯 เป้าหมายพอร์ต: <strong class="text-white">${this.formatTHB(port.goalTHB || this.usdToThb(stats.goalUSD))}</strong> (${this.formatUSD(stats.goalUSD)}) • ความคืบหน้า <strong>${stats.goalProgressPct.toFixed(1)}%</strong>
            </div>
            <div class="progress-bar-bg" style="width: 280px; margin-top: 8px;">
              <div class="progress-bar-fill" style="width: ${stats.goalProgressPct}%; background: ${port.color || '#10b981'};"></div>
            </div>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 12px; color: var(--text-muted);">มูลค่ารวมของพอร์ต</div>
            <div style="font-size: 32px; font-weight: 800; color: #fff;" class="font-mono">${dualTotal.main}</div>
            <div style="font-size: 14px; color: var(--text-secondary);" class="font-mono">${dualTotal.sub}</div>
            <div class="font-mono" style="margin-top: 4px; font-size: 13px;">
              1D: <span class="${stats.avg1dChangePct >= 0 ? 'text-emerald' : 'text-rose'} font-bold">${this.formatPercent(stats.avg1dChangePct)}</span> | 
              P/L: <span class="${stats.totalPLPct >= 0 ? 'text-emerald' : 'text-rose'} font-bold">${this.formatPercent(stats.totalPLPct)} (${this.formatUSD(stats.totalPLUSD)} / ${this.formatTHB(this.usdToThb(stats.totalPLUSD))})</span>
            </div>
          </div>
        </div>

        ${port.notes ? `<div style="margin-top: 14px; padding: 8px 12px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-secondary);">📝 ${this.escapeHtml(port.notes)}</div>` : ''}
      </div>

      <!-- DEDICATED CASH BUFFER (เงินไว้ช้อน) SECTION -->
      <div class="subport-cash-buffer-box">
        <div class="cash-box-left">
          <div class="cash-box-icon">💧</div>
          <div>
            <div class="cash-box-title">Cash Buffer (เงินสดไว้ช้อนซื้อหุ้นของพอร์ตนี้)</div>
            <div class="cash-box-val font-mono">${dualCash.main}</div>
            <div class="cash-box-sub font-mono">${dualCash.sub} ${port.targetCashBufferTHB ? `• (เป้าหมาย: ${this.formatTHB(port.targetCashBufferTHB)})` : ''}</div>
          </div>
        </div>
        <div class="cash-box-actions">
          <button class="btn btn-sm btn-secondary" id="btn-manage-cash-buffer" data-port-id="${port.id}">
            <span>➕/➖ ฝาก-ถอนเงินสด</span>
          </button>
          <button class="btn btn-sm btn-primary" id="btn-quick-buy-with-cash" data-port-id="${port.id}">
            <span>🛒 ช้อนซื้อหุ้นทันที</span>
          </button>
        </div>
      </div>

      <!-- SUBPORTFOLIO HOLDINGS DONUT CHART WITH INTERACTIVE CENTER HUB -->
      ${holdings.length > 0 ? `
        <div class="chart-card subport-donut-card" style="margin-bottom: 20px;">
          <div class="chart-title" style="margin-bottom: 12px;">
            <span>🍩 สัดส่วนสินทรัพย์ย่อยในพอร์ต ${this.escapeHtml(port.name)}</span>
          </div>
          <div class="subport-donut-wrapper">
            <div class="subport-donut-canvas-box">
              <canvas id="chart-subport-holdings"></canvas>
              <div class="donut-center-hub" id="donut-center-hub">
                <div class="center-hub-logo" id="center-hub-logo">${port.emoji || '🎯'}</div>
                <div class="center-hub-ticker font-mono" id="center-hub-ticker">TOTAL</div>
                <div class="center-hub-pct font-mono" id="center-hub-pct">100%</div>
                <div class="center-hub-val font-mono" id="center-hub-val">${dualTotal.main}</div>
              </div>
            </div>
            <div class="donut-holdings-chips-scroll" id="legend-subport-holdings"></div>
          </div>
        </div>
      ` : ''}

      <!-- HOLDINGS LIST HEADER -->
      <div class="section-header">
        <div class="section-title">
          <span>รายการสินทรัพย์ที่ถือครอง</span>
          <span class="section-count-badge font-mono">${(port.holdings || []).length} ตัว</span>
        </div>
        <div class="holdings-header-actions">
          <div class="holdings-view-pill">
            <button type="button" class="holdings-view-btn ${this.holdingsViewLayout !== 'full' ? 'active' : ''}" data-holdings-layout="compact" title="รายการกระชับแบบย่อ">📋 กระชับ</button>
            <button type="button" class="holdings-view-btn ${this.holdingsViewLayout === 'full' ? 'active' : ''}" data-holdings-layout="full" title="การ์ดขยายเต็ม">🎴 การ์ดเต็ม</button>
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-add-holding-modal">
            <span>➕ เพิ่มหุ้นในพอร์ตนี้</span>
          </button>
        </div>
      </div>

      <!-- HOLDINGS CONTAINER (COMPACT ROWS OR FULL CARDS) -->
      <div class="holdings-container" id="subport-holdings-container">
        ${this.renderHoldingsLayoutHTML(port, holdings, stats)}
      </div>
    `;

    container.innerHTML = html;

    // Holdings Layout Switcher click
    container.querySelectorAll('[data-holdings-layout]').forEach(btn => {
      btn.addEventListener('click', () => {
        const layout = btn.getAttribute('data-holdings-layout');
        this.holdingsViewLayout = layout;
        localStorage.setItem('pixel_holdings_layout', layout);
        container.querySelectorAll('[data-holdings-layout]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const listEl = document.getElementById('subport-holdings-container');
        if (listEl) {
          listEl.innerHTML = this.renderHoldingsLayoutHTML(port, holdings, stats);
          this.bindHoldingsListEvents(container, port);
        }
      });
    });

    this.bindHoldingsListEvents(container, port);

    setTimeout(() => {
      this.initSubportCharts(port);
    }, 50);
  }

  renderHoldingsLayoutHTML(port, holdings, stats) {
    if (holdings.length === 0) {
      return `
        <div style="text-align: center; padding: 48px 20px; background: var(--bg-card); border-radius: var(--radius-lg); color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 8px;">🛒</div>
          <h3>ยังไม่มีรายการหุ้นในพอร์ตนี้</h3>
          <p style="font-size: 13px; margin-top: 4px;">คลิกปุ่ม "➕ เพิ่มหุ้นในพอร์ตนี้" เพื่อเริ่มจดสินทรัพย์</p>
        </div>
      `;
    }

    const isCompact = this.holdingsViewLayout !== 'full';

    if (isCompact) {
      return holdings.map(h => {
        const s = this.calculateHoldingStats(h);
        const dualMarket = this.formatDual(s.marketValueUSD);
        const weightPct = stats.totalValueUSD > 0 ? ((s.marketValueUSD / stats.totalValueUSD) * 100).toFixed(2) : '0.00';
        const targetProgressPct = h.targetTHB > 0 ? Math.min(100, Math.max(0, (s.marketValueTHB / h.targetTHB) * 100)) : null;

        const dip1 = h.dipTarget1 || h.dipTargetUSD || 0;
        const dip2 = h.dipTarget2 || 0;
        const dip3 = h.dipTarget3 || 0;

        const isDip3 = dip3 > 0 && s.currentPrice > 0 && s.currentPrice <= dip3;
        const isDip2 = !isDip3 && dip2 > 0 && s.currentPrice > 0 && s.currentPrice <= dip2;
        const isDip1 = !isDip3 && !isDip2 && dip1 > 0 && s.currentPrice > 0 && s.currentPrice <= dip1;
        const isDipActive = isDip1 || isDip2 || isDip3;

        let dipBadgeText = '';
        if (isDip3) dipBadgeText = `🔥 ไม้ 3`;
        else if (isDip2) dipBadgeText = `🔥 ไม้ 2`;
        else if (isDip1) dipBadgeText = `🎯 ไม้ 1`;

        const hasAnyDip = (dip1 > 0 || dip2 > 0 || dip3 > 0);
        const isUp = s.change1d >= 0;

        return `
          <div class="holding-compact-item ${isDipActive ? 'dip-active' : ''}" data-holding-id="${h.id}">
            <div class="holding-compact-main">
              <div class="holding-compact-left">
                ${this.renderStockLogoHTML(h.ticker, port.color || '#10b981', 34)}
                <div class="holding-compact-names">
                  <div class="holding-compact-sym-row">
                    <strong class="holding-compact-sym font-mono">${this.escapeHtml(h.ticker)}</strong>
                    ${isDipActive ? `<span class="dip-alert-badge small font-mono">${dipBadgeText}</span>` : ''}
                  </div>
                  <div class="holding-compact-sub font-mono">
                    $${s.currentPrice.toFixed(2)} 
                    <span class="${isUp ? 'text-emerald' : 'text-rose'}">(${isUp ? '+' : ''}${s.change1d.toFixed(2)}%)</span>
                    <span class="text-muted">• ${s.shares} หุ้น</span>
                  </div>
                </div>
              </div>

              <div class="holding-compact-right">
                <div class="holding-compact-val font-mono">${dualMarket.main}</div>
                <div class="holding-compact-pl font-mono ${s.unrealizedPLUSD >= 0 ? 'text-emerald' : 'text-rose'}">
                  ${s.unrealizedPLUSD >= 0 ? '▲ +' : '▼ '}${Math.abs(s.unrealizedPLPct).toFixed(1)}% (${this.formatUSD(s.unrealizedPLUSD)})
                </div>
              </div>

              <div class="holding-compact-actions-pill">
                <button type="button" class="btn-compact-quick-buy" data-trade-holding="${h.id}" data-port-id="${port.id}" title="ซื้อ-ขาย">
                  <span>⚡</span>
                </button>
                <button type="button" class="btn-compact-expand" title="ขยายดูรายละเอียด">
                  <span class="expand-icon">▼</span>
                </button>
              </div>
            </div>

            <!-- EXPANDED DRAWER -->
            <div class="holding-compact-drawer">
              <div class="dime-metrics-grid font-mono compact-metrics">
                <div class="metric-cell">
                  <span class="metric-cell-label">ต้นทุนต่อหุ้นเฉลี่ย (Avg Cost)</span>
                  <span class="metric-cell-val">$${s.avgCost.toFixed(4)}</span>
                </div>
                <div class="metric-cell" style="text-align: right;">
                  <span class="metric-cell-label">ต้นทุนรวม (Total Cost)</span>
                  <span class="metric-cell-val">${this.formatUSD(s.totalCostUSD)}</span>
                </div>
                <div class="metric-cell">
                  <span class="metric-cell-label">สัดส่วนในพอร์ตนี้</span>
                  <span class="metric-cell-val">${weightPct}%</span>
                </div>
                <div class="metric-cell" style="text-align: right;">
                  <span class="metric-cell-label">จำนวนหุ้นคงเหลือ</span>
                  <span class="metric-cell-val">${s.shares.toFixed(7)}</span>
                </div>
              </div>

              ${hasAnyDip ? `
                <div class="dip-targets-pill-row font-mono" style="margin-top: 8px;">
                  ${dip1 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip1 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 1: $${dip1.toFixed(2)}</span>` : ''}
                  ${dip2 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip2 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 2: $${dip2.toFixed(2)}</span>` : ''}
                  ${dip3 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip3 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 3: $${dip3.toFixed(2)}</span>` : ''}
                </div>
              ` : ''}

              ${h.targetTHB ? `
                <div style="margin-top: 8px; padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;" class="font-mono">
                    <span style="color: var(--text-secondary);">🎯 เป้าหมาย: <strong class="text-white">${this.formatTHB(h.targetTHB)} (${this.formatUSD(h.targetTHB / this.exchangeRate)})</strong></span>
                    <strong class="${(s.marketValueTHB >= h.targetTHB) ? 'text-emerald' : 'text-amber'}">${((s.marketValueTHB / h.targetTHB) * 100).toFixed(1)}%</strong>
                  </div>
                  <div class="progress-bar-bg" style="height: 4px;">
                    <div class="progress-bar-fill" style="width: ${targetProgressPct}%; background: ${port.color || '#10b981'};"></div>
                  </div>
                </div>
              ` : ''}

              <div class="holding-compact-drawer-actions">
                <button class="btn btn-sm btn-secondary" data-edit-holding="${h.id}" data-port-id="${port.id}">✏️ แก้ไขข้อมูล</button>
                <button class="btn btn-sm btn-primary" data-trade-holding="${h.id}" data-port-id="${port.id}">⚡ ซื้อ-ขายด่วน</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Full Cards Mode
    return holdings.map(h => {
      const s = this.calculateHoldingStats(h);
      const dualMarket = this.formatDual(s.marketValueUSD);
      const weightPct = stats.totalValueUSD > 0 ? ((s.marketValueUSD / stats.totalValueUSD) * 100).toFixed(2) : '0.00';
      const targetProgressPct = h.targetTHB > 0 ? Math.min(100, Math.max(0, (s.marketValueTHB / h.targetTHB) * 100)) : null;

      const dip1 = h.dipTarget1 || h.dipTargetUSD || 0;
      const dip2 = h.dipTarget2 || 0;
      const dip3 = h.dipTarget3 || 0;

      const isDip3 = dip3 > 0 && s.currentPrice > 0 && s.currentPrice <= dip3;
      const isDip2 = !isDip3 && dip2 > 0 && s.currentPrice > 0 && s.currentPrice <= dip2;
      const isDip1 = !isDip3 && !isDip2 && dip1 > 0 && s.currentPrice > 0 && s.currentPrice <= dip1;
      const isDipActive = isDip1 || isDip2 || isDip3;

      let dipBadgeText = '';
      if (isDip3) dipBadgeText = `🔥 ถึงจุดช้อนไม้ 3 ($${s.currentPrice.toFixed(2)} ≤ $${dip3.toFixed(2)})`;
      else if (isDip2) dipBadgeText = `🔥 ถึงจุดช้อนไม้ 2 ($${s.currentPrice.toFixed(2)} ≤ $${dip2.toFixed(2)})`;
      else if (isDip1) dipBadgeText = `🎯 ถึงจุดช้อนไม้ 1 ($${s.currentPrice.toFixed(2)} ≤ $${dip1.toFixed(2)})`;

      const hasAnyDip = (dip1 > 0 || dip2 > 0 || dip3 > 0);

      return `
        <div class="holding-card ${isDipActive ? 'dip-active' : ''}">
          <div class="holding-header">
            <div class="holding-ticker-group">
              ${this.renderStockLogoHTML(h.ticker, port.color || '#10b981', 42)}
              <div class="ticker-name-box">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h4 style="margin: 0;">${this.escapeHtml(h.ticker)}</h4>
                  ${isDipActive ? `<span class="dip-alert-badge">${dipBadgeText}</span>` : ''}
                </div>
                <div class="ticker-subname">${h.name || h.ticker}</div>
                ${hasAnyDip ? `
                  <div class="dip-targets-pill-row font-mono">
                    ${dip1 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip1 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 1: $${dip1.toFixed(2)}</span>` : ''}
                    ${dip2 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip2 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 2: $${dip2.toFixed(2)}</span>` : ''}
                    ${dip3 > 0 ? `<span class="dip-tier-pill ${s.currentPrice <= dip3 && s.currentPrice > 0 ? 'hit' : ''}">🎯 ไม้ 3: $${dip3.toFixed(2)}</span>` : ''}
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="holding-value-group">
              <div class="holding-market-val-thb font-mono">${dualMarket.main}</div>
              <div class="holding-market-val-usd font-mono">${dualMarket.sub}</div>
              <div class="holding-weight-tag font-mono">สัดส่วน: ${weightPct}%</div>
              <div class="holding-pl-badge font-mono ${s.unrealizedPLUSD >= 0 ? 'text-emerald' : 'text-rose'}">
                ${s.unrealizedPLUSD >= 0 ? '↗ +' : '↘ '}${this.formatPercent(s.unrealizedPLPct)} (${this.formatUSD(s.unrealizedPLUSD)} / ${this.formatTHB(this.usdToThb(s.unrealizedPLUSD))})
              </div>
            </div>
          </div>

          <div class="dime-metrics-grid font-mono">
            <div class="metric-cell">
              <span class="metric-cell-label">จำนวนหุ้นคงเหลือ (Shares)</span>
              <span class="metric-cell-val">${s.shares.toFixed(7)}</span>
            </div>
            <div class="metric-cell" style="text-align: right;">
              <span class="metric-cell-label">ราคาตลาด ($) และ % 1 วัน</span>
              <span class="metric-cell-val ${s.change1d >= 0 ? 'text-emerald' : 'text-rose'}">
                $${s.currentPrice.toFixed(2)} (${this.formatPercent(s.change1d)})
              </span>
            </div>
            <div class="metric-cell">
              <span class="metric-cell-label">ต้นทุนต่อหุ้นเฉลี่ย (Avg Cost)</span>
              <span class="metric-cell-val">$${s.avgCost.toFixed(4)}</span>
            </div>
            <div class="metric-cell" style="text-align: right;">
              <span class="metric-cell-label">ต้นทุนรวม (Total Cost)</span>
              <span class="metric-cell-val">${this.formatUSD(s.totalCostUSD)}</span>
            </div>
          </div>

          ${h.targetTHB ? `
            <div style="margin: -6px 0 16px 0; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;" class="font-mono">
                <span style="color: var(--text-secondary);">🎯 เป้าหมาย: <strong class="text-white">${this.formatTHB(h.targetTHB)} (${this.formatUSD(h.targetTHB / this.exchangeRate)})</strong></span>
                <strong class="${(s.marketValueTHB >= h.targetTHB) ? 'text-emerald' : 'text-amber'}">${((s.marketValueTHB / h.targetTHB) * 100).toFixed(1)}%</strong>
              </div>
              <div class="progress-bar-bg" style="height: 5px;">
                <div class="progress-bar-fill" style="width: ${targetProgressPct}%; background: ${port.color || '#10b981'};"></div>
              </div>
            </div>
          ` : ''}

          <div class="holding-actions-row">
            <button class="btn btn-sm btn-secondary" data-edit-holding="${h.id}" data-port-id="${port.id}">✏️ แก้ไข</button>
            <button class="btn btn-sm btn-primary" data-trade-holding="${h.id}" data-port-id="${port.id}">⚡ ซื้อ-ขาย</button>
          </div>
        </div>
      `;
    }).join('');
  }

  bindHoldingsListEvents(container, port) {
    // Accordion Toggle on Compact Rows
    container.querySelectorAll('.holding-compact-main').forEach(mainRow => {
      mainRow.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // ignore buttons inside
        const item = mainRow.closest('.holding-compact-item');
        if (item) item.classList.toggle('expanded');
      });
    });

    // Expand button click
    container.querySelectorAll('.btn-compact-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.holding-compact-item');
        if (item) item.classList.toggle('expanded');
      });
    });

    // Edit Holding Buttons
    container.querySelectorAll('[data-edit-holding]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hid = btn.getAttribute('data-edit-holding');
        const pid = btn.getAttribute('data-port-id');
        this.openHoldingModal(hid, pid);
      });
    });

    // Trade Holding Buttons
    container.querySelectorAll('[data-trade-holding]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hid = btn.getAttribute('data-trade-holding');
        const pid = btn.getAttribute('data-port-id');
        this.openTradeModalForHolding(hid, pid);
      });
    });
  }

  initSubportCharts(port) {
    const ctxSub = document.getElementById('chart-subport-holdings')?.getContext('2d');
    if (!ctxSub || !port || !port.holdings || port.holdings.length === 0) return;

    const holdingsStats = port.holdings.map(h => {
      const stats = this.calculateHoldingStats(h);
      return {
        ticker: h.ticker,
        name: h.name || h.ticker,
        marketValueUSD: stats.marketValueUSD,
        marketValueTHB: stats.marketValueTHB
      };
    }).filter(h => h.marketValueUSD > 0).sort((a, b) => b.marketValueUSD - a.marketValueUSD);

    const totalUSD = holdingsStats.reduce((sum, h) => sum + h.marketValueUSD, 0);
    const labels = holdingsStats.map(h => h.ticker);
    const dataValues = holdingsStats.map(h => h.marketValueUSD);
    const palette = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#3b82f6', '#f97316', '#06b6d4', '#84cc16'];
    const colors = holdingsStats.map((_, idx) => palette[idx % palette.length]);

    if (this.charts.subport) {
      this.charts.subport.destroy();
    }

    const centerHubLogo = document.getElementById('center-hub-logo');
    const centerHubTicker = document.getElementById('center-hub-ticker');
    const centerHubPct = document.getElementById('center-hub-pct');
    const centerHubVal = document.getElementById('center-hub-val');

    const updateCenterHub = (item, color) => {
      if (!item) return;
      const pct = totalUSD > 0 ? ((item.marketValueUSD / totalUSD) * 100).toFixed(1) : '0.0';
      if (centerHubLogo) centerHubLogo.innerHTML = this.renderStockLogoHTML(item.ticker, color || '#10b981', 24);
      if (centerHubTicker) centerHubTicker.textContent = item.ticker;
      if (centerHubPct) centerHubPct.textContent = `${pct}%`;
      if (centerHubVal) centerHubVal.textContent = this.formatUSD(item.marketValueUSD);
    };

    // Default to first (largest) holding
    if (holdingsStats.length > 0) {
      updateCenterHub(holdingsStats[0], colors[0]);
    }

    // Leader lines & Logo Callout Plugin (Dime App / iOS Financial Style)
    const subportLeaderLinesPlugin = {
      id: 'subportLeaderLines',
      afterDraw: (chart) => {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;

        const dataset = chart.data.datasets[0];
        const total = dataset.data.reduce((a, b) => a + b, 0);
        if (total <= 0) return;

        ctx.save();

        const labelsInfo = [];

        // 1. Calculate raw geometric points
        meta.data.forEach((element, i) => {
          const val = dataset.data[i];
          if (val <= 0) return;
          const { startAngle, endAngle, outerRadius, x: cx, y: cy } = element;
          const midAngle = (startAngle + endAngle) / 2;
          const cos = Math.cos(midAngle);
          const sin = Math.sin(midAngle);
          const isRight = cos >= 0;

          const pct = ((val / total) * 100).toFixed(1);
          const ticker = chart.data.labels[i] || '';
          const color = dataset.backgroundColor[i] || '#38bdf8';

          const r0 = outerRadius;
          const x0 = cx + cos * r0;
          const y0 = cy + sin * r0;

          const r1 = outerRadius + 12;
          const x1 = cx + cos * r1;
          const y1 = cy + sin * r1;

          const elbowLength = 16;
          const x2 = isRight ? (x1 + elbowLength) : (x1 - elbowLength);
          const y2 = y1;

          labelsInfo.push({
            i,
            ticker,
            pct,
            color,
            isRight,
            x0, y0,
            x1, y1,
            x2, y2,
            cx, cy
          });
        });

        // 2. Adjust vertical y2 spacing on both sides to prevent overlapping
        ['right', 'left'].forEach(side => {
          const items = labelsInfo.filter(l => (side === 'right' ? l.isRight : !l.isRight));
          items.sort((a, b) => a.y1 - b.y1);
          const minGap = 19;
          for (let k = 1; k < items.length; k++) {
            if (items[k].y2 - items[k - 1].y2 < minGap) {
              items[k].y2 = items[k - 1].y2 + minGap;
              items[k].y1 = items[k].y2;
            }
          }
        });

        // 3. Render Leader Lines, Anchor Dots, and Ticker Badges
        labelsInfo.forEach(item => {
          const { color, isRight, x0, y0, x1, y2, x2, ticker, pct } = item;

          // Anchor dot on ring rim
          ctx.beginPath();
          ctx.arc(x0, y0, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          // Pointer Line (Rim -> Radial -> Horizontal Elbow)
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y2);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          // End pointer dot
          ctx.beginPath();
          ctx.arc(x2, y2, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          // Mini circular logo badge
          const badgeSize = 13;
          const badgeX = isRight ? (x2 + 4) : (x2 - 4 - badgeSize);
          const badgeY = y2 - badgeSize / 2;

          ctx.beginPath();
          ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = `${color}30`;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = color;
          ctx.stroke();

          // Mini badge letter
          ctx.font = 'bold 7.5px Kanit, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ticker.slice(0, 2), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 0.5);

          // Bold Ticker & % Text
          ctx.font = 'bold 10.5px JetBrains Mono, Kanit, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.textAlign = isRight ? 'left' : 'right';

          const textX = isRight ? (badgeX + badgeSize + 4) : (badgeX - 4);
          ctx.fillText(`${ticker} ${pct}%`, textX, y2);
        });

        ctx.restore();
      }
    };

    this.charts.subport = new Chart(ctxSub, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#0f172a',
          hoverOffset: 6
        }]
      },
      plugins: [subportLeaderLinesPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '80%',
        layout: {
          padding: {
            top: 20,
            bottom: 20,
            left: 68,
            right: 68
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const idx = context.dataIndex;
                const item = holdingsStats[idx];
                const pct = totalUSD > 0 ? ((item.marketValueUSD / totalUSD) * 100).toFixed(1) : '0.0';
                return ` ${this.escapeHtml(item.ticker)}: ${pct}% (${this.formatUSD(item.marketValueUSD)})`;
              }
            }
          }
        },
        onHover: (event, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            updateCenterHub(holdingsStats[idx], colors[idx]);
          }
        }
      }
    });

    const legendEl = document.getElementById('legend-subport-holdings');
    if (legendEl) {
      legendEl.innerHTML = holdingsStats.map((item, idx) => {
        const pct = totalUSD > 0 ? ((item.marketValueUSD / totalUSD) * 100).toFixed(1) : '0.0';
        return `
          <button type="button" class="subport-legend-chip font-mono" data-chip-index="${idx}" title="${this.escapeHtml(item.name)}">
            <span class="legend-color-dot" style="background: ${colors[idx]};"></span>
            ${this.renderStockLogoHTML(item.ticker, colors[idx], 16)}
            <strong>${this.escapeHtml(item.ticker)}</strong>
            <span class="text-emerald">${pct}%</span>
          </button>
        `;
      }).join('');

      legendEl.querySelectorAll('.subport-legend-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const idx = parseInt(chip.getAttribute('data-chip-index'), 10);
          if (holdingsStats[idx]) {
            updateCenterHub(holdingsStats[idx], colors[idx]);
          }
        });
      });
    }
  }

  // 3. FOREX & OPTION MONTHLY CAPITAL JOURNAL VIEW
  renderTradingView(container) {
    const { balances, totalTradingUSD } = this.getTradingLatestBalances();
    const dualTotal = this.formatDual(totalTradingUSD);

    let html = `
      <div class="dime-hero-banner" style="background: linear-gradient(135deg, #2d1808 0%, #171108 40%, #0f131a 100%); border-color: rgba(245, 158, 11, 0.3);">
        <div class="dime-hero-header">
          <span class="dime-hero-label text-amber">พอร์ตเทรดกระแสเงินสด (Forex & Option Trading)</span>
        </div>
        <div class="dime-main-value font-mono">${dualTotal.main}</div>
        <div class="dime-sub-value font-mono">${dualTotal.sub} • อัปเดตเฉพาะยอดเงินรวมรายเดือน (USD)</div>
      </div>

      <!-- SECTION HEADER WITH ADD TRADING PORTFOLIO BUTTON -->
      <div class="section-header">
        <div class="section-title">
          <span>รายการพอร์ตเทรด (Trading Accounts)</span>
          <span class="section-count-badge font-mono">${Object.keys(this.tradingData || {}).length} พอร์ต</span>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-add-trading-port-modal">
          <span>➕ เพิ่มพอร์ตเทรดใหม่</span>
        </button>
      </div>

      <div class="trading-summary-cards">
    `;

    for (const [key, item] of Object.entries(this.tradingData || {})) {
      const list = item.monthlyBalances || [];
      const latest = list.length > 0 ? list[list.length - 1] : { balanceUSD: 0, note: '' };
      const latestUSD = latest.balanceUSD || 0;

      html += `
        <div class="trading-port-card" style="border-top: 3px solid ${item.color || '#38bdf8'};">
          <div class="trading-port-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="trading-title">${this.escapeHtml(item.name)}</span>
              <button class="btn-icon-xs" data-edit-trading-port="${key}" title="แก้ไขชื่อหรือลบพอร์ต">⚙️ แก้ไข/ลบ</button>
            </div>
            <span class="badge font-mono text-amber">Latest: ${this.formatUSD(latestUSD)}</span>
          </div>

          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">ยอดเงินทุนปัจจุบัน ($ USD)</div>
          <input type="number" step="any" class="trading-balance-input font-mono" data-trading-key="${key}" value="${latestUSD}">
          <div class="font-mono" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            ≈ ${this.formatTHB(this.usdToThb(latestUSD))}
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" data-save-trading-key="${key}">💾 บันทึกยอดเงิน</button>
            <button class="btn btn-sm btn-secondary" data-log-trading-history="${key}">📅 ประวัติรายเดือน</button>
            <button class="btn btn-sm btn-secondary" data-trading-cash="${key}">เงินเติม/ถอน</button>
          </div>
        </div>
      `;
    }

    html += `
      </div>

      <!-- TRADING EQUITY CURVE CHART -->
      <div class="chart-card">
        <div class="chart-title">
          <span>📈 กราฟการเติบโตของทุนเทรดรายเดือน (Trading Capital Growth)</span>
        </div>
        <div class="chart-canvas-container" style="height: 280px;">
          <canvas id="chart-trading-equity"></canvas>
        </div>
      </div>

      <!-- DIME TRADE JOURNAL & PSYCHOLOGY LOG -->
      <div class="chart-card" style="margin-top: 24px;">
        <div class="chart-title">
          <span>📓 บันทึกประวัติการซื้อ-ขาย & จิตวิทยา (Trade Journal)</span>
          <span class="badge font-mono" style="background:rgba(168,85,247,0.2); color:#c084fc;">${(this.tradingHistory || []).length} รายการ</span>
        </div>
        <div class="trading-journal-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
          ${this.renderTradingHistoryHTML()}
        </div>
      </div>
    `;

    container.innerHTML = html;

    setTimeout(() => {
      this.initTradingChart();
    }, 50);
  }

  renderTradingHistoryHTML() {
    const list = this.tradingHistory || [];
    if (list.length === 0) {
      return `<div style="text-align: center; color: var(--text-muted); padding: 18px; font-size: 13px;">ยังไม่มีประวัติการซื้อ-ขาย (เมื่อคุณกดซื้อ/ขายในแอป ประวัติและแท็กจิตวิทยาจะมาแสดงที่นี่)</div>`;
    }

    return list.slice(0, 20).map(item => {
      const isBuy = item.type === 'BUY';
      const dateStr = item.date ? new Date(item.date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="trading-journal-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; background: ${isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${isBuy ? '#34d399' : '#f87171'}; border: 1px solid ${isBuy ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};">
              ${isBuy ? '🟢 BUY' : '🔴 SELL'}
            </span>
            <strong class="font-mono text-white" style="font-size: 14px;">${this.escapeHtml(item.ticker)}</strong>
            <span style="font-size: 11px; color: var(--text-muted);">${item.portfolioName || ''}</span>
            ${item.psychologyTag ? `<span class="psychology-badge-pill">${this.escapeHtml(item.psychologyTag)}</span>` : ''}
          </div>

          <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
            <div class="font-mono" style="font-size: 13px; color: #fff;">
              ${item.shares} หุ้น @ $${Number(item.priceUSD || 0).toFixed(2)} = <strong>$${Number(item.totalUSD || 0).toFixed(2)}</strong>
            </div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${dateStr}</span>
          </div>

          ${item.note ? `<div style="width: 100%; font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; padding-left: 4px;">📝 ${this.escapeHtml(item.note)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  initTradingChart() {
    const ctx = document.getElementById('chart-trading-equity')?.getContext('2d');
    if (!ctx) return;

    // Collect all unique sorted months
    const monthSet = new Set();
    for (const item of Object.values(this.tradingData || {})) {
      (item.monthlyBalances || []).forEach(m => {
        monthSet.add(`${m.year}-${String(m.month).padStart(2, '0')}`);
      });
    }

    let labels = Array.from(monthSet).sort();
    if (labels.length === 0) {
      labels = ['2026-06', '2026-07', '2026-08'];
    }

    const defaultColors = ['#38bdf8', '#f43f5e', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];
    const datasets = [];

    let colorIdx = 0;
    for (const [key, item] of Object.entries(this.tradingData || {})) {
      const color = item.color || defaultColors[colorIdx % defaultColors.length];
      colorIdx++;

      const monthMap = {};
      (item.monthlyBalances || []).forEach(m => {
        monthMap[`${m.year}-${String(m.month).padStart(2, '0')}`] = m.balanceUSD;
      });

      const data = labels.map(lbl => monthMap[lbl] !== undefined ? monthMap[lbl] : null);

      datasets.push({
        label: item.name,
        data,
        borderColor: color,
        backgroundColor: color + '20',
        fill: true,
        spanGaps: true,
        tension: 0.3
      });
    }

    this.charts.trading = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { callback: v => '$' + v }
          },
          x: { grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // --- 4. DIVIDEND TRACKER & MULTI-YEAR ACTUAL VS FORECAST ENGINE ---
  getDividendAvailableYears() {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(currentYear + 1);
    (this.dividends || []).forEach(d => {
      if (d.date) {
        const y = parseInt(d.date.split('-')[0], 10);
        if (!isNaN(y) && y > 2000 && y < 2100) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }

  getYearDividendStats(targetYear) {
    const year = targetYear || this.selectedDividendYear || new Date().getFullYear();
    const yearDivs = (this.dividends || []).filter(d => d.date && d.date.startsWith(String(year)));
    
    let yearGrossUSD = 0;
    let yearTaxUSD = 0;
    let yearNetUSD = 0;
    const monthlyActualUSD = Array(12).fill(0);

    yearDivs.forEach(d => {
      const gross = parseFloat(d.grossUSD) || 0;
      const tax = parseFloat(d.taxUSD) || 0;
      const net = parseFloat(d.netUSD) || (gross - tax);
      yearGrossUSD += gross;
      yearTaxUSD += tax;
      yearNetUSD += net;

      const monthIdx = parseInt(d.date.split('-')[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        monthlyActualUSD[monthIdx] += net;
      }
    });

    return {
      year,
      yearDivs,
      yearGrossUSD,
      yearTaxUSD,
      yearNetUSD,
      monthlyActualUSD
    };
  }

  renderDividendsView(container) {
    const currentYear = new Date().getFullYear();
    this.selectedDividendYear = this.selectedDividendYear || currentYear;
    this.dividendTableFilter = this.dividendTableFilter || 'all';

    const availableYears = this.getDividendAvailableYears();
    const yearStats = this.getYearDividendStats(this.selectedDividendYear);

    // All-time totals
    let allTimeGrossUSD = 0;
    let allTimeTaxUSD = 0;
    let allTimeNetUSD = 0;
    this.dividends.forEach(d => {
      allTimeGrossUSD += parseFloat(d.grossUSD) || 0;
      allTimeTaxUSD += parseFloat(d.taxUSD) || 0;
      allTimeNetUSD += parseFloat(d.netUSD) || 0;
    });

    const grand = this.calculateGrandTotalStats();
    
    // Estimate Forward Annual Dividend Run-Rate based on current holdings
    let estAnnualUSD = 0;
    let totalCostUSD = 0;


    this.portfolios.forEach(p => {
      const isDivPort = (p.id || '').includes('dividend') || (p.category || '').includes('Dividend');
      (p.holdings || []).forEach(h => {
        const stats = this.calculateHoldingStats(h);
        if (stats.marketValueUSD > 0) {
          totalCostUSD += stats.totalCostUSD;
          const sym = h.ticker.replace('.BK', '').toUpperCase();
          const yld = (Number(h.dividendYield) || 0) / 100;
          estAnnualUSD += (stats.marketValueUSD * yld);
        }
      });
    });


    const estMonthlyUSD = estAnnualUSD / 12;
    const yearAvgMonthlyUSD = yearStats.yearNetUSD / 12;
    const yocPct = totalCostUSD > 0 ? (estAnnualUSD / totalCostUSD) * 100 : (grand.totalStocksUSD > 0 ? (estAnnualUSD / grand.totalStocksUSD) * 100 : 0);
    const achievePct = estAnnualUSD > 0 ? Math.min(999, (yearStats.yearNetUSD / estAnnualUSD) * 100) : 0;

    const dualYearNet = this.formatDual(yearStats.yearNetUSD);
    const dualAllTime = this.formatDual(allTimeNetUSD);

    // Filter displayed dividends
    const displayedDividends = this.dividendTableFilter === 'year' 
      ? yearStats.yearDivs 
      : this.dividends;

    let html = `
      <!-- YEAR NAVIGATOR & TIMELINE SELECTOR -->
      <div class="div-year-nav-card">
        <div class="div-year-nav-left">
          <span class="div-year-label">🗓️ ปีที่ต้องการดูข้อมูล:</span>
          <button class="btn-div-year-arrow" id="btn-prev-div-year" title="ปีก่อนหน้า">◀</button>
          <div class="div-year-pills font-mono">
            ${availableYears.map(y => `
              <button type="button" class="div-year-pill ${y === this.selectedDividendYear ? 'active' : ''}" data-div-year="${y}">
                ${y} ${y === currentYear ? '<span class="pill-badge-now">ปัจจุบัน</span>' : ''}
              </button>
            `).join('')}
          </div>
          <button class="btn-div-year-arrow" id="btn-next-div-year" title="ปีถัดไป">▶</button>
        </div>
        <div class="div-year-nav-right">
          <select id="select-div-year" class="form-select font-mono" style="padding: 6px 12px; font-size: 13px; width: auto;">
            ${availableYears.map(y => `
              <option value="${y}" ${y === this.selectedDividendYear ? 'selected' : ''}>ปี ${y} ${y === currentYear ? '(ปัจจุบัน)' : ''}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- HERO BANNER: SELECTED YEAR VS ALL-TIME -->
      <div class="dime-hero-banner" style="background: linear-gradient(135deg, #0e291e 0%, #0d1e17 40%, #0f131a 100%);">
        <div class="dime-hero-header">
          <span class="dime-hero-label text-emerald">💵 ปันผลรับจริงในปี ${this.selectedDividendYear} (Net Dividends)</span>
          <span class="dime-timestamp font-mono">สุทธิสะสมตลอดกาล: ${dualAllTime.main} (${dualAllTime.sub})</span>
        </div>
        <div class="dime-main-value font-mono">${dualYearNet.main}</div>
        <div class="dime-sub-value font-mono">${dualYearNet.sub} (เข้ากระเป๋าจริงในปี ${this.selectedDividendYear})</div>
      </div>

      <!-- PASSIVE INCOME RUN-RATE CARDS -->
      <div class="runrate-grid">
        <div class="runrate-card">
          <div class="runrate-label">💵 รับจริงปี ${this.selectedDividendYear}</div>
          <div class="runrate-val text-emerald">${this.formatUSD(yearStats.yearNetUSD)}</div>
          <div class="runrate-sub">≈ ${this.formatTHB(this.usdToThb(yearStats.yearNetUSD))}</div>
        </div>
        <div class="runrate-card">
          <div class="runrate-label">📊 คาดการณ์ทั้งปี (Forecast)</div>
          <div class="runrate-val text-cyan" style="color: #38bdf8;">${this.formatUSD(estAnnualUSD)}</div>
          <div class="runrate-sub">≈ ${this.formatTHB(this.usdToThb(estAnnualUSD))} / ปี</div>
        </div>
        <div class="runrate-card">
          <div class="runrate-label">📆 เฉลี่ยต่อเดือนที่รับจริง</div>
          <div class="runrate-val text-purple">${this.formatUSD(yearAvgMonthlyUSD)}</div>
          <div class="runrate-sub">≈ ${this.formatTHB(this.usdToThb(yearAvgMonthlyUSD))} / เดือน</div>
        </div>
        <div class="runrate-card">
          <div class="runrate-label">🎯 บรรลุเป้าหมายปี ${this.selectedDividendYear}</div>
          <div class="runrate-val font-bold" style="color: ${achievePct >= 100 ? '#10b981' : '#f59e0b'};">${achievePct.toFixed(1)}%</div>
          <div class="runrate-sub">เทียบเป้าหมายคาดการณ์</div>
        </div>
      </div>

      <!-- 12-MONTH ACTUAL VS FORECAST DUAL-BAR CHART -->
      <div class="chart-card" style="margin-bottom: 24px;">
        <div class="chart-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span>📊 ปฏิทินเปรียบเทียบปันผลรับจริง VS คาดการณ์ (${this.selectedDividendYear})</span>
          <div class="chart-legend-pills font-mono" style="display: flex; gap: 12px; font-size: 11px;">
            <span style="display: inline-flex; align-items: center; gap: 5px;">
              <span style="width: 10px; height: 10px; background: #10b981; border-radius: 2px; display: inline-block;"></span>
              <strong>รับจริง (Actual)</strong>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 5px;">
              <span style="width: 10px; height: 10px; background: rgba(56, 189, 248, 0.45); border: 1px solid #38bdf8; border-radius: 2px; display: inline-block;"></span>
              <strong>คาดการณ์ (Forecast)</strong>
            </span>
          </div>
        </div>
        <div class="chart-canvas-container" style="height: 270px;">
          <canvas id="chart-dividend-forecast"></canvas>
        </div>
      </div>

      <div class="section-header">
        <div class="section-title">
          <span>ประวัติการรับเงินปันผลรับเข้าพอร์ต</span>
          <div class="div-table-filters" style="display: inline-flex; gap: 6px; margin-left: 10px;">
            <button type="button" class="btn-filter-pill ${this.dividendTableFilter === 'all' ? 'active' : ''}" data-div-filter="all">
              🌟 ทั้งหมด (${this.dividends.length})
            </button>
            <button type="button" class="btn-filter-pill ${this.dividendTableFilter === 'year' ? 'active' : ''}" data-div-filter="year">
              🗓️ เฉพาะปี ${this.selectedDividendYear} (${yearStats.yearDivs.length})
            </button>
          </div>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-add-dividend-modal">
          <span>➕ บันทึกเงินปันผลรับ</span>
        </button>
      </div>

      <div class="div-table-wrap">
        <table class="custom-table font-mono">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>Ticker</th>
              <th>พอร์ตที่ได้รับ</th>
              <th>Gross ($)</th>
              <th>Tax 15%</th>
              <th>Net ($)</th>
              <th>Net (฿)</th>
              <th>หมายเหตุ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (displayedDividends.length === 0) {
      html += `<tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">ยังไม่มีรายการบันทึกเงินปันผล${this.dividendTableFilter === 'year' ? `ในปี ${this.selectedDividendYear}` : ''}</td></tr>`;
    } else {
      displayedDividends.forEach(d => {
        const port = this.portfolios.find(p => p.id === d.portfolioId);
        const netTHB = this.usdToThb(d.netUSD);
        html += `
          <tr>
            <td>${d.date}</td>
            <td><strong>${this.escapeHtml(d.ticker)}</strong></td>
            <td>${port ? port.emoji + ' ' + port.name : d.portfolioId}</td>
            <td>${this.formatUSD(d.grossUSD)}</td>
            <td class="text-rose">-${this.formatUSD(d.taxUSD)}</td>
            <td class="text-emerald font-bold">${this.formatUSD(d.netUSD)}</td>
            <td class="text-emerald font-bold">${this.formatTHB(netTHB)}</td>
            <td style="font-family: var(--font-ui);">${d.notes || '-'}</td>
            <td>
              <button class="btn btn-sm btn-danger" data-delete-dividend="${d.id}">ลบ</button>
            </td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    this.bindDividendEvents(container, availableYears);

    setTimeout(() => {
      this.initDividendForecastChart(estAnnualUSD, yearStats.monthlyActualUSD, this.selectedDividendYear);
    }, 50);
  }

  bindDividendEvents(container, availableYears) {
    // Year pills click
    container.querySelectorAll('.div-year-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = parseInt(btn.getAttribute('data-div-year'), 10);
        if (y && y !== this.selectedDividendYear) {
          this.selectedDividendYear = y;
          this.renderDividendsView(container);
        }
      });
    });

    // Year dropdown change
    const yearSelect = container.querySelector('#select-div-year');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        const y = parseInt(e.target.value, 10);
        if (y && y !== this.selectedDividendYear) {
          this.selectedDividendYear = y;
          this.renderDividendsView(container);
        }
      });
    }

    // Prev / Next year arrows
    const btnPrev = container.querySelector('#btn-prev-div-year');
    const btnNext = container.querySelector('#btn-next-div-year');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        const idx = availableYears.indexOf(this.selectedDividendYear);
        if (idx > 0) {
          this.selectedDividendYear = availableYears[idx - 1];
        } else {
          this.selectedDividendYear = this.selectedDividendYear - 1;
        }
        this.renderDividendsView(container);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        const idx = availableYears.indexOf(this.selectedDividendYear);
        if (idx >= 0 && idx < availableYears.length - 1) {
          this.selectedDividendYear = availableYears[idx + 1];
        } else {
          this.selectedDividendYear = this.selectedDividendYear + 1;
        }
        this.renderDividendsView(container);
      });
    }

    // Table Filter pills
    container.querySelectorAll('.btn-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-div-filter');
        if (filter && filter !== this.dividendTableFilter) {
          this.dividendTableFilter = filter;
          this.renderDividendsView(container);
        }
      });
    });
  }

  initDividendForecastChart(annualTotalUSD, monthlyActualUSD, selectedYear) {
    const ctx = document.getElementById('chart-dividend-forecast')?.getContext('2d');
    if (!ctx) return;

    if (this.charts.divForecast) {
      this.charts.divForecast.destroy();
    }

    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthlyBase = annualTotalUSD > 0 ? (annualTotalUSD / 12) : 0;

    // Distribute typical dividend quarterly peaks (Mar, Jun, Sep, Dec + May/Nov for Thai)
    const weights = [0.85, 0.75, 1.45, 0.80, 1.30, 1.50, 0.75, 0.80, 1.40, 0.80, 1.25, 1.55];
    const weightTotal = weights.reduce((sum, w) => sum + w, 0);
    const forecastValues = weights.map(w => parseFloat((monthlyBase * 12 * w / weightTotal).toFixed(2)));
    const actualValues = (monthlyActualUSD && monthlyActualUSD.length === 12) 
      ? monthlyActualUSD.map(v => parseFloat(v.toFixed(2))) 
      : Array(12).fill(0);

    this.charts.divForecast = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: `ปันผลรับจริงปี ${selectedYear} (Actual)`,
            data: actualValues,
            backgroundColor: '#10b981',
            hoverBackgroundColor: '#059669',
            borderRadius: 5,
            borderWidth: 0,
            barPercentage: 0.8,
            categoryPercentage: 0.7
          },
          {
            label: 'คาดการณ์ปันผล (Forecast)',
            data: forecastValues,
            backgroundColor: 'rgba(56, 189, 248, 0.45)',
            hoverBackgroundColor: 'rgba(56, 189, 248, 0.75)',
            borderColor: '#38bdf8',
            borderWidth: 1.5,
            borderRadius: 5,
            barPercentage: 0.8,
            categoryPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const isActual = c.datasetIndex === 0;
                const prefix = isActual ? '🟢 รับจริง' : '🔵 คาดการณ์';
                const val = c.raw || 0;
                return ` ${prefix}: $${val.toFixed(2)} (≈ ฿${Math.round(this.usdToThb(val)).toLocaleString()})`;
              }
            }
          }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#64748b', callback: v => '$' + v }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { weight: '600' } }
          }
        }
      }
    });
  }


  // --- AUTO QUARTERLY SNAPSHOT ENGINE (Q1: 31 Mar, Q2: 30 Jun, Q3: 30 Sep, Q4: 31 Dec) ---


  // 5. QUARTERLY COMPARISON & AUTO-SNAPSHOT VIEW




  // 5. FUTURE NET WORTH & COMPOUND INTEREST SIMULATOR VIEW
  renderSimulatorView(container) {
    const grand = this.calculateGrandTotalStats();
    const initCapital = Math.round(grand.grandTotalUSD) || 1000;

    let html = `
      <div class="dime-hero-banner" style="background: linear-gradient(135deg, #1e1b4b 0%, #17112d 40%, #0f131a 100%); border-color: rgba(168, 85, 247, 0.3);">
        <div class="dime-hero-header">
          <span class="dime-hero-label text-purple">🔮 จำลองการเติบโตของพอร์ต & ดอกเบี้ยทบต้น (Compound Simulator)</span>
        </div>
        <div class="dime-main-value font-mono" id="sim-hero-future-val">$0.00</div>
        <div class="dime-sub-value font-mono" id="sim-hero-future-thb">≈ ฿0.00 • พลังของดอกเบี้ยทบต้น (The Power of Compounding)</div>
      </div>

      <div class="simulator-layout">
        <!-- SIMULATOR CONTROLS CARD -->
        <div class="chart-card">
          <div class="chart-title">
            <span>⚙️ ปรับแต่งตัวแปรการลงทุน (Simulation Parameters)</span>
          </div>

          <div class="sim-slider-group">
            <div class="sim-slider-header">
              <span class="sim-slider-label">เงินลงทุนเริ่มต้น (Initial Capital)</span>
              <div class="sim-input-row">
                <span class="sim-cur-symbol">$</span>
                <input type="number" id="sim-input-init" class="sim-number-input font-mono" min="0" max="500000" step="50" value="${initCapital}">
              </div>
            </div>
            <input type="range" min="0" max="50000" step="50" value="${initCapital}" class="sim-range-input" id="sim-slider-init">
            <div class="sim-sub-hint font-mono" id="sim-val-init">≈ ฿0</div>
          </div>

          <div class="sim-slider-group">
            <div class="sim-slider-header">
              <span class="sim-slider-label">เงินออมเติมพอร์ตต่อเดือน (Monthly DCA)</span>
              <div class="sim-input-row">
                <span class="sim-cur-symbol">$</span>
                <input type="number" id="sim-input-monthly" class="sim-number-input font-mono" min="0" max="10000" step="10" value="100">
              </div>
            </div>
            <input type="range" min="0" max="2000" step="10" value="100" class="sim-range-input" id="sim-slider-monthly">
            <div class="sim-sub-hint font-mono" id="sim-val-monthly">≈ ฿3,259 / เดือน</div>
          </div>

          <div class="sim-slider-group">
            <div class="sim-slider-header">
              <span class="sim-slider-label">ผลตอบแทนคาดหวังเฉลี่ยต่อปี (CAGR %)</span>
              <div class="sim-input-row">
                <input type="number" id="sim-input-cagr" class="sim-number-input font-mono" min="1" max="40" step="0.5" value="10">
                <span class="sim-cur-symbol">%</span>
              </div>
            </div>
            <input type="range" min="1" max="30" step="0.5" value="10" class="sim-range-input" id="sim-slider-cagr">
            <div class="sim-sub-hint font-mono" id="sim-val-cagr">10.0% / ปี</div>
          </div>

          <div class="sim-slider-group">
            <div class="sim-slider-header">
              <span class="sim-slider-label">ระยะเวลาลงทุน (Investment Horizon)</span>
              <div class="sim-input-row">
                <input type="number" id="sim-input-years" class="sim-number-input font-mono" min="1" max="50" step="1" value="10">
                <span class="sim-cur-symbol">ปี</span>
              </div>
            </div>
            <input type="range" min="1" max="40" step="1" value="10" class="sim-range-input" id="sim-slider-years">
            <div class="sim-sub-hint font-mono" id="sim-val-years">10 ปี</div>
          </div>

          <button id="btn-trigger-celebrate-sim" class="btn btn-sm btn-secondary" style="width: 100%; margin-top: 10px;">
            <span>🎉 จุดพลุฉลองความสำเร็จ (Test Confetti)</span>
          </button>
        </div>

        <!-- SIMULATOR CHART & RESULT STATS -->
        <div class="chart-card">
          <div class="chart-title">
            <span>📈 กราฟเงินต้น vs ดอกเบี้ยทบต้น (Wealth Projection Curve)</span>
          </div>

          <div class="sim-stats-grid">
            <div class="sim-stat-box">
              <div class="sim-stat-box-label">เงินต้นรวมที่ใส่ไป</div>
              <div class="sim-stat-box-val text-blue font-mono" id="sim-stat-principal">$0.00</div>
            </div>
            <div class="sim-stat-box">
              <div class="sim-stat-box-label">กำไรทบต้นที่งอกเงย</div>
              <div class="sim-stat-box-val text-emerald font-mono" id="sim-stat-interest">$0.00</div>
            </div>
            <div class="sim-stat-box">
              <div class="sim-stat-box-label">มูลค่ารวมสุทธิ</div>
              <div class="sim-stat-box-val text-purple font-mono" id="sim-stat-total">$0.00</div>
            </div>
          </div>

          <div class="chart-canvas-container" style="height: 280px;">
            <canvas id="chart-compound-simulator"></canvas>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    setTimeout(() => {
      this.initSimulatorEvents();
      this.updateSimulatorChart();
    }, 50);
  }

  initSimulatorEvents() {
    ['init', 'monthly', 'cagr', 'years'].forEach(key => {
      const slider = document.getElementById(`sim-slider-${key}`);
      const input = document.getElementById(`sim-input-${key}`);

      slider?.addEventListener('input', (e) => {
        if (input) input.value = e.target.value;
        this.updateSimulatorChart();
      });

      input?.addEventListener('input', (e) => {
        if (slider) slider.value = e.target.value;
        this.updateSimulatorChart();
      });
    });

    document.getElementById('btn-trigger-celebrate-sim')?.addEventListener('click', () => {
      this.triggerCelebration();
    });
  }

  updateSimulatorChart() {
    const initCap = parseFloat(document.getElementById('sim-input-init')?.value) || parseFloat(document.getElementById('sim-slider-init')?.value) || 0;
    const monthly = parseFloat(document.getElementById('sim-input-monthly')?.value) || parseFloat(document.getElementById('sim-slider-monthly')?.value) || 0;
    const rawCagr = parseFloat(document.getElementById('sim-input-cagr')?.value);
    const cagr = Number.isFinite(rawCagr) ? Math.max(-99, rawCagr) : 10;
    const years = parseInt(document.getElementById('sim-input-years')?.value) || parseInt(document.getElementById('sim-slider-years')?.value) || 10;

    // Update label text
    const initEl = document.getElementById('sim-val-init');
    if (initEl) initEl.textContent = `≈ ฿${Math.round(this.usdToThb(initCap)).toLocaleString()}`;
    const monthlyEl = document.getElementById('sim-val-monthly');
    if (monthlyEl) monthlyEl.textContent = `≈ ฿${Math.round(this.usdToThb(monthly)).toLocaleString()} / เดือน`;
    const cagrEl = document.getElementById('sim-val-cagr');
    if (cagrEl) cagrEl.textContent = `${cagr.toFixed(1)}% / ปี`;
    const yearsEl = document.getElementById('sim-val-years');
    if (yearsEl) yearsEl.textContent = `${years} ปี`;

    // Monthly compound calculation
    const r = Math.pow(1 + cagr / 100, 1 / 12) - 1;
    const labels = [];
    const principalData = [];
    const totalData = [];

    let currentBalance = initCap;
    let currentPrincipal = initCap;

    labels.push('ปี 0');
    principalData.push(Math.round(currentPrincipal));
    totalData.push(Math.round(currentBalance));

    for (let y = 1; y <= years; y++) {
      for (let m = 1; m <= 12; m++) {
        currentBalance = (currentBalance + monthly) * (1 + r);
        currentPrincipal += monthly;
      }
      labels.push(`ปี ${y}`);
      principalData.push(Math.round(currentPrincipal));
      totalData.push(Math.round(currentBalance));
    }

    const finalTotalUSD = currentBalance;
    const finalPrincipalUSD = currentPrincipal;
    const finalInterestUSD = Math.max(0, currentBalance - currentPrincipal);

    // Update stat boxes & hero
    const heroMain = document.getElementById('sim-hero-future-val');
    if (heroMain) heroMain.textContent = this.formatUSD(finalTotalUSD);
    const heroSub = document.getElementById('sim-hero-future-thb');
    if (heroSub) heroSub.textContent = `≈ ${this.formatTHB(this.usdToThb(finalTotalUSD))} • พลังของดอกเบี้ยทบต้น (${years} ปี)`;

    const statP = document.getElementById('sim-stat-principal');
    if (statP) statP.textContent = this.formatUSD(finalPrincipalUSD);
    const statI = document.getElementById('sim-stat-interest');
    if (statI) statI.textContent = this.formatUSD(finalInterestUSD);
    const statT = document.getElementById('sim-stat-total');
    if (statT) statT.textContent = this.formatUSD(finalTotalUSD);

    // Draw Chart
    const ctx = document.getElementById('chart-compound-simulator')?.getContext('2d');
    if (!ctx) return;

    if (this.charts.compound) {
      this.charts.compound.destroy();
    }

    this.charts.compound = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'มูลค่ารวมสุทธิ (Total Net Worth)',
            data: totalData,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'เงินต้นที่ออม (Total Principal)',
            data: principalData,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8' } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label}: $${c.raw.toLocaleString()} (฿${Math.round(this.usdToThb(c.raw)).toLocaleString()})`
            }
          }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#64748b', callback: v => '$' + v.toLocaleString() }
          },
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  // --- COMMAND PALETTE & SPOTLIGHT SEARCH (CTRL + K) ---
  openCommandPalette() {
    this.openModal('modal-command-palette');
    const input = document.getElementById('command-search-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 80);
    }
    this.renderCommandResults('');
  }

  renderCommandResults(query = '') {
    const listEl = document.getElementById('command-results-list');
    if (!listEl) return;

    const q = query.trim().toLowerCase();
    
    // 1. Stocks & Crypto Holdings
    const stockResults = [];
    this.portfolios.forEach(p => {
      (p.holdings || []).forEach(h => {
        const sym = h.ticker.toUpperCase();
        const name = (h.name || '').toLowerCase();
        const portName = (p.name || '').toLowerCase();
        if (!q || sym.toLowerCase().includes(q) || name.includes(q) || portName.includes(q)) {
          const stats = this.calculateHoldingStats(h);
          stockResults.push({
            type: 'stock',
            ticker: sym,
            name: h.name || h.ticker,
            portId: p.id,
            portName: p.name,
            portEmoji: p.emoji || '📁',
            marketValueUSD: stats.marketValueUSD,
            unrealizedPLPct: stats.unrealizedPLPct,
            currentPrice: stats.currentPrice,
            shares: stats.shares,
            color: p.color || '#10b981'
          });
        }
      });
    });

    // 2. Sub-Portfolios
    const portResults = [];
    this.portfolios.forEach(p => {
      const name = (p.name || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const tier = (p.tier || '').toLowerCase();
      if (!q || name.includes(q) || cat.includes(q) || tier.includes(q)) {
        const stats = this.calculatePortfolioStats(p);
        portResults.push({
          type: 'portfolio',
          id: p.id,
          name: p.name,
          emoji: p.emoji || '📁',
          tier: p.tier,
          category: p.category,
          totalValueUSD: stats.totalValueUSD,
          holdingsCount: (p.holdings || []).length,
          color: p.color || '#10b981'
        });
      }
    });

    // 3. Navigation Views
    const navItems = [
      { id: 'dashboard', icon: '📊', title: 'แดชบอร์ดภาพรวม', sub: 'สรุปพอร์ตและเป้าหมายการลงทุน' },
      { id: 'portfolios', icon: '📁', title: 'แยกพอร์ต (พอร์ตการลงทุน & หุ้น)', sub: 'จัดการสินทรัพย์หุ้นและเงินไว้ช้อน' },
      { id: 'trading', icon: '💱', title: 'Forex & Option Trading', sub: 'บันทึกยอดเงินพอร์ตเทรดกระแสเงินสด' },
      { id: 'dividends', icon: '💰', title: 'บันทึกเงินปันผล', sub: 'ประวัติรับปันผลและ Passive Income' },
      { id: 'simulator', icon: '🔮', title: 'จำลองเงินล้าน (Simulator)', sub: 'พลังดอกเบี้ยทบต้นและเป้าหมายสู่อิสรภาพ' },
      { id: 'quarterly', icon: '📈', title: 'เปรียบเทียบผลงานรายไตรมาส', sub: 'Snapshot Q1/Q2/Q3/Q4 และการเติบโต' },
      { id: 'obsidian', icon: '🤖', title: 'Obsidian & AI Second Brain', sub: 'ส่งออกรายงาน Markdown สำหรับ AI' },
      { id: 'settings', icon: '⚙️', title: 'ตั้งค่า & ฐานข้อมูล', sub: 'จัดการ Firebase และอัตราแลกเปลี่ยน' }
    ].filter(item => !q || item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q));

    // 4. Quick Actions
    const actionItems = [
      { action: 'trade', icon: '➕', title: 'ซื้อ / ขายสินทรัพย์ (Quick Trade)', sub: 'บันทึกซื้อ-ขายหุ้นหรือตัดเงินไว้ช้อน' },
      { action: 'dca', icon: '⚖️', title: 'Smart DCA & Rebalance Calculator', sub: 'คำนวณแบ่งเงินซื้อหุ้นตามเป้าหมายพอร์ต' },
      { action: 'cash_buffer', icon: '💧', title: 'ฝาก / ถอนเงินไว้ช้อน (Cash Buffer)', sub: 'จัดการเงินสดสำรองรอช้อนซื้อ' },
      { action: 'reorder', icon: '↕️', title: 'จัดเรียงลำดับพอร์ต', sub: 'ปรับสลับลำดับการแสดงผลของพอร์ต' },
      { action: 'sync', icon: '🔄', title: 'อัปเดตราคาตลาดสด (Sync Market)', sub: 'ดึงราคาหุ้นและคริปโตล่าสุด' },
      { action: 'privacy', icon: '👁️', title: 'เปิด / ปิด Privacy Mode', sub: 'ซ่อน/แสดงตัวเลขทางการเงิน' }
    ].filter(item => !q || item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q));

    let html = '';

    // Render Stocks Group
    if (stockResults.length > 0) {
      html += `<div class="command-group-title">📈 หุ้นและสินทรัพย์ (${stockResults.length})</div>`;
      html += stockResults.slice(0, 6).map(s => `
        <div class="command-item" data-cmd-type="stock" data-cmd-port="${s.portId}" data-cmd-ticker="${s.ticker}">
          <div class="command-item-left">
            ${this.renderStockLogoHTML(s.ticker, s.color, 32)}
            <div>
              <div class="command-item-title">${s.ticker} <span style="font-size:12px; font-weight:400; color:var(--text-secondary);">- ${s.name}</span></div>
              <div class="command-item-sub">${s.portEmoji} ${s.portName} • ${s.shares.toFixed(4)} หุ้น @ $${s.currentPrice.toFixed(2)}</div>
            </div>
          </div>
          <div class="command-item-right font-mono">
            <div style="text-align: right;">
              <strong style="color:#fff; font-size:13px;">${this.formatUSD(s.marketValueUSD)}</strong>
              <div style="font-size:11px;" class="${s.unrealizedPLPct >= 0 ? 'text-emerald' : 'text-rose'}">
                ${s.unrealizedPLPct >= 0 ? '+' : ''}${s.unrealizedPLPct.toFixed(2)}%
              </div>
            </div>
            <span class="command-item-tag">ดูพอร์ต ↵</span>
          </div>
        </div>
      `).join('');
    }

    // Render Portfolios Group
    if (portResults.length > 0) {
      html += `<div class="command-group-title">📁 พอร์ตการลงทุน (${portResults.length})</div>`;
      html += portResults.map(p => `
        <div class="command-item" data-cmd-type="portfolio" data-cmd-port="${p.id}">
          <div class="command-item-left">
            <div class="command-item-icon" style="font-size:24px;">${p.emoji}</div>
            <div>
              <div class="command-item-title">${this.escapeHtml(p.name)}</div>
              <div class="command-item-sub">${this.escapeHtml(p.tier)} • ${p.category} (${p.holdingsCount} สินทรัพย์)</div>
            </div>
          </div>
          <div class="command-item-right font-mono">
            <strong style="color:#fff; font-size:13px;">${this.formatUSD(p.totalValueUSD)}</strong>
            <span class="command-item-tag">เปิดพอร์ต ↵</span>
          </div>
        </div>
      `).join('');
    }

    // Render Actions Group
    if (actionItems.length > 0) {
      html += `<div class="command-group-title">⚡ การทำงานด่วน (Quick Actions)</div>`;
      html += actionItems.map(a => `
        <div class="command-item" data-cmd-type="action" data-cmd-action="${a.action}">
          <div class="command-item-left">
            <div class="command-item-icon" style="background:rgba(255,255,255,0.06); width:32px; height:32px; border-radius:var(--radius-sm);">${a.icon}</div>
            <div>
              <div class="command-item-title">${a.title}</div>
              <div class="command-item-sub">${a.sub}</div>
            </div>
          </div>
          <div class="command-item-right">
            <span class="command-item-tag">เรียกใช้ ↵</span>
          </div>
        </div>
      `).join('');
    }

    // Render Navigation Views Group
    if (navItems.length > 0) {
      html += `<div class="command-group-title">🧭 หน้าและเครื่องมือ</div>`;
      html += navItems.map(n => `
        <div class="command-item" data-cmd-type="nav" data-cmd-tab="${n.id}">
          <div class="command-item-left">
            <div class="command-item-icon" style="font-size:22px;">${n.icon}</div>
            <div>
              <div class="command-item-title">${n.title}</div>
              <div class="command-item-sub">${n.sub}</div>
            </div>
          </div>
          <div class="command-item-right">
            <span class="command-item-tag">สลับหน้า ↵</span>
          </div>
        </div>
      `).join('');
    }

    if (!html) {
      html = `<div style="text-align:center; padding:36px 16px; color:var(--text-muted);">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div>ไม่พบผลลัพธ์สำหรับ "<strong>${query}</strong>"</div>
        <div style="font-size:12px; margin-top:4px;">ลองค้นหาด้วยชื่อย่อหุ้น เช่น NVDA, หรือชื่อพอร์ต เช่น Next Gen</div>
      </div>`;
    }

    listEl.innerHTML = html;

    // Highlight first item
    const firstItem = listEl.querySelector('.command-item');
    if (firstItem) firstItem.classList.add('active');
  }

  executeCommandItem(itemEl) {
    if (!itemEl) return;
    const type = itemEl.getAttribute('data-cmd-type');

    if (type === 'stock') {
      const portId = itemEl.getAttribute('data-cmd-port');
      this.selectedPortfolioId = portId;
      this.switchTab('portfolios');
      this.closeModal('modal-command-palette');
    } else if (type === 'portfolio') {
      const portId = itemEl.getAttribute('data-cmd-port');
      this.selectedPortfolioId = portId;
      this.switchTab('portfolios');
      this.closeModal('modal-command-palette');
    } else if (type === 'nav') {
      const tab = itemEl.getAttribute('data-cmd-tab');
      this.switchTab(tab);
      this.closeModal('modal-command-palette');
    } else if (type === 'action') {
      const action = itemEl.getAttribute('data-cmd-action');
      this.closeModal('modal-command-palette');
      if (action === 'trade') {
        this.populateTradeStockSelect();
        this.openModal('modal-trade');
      } else if (action === 'dca') {
        this.openRebalanceModal();
      } else if (action === 'cash_buffer') {
        this.openCashBufferModal(this.selectedPortfolioId);
      } else if (action === 'reorder') {
        this.openReorderPortfoliosModal();
      } else if (action === 'sync') {
        this.syncLiveMarketPrices();
      } else if (action === 'privacy') {
        this.togglePrivacyMode();
      }
    }
  }

  setupCommandPaletteKeyboard() {
    // Global shortcut Ctrl+K / Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const modal = document.getElementById('modal-command-palette');
        if (modal && modal.classList.contains('open')) {
          this.closeModal('modal-command-palette');
        } else {
          this.openCommandPalette();
        }
      }
    });

    const searchInput = document.getElementById('command-search-input');
    const resultsList = document.getElementById('command-results-list');

    searchInput?.addEventListener('input', (e) => {
      this.renderCommandResults(e.target.value);
    });

    searchInput?.addEventListener('keydown', (e) => {
      const items = Array.from(resultsList.querySelectorAll('.command-item'));
      if (items.length === 0) return;

      const activeIdx = items.findIndex(item => item.classList.contains('active'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (activeIdx + 1) % items.length;
        items.forEach(i => i.classList.remove('active'));
        items[nextIdx].classList.add('active');
        items[nextIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (activeIdx - 1 + items.length) % items.length;
        items.forEach(i => i.classList.remove('active'));
        items[prevIdx].classList.add('active');
        items[prevIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const currentActive = items[activeIdx >= 0 ? activeIdx : 0];
        if (currentActive) {
          this.executeCommandItem(currentActive);
        }
      }
    });

    // Delegate click on command items
    resultsList?.addEventListener('click', (e) => {
      const item = e.target.closest('.command-item');
      if (item) {
        this.executeCommandItem(item);
      }
    });
  }

  // --- SUB-PORTFOLIO REORDERING SYSTEM ---
  openReorderPortfoliosModal() {
    this.renderReorderPortfoliosList();
    this.openModal('modal-reorder-portfolios');
  }

  renderReorderPortfoliosList() {
    const listEl = document.getElementById('reorder-portfolios-list');
    if (!listEl) return;

    listEl.innerHTML = this.portfolios.map((p, idx) => `
      <div class="reorder-list-item" draggable="true" data-index="${idx}" style="border-left: 4px solid ${p.color || '#10b981'};">
        <div class="reorder-item-left">
          <span class="reorder-drag-handle" title="ลากเพื่อสลับตำแหน่ง">⠿</span>
          <div>
            <div class="reorder-item-name">${p.emoji || '📁'} ${this.escapeHtml(p.name)}</div>
            <div class="reorder-item-sub">${this.escapeHtml(p.tier)} • ${p.category} (${(p.holdings || []).length} สินทรัพย์)</div>
          </div>
        </div>
        <div class="reorder-item-actions">
          <button type="button" class="btn btn-icon-xs btn-secondary" data-move-up="${idx}" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} title="เลื่อนขึ้น">⬆️</button>
          <button type="button" class="btn btn-icon-xs btn-secondary" data-move-down="${idx}" ${idx === this.portfolios.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} title="เลื่อนลง">⬇️</button>
        </div>
      </div>
    `).join('');

    this.setupReorderDragAndDropEvents();
  }

  movePortfolioUp(index) {
    if (index <= 0 || index >= this.portfolios.length) return;
    const temp = this.portfolios[index];
    this.portfolios[index] = this.portfolios[index - 1];
    this.portfolios[index - 1] = temp;
    this.renderReorderPortfoliosList();
  }

  movePortfolioDown(index) {
    if (index < 0 || index >= this.portfolios.length - 1) return;
    const temp = this.portfolios[index];
    this.portfolios[index] = this.portfolios[index + 1];
    this.portfolios[index + 1] = temp;
    this.renderReorderPortfoliosList();
  }

  setupReorderDragAndDropEvents() {
    const listEl = document.getElementById('reorder-portfolios-list');
    if (!listEl) return;

    listEl.onclick = (e) => {
      const btnUp = e.target.closest('[data-move-up]');
      if (btnUp && !btnUp.disabled) {
        const idx = parseInt(btnUp.getAttribute('data-move-up'));
        this.movePortfolioUp(idx);
        return;
      }

      const btnDown = e.target.closest('[data-move-down]');
      if (btnDown && !btnDown.disabled) {
        const idx = parseInt(btnDown.getAttribute('data-move-down'));
        this.movePortfolioDown(idx);
        return;
      }
    };

    let dragSrcIndex = null;
    const items = listEl.querySelectorAll('.reorder-list-item');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragSrcIndex = parseInt(item.getAttribute('data-index'));
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcIndex);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const dropTargetIndex = parseInt(item.getAttribute('data-index'));
        if (dragSrcIndex !== null && dragSrcIndex !== dropTargetIndex) {
          const movedItem = this.portfolios.splice(dragSrcIndex, 1)[0];
          this.portfolios.splice(dropTargetIndex, 0, movedItem);
          this.renderReorderPortfoliosList();
        }
      });
    });
  }

  async saveReorderedPortfolios() {
    if (!await this.saveData()) return;
    this.closeModal('modal-reorder-portfolios');
    this.renderActiveTab();
    this.showToast({
      icon: '💾',
      title: 'บันทึกลำดับพอร์ตสำเร็จ!',
      message: 'ปรับลำดับการแสดงผลของพอร์ตเรียบร้อยแล้ว',
      type: 'success'
    });
  }

  // --- SMART REBALANCE & DCA CALCULATOR MODAL ---
  openRebalanceModal() {
    const select = document.getElementById('rebalance-port-select');
    if (select) {
      select.innerHTML = this.portfolios.map(p => `
        <option value="${p.id}" ${p.id === this.selectedPortfolioId ? 'selected' : ''}>${p.emoji || '📁'} ${this.escapeHtml(p.name)} (Goal: $${(p.goalUSD || 0).toLocaleString()})</option>
      `).join('');
    }
    this.updateRebalanceDepositHint();
    this.calculateAndRenderSmartDCA();
    this.openModal('modal-rebalance-calculator');
  }

  updateRebalanceDepositHint() {
    const val = parseFloat(document.getElementById('rebalance-deposit-usd')?.value) || 0;
    const hint = document.getElementById('rebalance-deposit-thb-hint');
    if (hint) hint.textContent = `≈ ${this.formatTHB(this.usdToThb(val))}`;
  }

  calculateAndRenderSmartDCA() {
    const portId = document.getElementById('rebalance-port-select')?.value || this.selectedPortfolioId;
    const depositUSD = parseFloat(document.getElementById('rebalance-deposit-usd')?.value) || 0;
    const container = document.getElementById('rebalance-results-container');
    if (!container) return;

    const port = this.portfolios.find(p => p.id === portId);
    if (!port || !port.holdings || port.holdings.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">ไม่มีรายการหุ้นในพอร์ตนี้</div>`;
      return;
    }

    if (depositUSD <= 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">กรุณาระบุจำนวนเงินที่จะเติม</div>`;
      return;
    }

    // Smart Allocation Algorithm
    const holdingItems = port.holdings.map(h => {
      const stats = this.calculateHoldingStats(h);
      const targetUSD = h.targetTHB > 0 ? this.thbToUsd(h.targetTHB) : (port.goalUSD / port.holdings.length);
      const gapUSD = Math.max(0, targetUSD - stats.marketValueUSD);
      return {
        holding: h,
        stats,
        targetUSD,
        gapUSD
      };
    });

    const totalGap = holdingItems.reduce((sum, item) => sum + item.gapUSD, 0);

    const allocation = holdingItems.map(item => {
      let shareUSD = 0;
      if (totalGap > 0) {
        shareUSD = (item.gapUSD / totalGap) * depositUSD;
      } else {
        shareUSD = depositUSD / holdingItems.length;
      }
      const buyShares = item.stats.currentPrice > 0 ? (shareUSD / item.stats.currentPrice) : 0;
      return {
        ticker: item.holding.ticker,
        name: item.holding.name,
        currentPrice: item.stats.currentPrice,
        shareUSD,
        buyShares,
        targetUSD: item.targetUSD,
        currentVal: item.stats.marketValueUSD
      };
    });

    container.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 10px;">📋 แผนการแบ่งเงินซื้อ ($${depositUSD.toFixed(2)}):</div>
      ${allocation.map(a => `
        <div class="rebalance-plan-card">
          <div class="rebalance-plan-left">
            ${this.renderStockLogoHTML(a.ticker, port.color || '#10b981', 38)}
            <div>
              <div class="rebalance-plan-ticker">${this.escapeHtml(a.ticker)}</div>
              <div class="rebalance-plan-shares">ช้อนซื้อ: <strong class="text-emerald font-mono">+${a.buyShares.toFixed(6)} หุ้น</strong> (@ $${a.currentPrice.toFixed(2)})</div>
            </div>
          </div>
          <div class="rebalance-plan-amount">
            <div class="text-emerald font-mono" style="font-size: 15px;">+$${a.shareUSD.toFixed(2)}</div>
            <div style="font-size: 11px; color: var(--text-muted); font-mono">≈ ฿${this.usdToThb(a.shareUSD).toFixed(0)}</div>
          </div>
        </div>
      `).join('')}
    `;
  }

  // 6. OBSIDIAN VAULT & AI SECOND BRAIN 1-CLICK EXPORT VIEW
  renderObsidianExportView(container) {
    const mdContent = this.generateObsidianMarkdown();

    let html = `
      <div class="obsidian-export-container">
        <div class="obsidian-preview-header">
          <div>
            <h3 style="font-size: 18px; font-weight: 700; color: #fff;">🤖 ส่งออกเข้า Obsidian Vault & AI Second Brain</h3>
            <p style="font-size: 13px; color: var(--text-secondary);">
              ฟอร์แมต Markdown ตรงตามสเปกของ <code>Luna/02_INVESTMENT/financial_results/</code> พร้อม YAML Tags และ Wikilinks
            </p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary" id="btn-copy-obsidian-md">
              <span>📋 Copy Markdown for AI</span>
            </button>
            <button class="btn btn-secondary" id="btn-download-obsidian-md">
              <span>📥 Download .md File</span>
            </button>
          </div>
        </div>

        <pre class="markdown-preview-box" id="obsidian-md-preview">${this.escapeHtml(mdContent)}</pre>
      </div>
    `;

    container.innerHTML = html;
  }


  escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 7. SETTINGS & BACKUP VIEW
  renderSettingsView(container) {
    let html = `
      <div class="dime-hero-banner">
        <h2 style="font-size: 24px; font-weight: 800; color: #fff;">⚙️ การตั้งค่าระบบและฐานข้อมูล</h2>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          จัดการการเชื่อมต่อ Firebase Cloud Realtime Sync, สำรองข้อมูล, และตั้งค่าทั่วไป
        </p>
      </div>

      <div class="analytics-charts-grid">
        <div class="chart-card">
          <div class="chart-title">ราคาตลาด (Finnhub API Key — ไม่จำเป็นต้องใส่)</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            ดึงราคาตามสิทธิ์และโควตาของ Finnhub; ความสดขึ้นกับผู้ให้บริการ อาจไม่มีข้อมูลนอกเวลาตลาด
          </p>
          <div class="form-group" style="margin-bottom: 8px;">
            <label style="font-size: 12px; color: var(--text-secondary);">Finnhub API Key (ฟรี):</label>
            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <input type="text" id="input-finnhub-key" class="form-input font-mono" placeholder="ใส่ API Key เช่น c..." value="${this.finnhubApiKey || ''}" style="flex: 1;">
              <button class="btn btn-primary" id="btn-save-finnhub-key">💾 บันทึก Key</button>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
              👉 รับ API Key ฟรีได้ที่ <a href="https://finnhub.io/register" target="_blank" style="color: var(--color-emerald); text-decoration: underline;">finnhub.io/register</a> (สมัครฟรี 10 วินาที ใช้งานได้ทันที)
            </div>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-title">☁️ สถานะการซิงค์ Firebase Cloud</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            Project ID: <code>pixel-steward-db</code><br>
            Database URL: <code>pixel-steward-db-default-rtdb.asia-southeast1.firebasedatabase.app</code>
          </p>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary" id="btn-force-cloud-push">📤 อัปโหลดข้อมูลขึ้น Cloud</button>
            <button class="btn btn-secondary" id="btn-force-cloud-pull">📥 ดึงข้อมูลล่าสุดจาก Cloud</button>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-title">💾 สำรองข้อมูลแบบไฟล์ (JSON Backup)</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            ดาวน์โหลดไฟล์ JSON สำรองเก็บไว้ในเครื่อง หรือนำเข้าไฟล์ข้อมูล
          </p>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" id="btn-export-json">📥 ดาวน์โหลด Backup JSON</button>
            <label class="btn btn-secondary" style="cursor: pointer;">
              <span>📤 นำเข้า JSON</span>
              <input type="file" id="input-import-json" accept=".json" style="display: none;">
            </label>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Finnhub Key Save Event
    document.getElementById('btn-save-finnhub-key')?.addEventListener('click', () => {
      const key = (document.getElementById('input-finnhub-key')?.value || '').trim();
      this.finnhubApiKey = key;
      localStorage.setItem('pixel_finnhub_key', key);
      this.showToast({
        icon: '🔑',
        title: 'บันทึก Finnhub API Key แล้ว!',
        message: key ? 'ระบบจะดึงราคาหุ้นสดอัตโนมัติจาก Finnhub ทันที' : 'ลบ API Key แล้ว',
        type: 'success'
      });
      if (key) {
        this.syncLiveMarketPrices();
      }
    });
  }

  // --- EVENT LISTENERS & INTERACTION ---
  setupEventListeners() {
    // Window Visibility Auto-Sync (When user tabs back into the app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncLiveMarketPrices();
      }
    });
    // Navigation Tabs (Desktop & Mobile)
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Currency Switcher (USD / THB)
    document.getElementById('cur-mode-usd')?.addEventListener('click', () => {
      this.displayCurrency = 'USD';
      document.getElementById('cur-mode-usd').classList.add('active');
      document.getElementById('cur-mode-thb').classList.remove('active');
      this.renderActiveTab();
    });

    document.getElementById('cur-mode-thb')?.addEventListener('click', () => {
      this.displayCurrency = 'THB';
      document.getElementById('cur-mode-thb').classList.add('active');
      document.getElementById('cur-mode-usd').classList.remove('active');
      this.renderActiveTab();
    });

    // Command Palette & Spotlight Search Trigger
    document.getElementById('btn-open-command-palette')?.addEventListener('click', () => this.openCommandPalette());
    this.setupCommandPaletteKeyboard();

    // Sidebar Toggle & Pin Buttons
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('btn-pin-sidebar')?.addEventListener('click', () => this.toggleSidebar());

    // Privacy Mode Toggle Button
    document.getElementById('btn-toggle-privacy')?.addEventListener('click', () => this.togglePrivacyMode());

    // Reorder Portfolios Modal & Save Button
    document.getElementById('btn-open-reorder-modal')?.addEventListener('click', () => this.openReorderPortfoliosModal());
    document.getElementById('btn-save-reorder-portfolios')?.addEventListener('click', () => this.saveReorderedPortfolios());

    // Smart Rebalance Modal & Calculator
    document.getElementById('btn-open-rebalance-modal')?.addEventListener('click', () => this.openRebalanceModal());
    document.getElementById('btn-calc-smart-dca')?.addEventListener('click', () => this.calculateAndRenderSmartDCA());
    document.getElementById('rebalance-deposit-usd')?.addEventListener('input', () => this.updateRebalanceDepositHint());
    document.getElementById('rebalance-port-select')?.addEventListener('change', () => this.calculateAndRenderSmartDCA());

    // Market Sync Buttons
    document.getElementById('btn-sync-market-top')?.addEventListener('click', () => this.syncLiveMarketPrices());
    document.getElementById('btn-sync-market-desktop')?.addEventListener('click', () => this.syncLiveMarketPrices());

    // FX Rate Container Click (Opens FX Modal)
    document.getElementById('fx-rate-container')?.addEventListener('click', () => {
      document.getElementById('input-fx-rate').value = this.exchangeRate.toFixed(2);
      this.openModal('modal-fx-settings');
    });

    // Top Quick Action Button (Opens Trade Modal)
    document.getElementById('btn-quick-action')?.addEventListener('click', () => {
      this.populateTradeStockSelect();
      this.openModal('modal-trade');
    });

    // Dynamic Delegate clicks inside View Container
    const container = document.getElementById('app-view-container');
    container?.addEventListener('click', async (e) => {
      const target = e.target.closest('button, [data-open-port]');
      if (!target) return;

      // Open Reorder Modal
      if (target.id === 'btn-open-reorder-modal') {
        this.openReorderPortfoliosModal();
        return;
      }

      // Open Subportfolio from card
      if (target.hasAttribute('data-open-port')) {
        this.selectedPortfolioId = target.getAttribute('data-open-port');
        this.switchTab('portfolios');
        return;
      }

      // Subportfolio Selector Button
      if (target.hasAttribute('data-select-port')) {
        this.selectedPortfolioId = target.getAttribute('data-select-port');
        this.renderActiveTab();
        return;
      }

      // Add New Subportfolio Modal
      if (target.id === 'btn-add-portfolio-modal') {
        this.openPortfolioEditModal(null);
        return;
      }

      // Add Stock Modal
      if (target.id === 'btn-add-holding-modal') {
        this.openHoldingModal(null, this.selectedPortfolioId);
        return;
      }

      // Edit Stock Modal
      if (target.hasAttribute('data-edit-holding')) {
        const holdingId = target.getAttribute('data-edit-holding');
        const portId = target.getAttribute('data-port-id');
        this.openHoldingModal(holdingId, portId);
        return;
      }

      // Quick Trade Modal for specific stock
      if (target.hasAttribute('data-trade-holding')) {
        const holdingId = target.getAttribute('data-trade-holding');
        const portId = target.getAttribute('data-port-id');
        this.openTradeModalForHolding(holdingId, portId);
        return;
      }

      // Manage Cash Buffer
      if (target.id === 'btn-manage-cash-buffer' || target.hasAttribute('data-port-id') && target.id === 'btn-manage-cash-buffer') {
        const portId = target.getAttribute('data-port-id') || this.selectedPortfolioId;
        this.openCashBufferModal(portId);
        return;
      }

      // Quick Buy with Cash Buffer
      if (target.id === 'btn-quick-buy-with-cash') {
        const portId = target.getAttribute('data-port-id') || this.selectedPortfolioId;
        this.populateTradeStockSelect(portId);
        this.openModal('modal-trade');
        return;
      }

      // Edit Current Subportfolio
      if (target.id === 'btn-edit-current-port') {
        this.openPortfolioEditModal(this.selectedPortfolioId);
        return;
      }

      // Add Trading Portfolio Modal
      if (target.id === 'btn-add-trading-port-modal') {
        this.openTradingPortEditModal(null);
        return;
      }

      // Edit Trading Portfolio Modal
      if (target.hasAttribute('data-edit-trading-port')) {
        const key = target.getAttribute('data-edit-trading-port');
        this.openTradingPortEditModal(key);
        return;
      }

      // Open Trading History Modal
      if (target.hasAttribute('data-log-trading-history')) {
        const key = target.getAttribute('data-log-trading-history');
        this.openTradingHistoryModal(key);
        return;
      }

      // Delete Trading History Month Entry
      if (target.hasAttribute('data-delete-trading-month')) {
        const idx = parseInt(target.getAttribute('data-delete-trading-month'));
        const key = target.getAttribute('data-trading-key');
        this.deleteTradingHistoryEntry(key, idx);
        return;
      }

      // Save Trading Monthly Balance
      if (target.hasAttribute('data-save-trading-key')) {
        const key = target.getAttribute('data-save-trading-key');
        const input = document.querySelector(`input[data-trading-key="${key}"]`);
        if (input && this.tradingData[key]) {
          const val = Number(input.value);
          if (!Number.isFinite(val) || val < 0 || input.value.trim()==='') { alert('ระบุยอดเงินตั้งแต่ศูนย์'); return; }
          const currentMonth = new Date().getMonth() + 1;
          const currentYear = new Date().getFullYear();
          if (!this.tradingData[key].monthlyBalances) this.tradingData[key].monthlyBalances = [];
          const list = this.tradingData[key].monthlyBalances;
          const lastIdx = list.findIndex(m => m.year === currentYear && m.month === currentMonth);
          if (lastIdx >= 0) {
            list[lastIdx].balanceUSD = val;
          } else {
            list.push({ year: currentYear, month: currentMonth, balanceUSD: val, note: 'อัปเดตรายเดือน' });
          }
          if (!await this.saveData()) return;
          this.renderActiveTab();
          this.showToast({
            icon: '💾',
            title: 'บันทึกยอดเงินสำเร็จ!',
            message: `${this.tradingData[key].name}: $${val.toFixed(2)} (${this.formatTHB(this.usdToThb(val))})`,
            type: 'success'
          });
        }
        return;
      }

      // Add Dividend Modal
      if (target.id === 'btn-add-dividend-modal') {
        this.openDividendModal();
        return;
      }

      // Delete Dividend
      if (target.hasAttribute('data-delete-dividend')) {
        const id = target.getAttribute('data-delete-dividend');
        if (confirm('ต้องการลบรายการปันผลนี้ใช่หรือไม่?')) {
          const dividend = this.dividends.find(d => d.id === id);
          if (dividend?.addedToCash) {
            const port = this.portfolios.find(p => p.id === dividend.portfolioId);
            if (!port || (port.cashBufferUSD || 0) < dividend.netUSD) { alert('เงินสดไม่พอย้อนรายการปันผล กรุณาตรวจยอดก่อนลบ'); return; }
            port.cashBufferUSD -= dividend.netUSD;
          }
          this.dividends = this.dividends.filter(d => d.id !== id);
          this.saveData().then(ok => { if(ok) this.showToast({
            icon: '🗑️',
            title: 'ลบรายการปันผลแล้ว',
            type: 'info'
          }); });
        }
        return;
      }

      // Take Quarterly Snapshot
      if (target.id === 'btn-take-quarter-snapshot') {
        this.takeQuarterlySnapshot();
        return;
      }

      // Reset Quarterly Snapshots for selected year
      if (target.id === 'btn-reset-quarter-data') {
        this.resetCurrentYearQuarterlySnapshots();
        return;
      }

      // Copy Obsidian Markdown
      if (target.id === 'btn-copy-obsidian-md') {
        const md = this.generateObsidianMarkdown();
        navigator.clipboard.writeText(md).then(() => {
          this.showToast({
            icon: '📋',
            title: 'คัดลอก Markdown สำเร็จ!',
            message: 'นำไปวางใน Obsidian หรือ AI Prompt ได้ทันที',
            type: 'info'
          });
        });
        return;
      }

      // Download Obsidian Markdown
      if (target.id === 'btn-download-obsidian-md') {
        const md = this.generateObsidianMarkdown();
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Financial_Quarter_Review_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        return;
      }

      // Force Cloud Push / Pull
      if (target.id === 'btn-force-cloud-push') {
        this.pushDataToCloud();
        return;
      }

      if (target.id === 'btn-force-cloud-pull') {
        if (this.dbRef) {
          this.dbRef.once('value').then(snap => {
            if (snap.val()) {
              this.acceptCloud(snap.val());
              alert('📥 ดึงข้อมูลล่าสุดจาก Firebase สำเร็จ!');
            }
          });
        }
        return;
      }

      // JSON Backup Export
      if (target.id === 'btn-export-json') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.dataPayload(), null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `pixel_steward_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        return;
      }
    });

    // Change events inside view container
    container?.addEventListener('change', (e) => {
      // Quarter Year Change
      if (e.target.id === 'select-quarter-year') {
        this.selectedQuarterYear = parseInt(e.target.value);
        this.renderActiveTab();
        return;
      }

      // JSON Backup Import
      if (e.target.id === 'input-import-json') {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const imported = JSON.parse(event.target.result);
              if (imported.portfolios) {
                this.handleCloudSync(imported).then(ok => { if (ok) alert('นำเข้าข้อมูลและบันทึกบน Cloud แล้ว'); });
              }
            } catch (err) {
              alert('❌ ไฟล์ JSON ไม่ถูกต้อง');
            }
          };
          reader.readAsText(file);
        }
      }
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update Nav links
    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Header title
    const titleMap = {
      dashboard: 'แดชบอร์ดภาพรวม',
      portfolios: 'พอร์ตการลงทุน & รายการสินทรัพย์',
      trading: 'Forex & Option Trading',
      dividends: 'บันทึกเงินปันผลรับ (Dividend Log)',
      simulator: 'จำลองเงินล้าน & ดอกเบี้ยทบต้น',
      quarterly: 'เปรียบเทียบผลงานรายไตรมาส',
      obsidian: 'Obsidian & AI Second Brain',
      settings: 'ตั้งค่าระบบ & ฐานข้อมูล'
    };

    const titleEl = document.getElementById('current-page-title');
    if (titleEl) titleEl.textContent = titleMap[tabName] || titleMap.dashboard;

    this.renderActiveTab();
  }

  // --- MODAL CONTROLS & FORMS ---
  setupModals() {
    // Close modal buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });

    // Trade Type Selector Toggle
    document.querySelectorAll('.trade-type-selector .radio-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const parent = card.closest('.trade-type-selector');
        parent.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        if (card.getAttribute('data-type')) {
          this.updateTradeCalculations();
        }
      });
    });

    // Trade Calculation Live Updates
    ['trade-shares', 'trade-price'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateTradeCalculations());
    });

    document.getElementById('trade-stock-select')?.addEventListener('change', () => this.updateTradeCalculations());

    // Holding Form Submit
    document.getElementById('form-holding')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveHoldingForm();
    });

    // Trade Form Submit
    document.getElementById('form-trade')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.executeTrade();
    });

    // Cash Buffer Form Submit
    document.getElementById('form-cash-buffer')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveCashBufferForm();
    });

    // Cash Buffer Live Two-Way USD <-> THB Converter
    document.getElementById('cash-amount-usd')?.addEventListener('input', (e) => {
      const usdVal = parseFloat(e.target.value);
      const thbEl = document.getElementById('cash-amount-thb');
      if (thbEl) {
        if (!isNaN(usdVal) && usdVal > 0) {
          thbEl.value = (usdVal * this.exchangeRate).toFixed(2);
        } else if (e.target.value === '') {
          thbEl.value = '';
        }
      }
    });

    document.getElementById('cash-amount-thb')?.addEventListener('input', (e) => {
      const thbVal = parseFloat(e.target.value);
      const usdEl = document.getElementById('cash-amount-usd');
      if (usdEl) {
        if (!isNaN(thbVal) && thbVal > 0) {
          usdEl.value = (thbVal / this.exchangeRate).toFixed(2);
        } else if (e.target.value === '') {
          usdEl.value = '';
        }
      }
    });

    // Dividend Form Calculations & Submit
    document.getElementById('dividend-gross-usd')?.addEventListener('input', (e) => {
      const gross = parseFloat(e.target.value) || 0;
      const tax = gross * 0.15;
      const net = gross - tax;
      const taxInput = document.getElementById('dividend-tax-usd');
      if (taxInput) taxInput.value = tax.toFixed(2);
      document.getElementById('dividend-net-usd').textContent = this.formatUSD(net);
      document.getElementById('dividend-net-thb').textContent = this.formatTHB(this.usdToThb(net));
    });

    document.getElementById('dividend-tax-usd')?.addEventListener('input', () => {
      const gross = parseFloat(document.getElementById('dividend-gross-usd').value) || 0;
      const tax = parseFloat(document.getElementById('dividend-tax-usd').value) || 0;
      const net = gross - tax;
      document.getElementById('dividend-net-usd').textContent = this.formatUSD(net);
      document.getElementById('dividend-net-thb').textContent = this.formatTHB(this.usdToThb(net));
    });

    // Live Ticker Preview Lookup
    document.getElementById('holding-ticker')?.addEventListener('input', (e) => {
      const sym = e.target.value.trim().toUpperCase();
      this.updateHoldingTickerPreview(sym);
    });

    document.getElementById('form-dividend')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveDividendForm();
    });

    // FX Rate Form Submit
    document.getElementById('form-fx-settings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newRate = parseFloat(document.getElementById('input-fx-rate').value);
      if (newRate > 0) {
        this.exchangeRate = newRate;
        this.updateSidebarFxRate();
        if (!await this.saveData()) return;
        this.closeModal('modal-fx-settings');
        alert(`💾 ตั้งค่าอัตราแลกเปลี่ยนเป็น ฿${newRate.toFixed(2)} เรียบร้อยแล้ว!`);
      }
    });

    document.getElementById('btn-fetch-live-fx')?.addEventListener('click', async () => {
      await this.fetchLiveExchangeRate();
      document.getElementById('input-fx-rate').value = this.exchangeRate.toFixed(2);
    });

    // Sub-Portfolio Edit Form Submit
    document.getElementById('form-portfolio-edit')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePortfolioEditForm();
    });

    document.getElementById('edit-port-goal-usd')?.addEventListener('input', (e) => {
      const usd = parseFloat(e.target.value) || 0;
      document.getElementById('edit-port-goal-thb').value = this.formatTHB(this.usdToThb(usd));
    });

    // Trading Port Edit Form Submit
    document.getElementById('form-trading-port-edit')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTradingPortEditForm();
    });

    // Trading Month Add Form Submit
    document.getElementById('form-add-trading-month')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTradingMonthForm();
    });

    // Custom Financial Achievement Form Submit & Delete
    document.getElementById('form-achievement')?.addEventListener('submit', (e) => {
      this.saveAchievementFromForm(e);
    });

    document.getElementById('btn-delete-achievement')?.addEventListener('click', (e) => {
      e.preventDefault();
      const id = document.getElementById('achievement-id')?.value;
      this.deleteAchievement(id);
    });

    // Trading Psychology Tag Selector Chips
    document.querySelectorAll('.psychology-tag-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.psychology-tag-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const tagVal = chip.getAttribute('data-tag');
        const inputVal = document.getElementById('trade-selected-tag');
        if (inputVal) inputVal.value = tagVal;
      });
    });

    // Share Card Modal Buttons
    document.getElementById('btn-open-share-card')?.addEventListener('click', () => {
      this.openShareCardModal();
    });

    document.getElementById('btn-share-format-sq')?.addEventListener('click', () => {
      this.shareCardFormat = 'square';
      document.getElementById('btn-share-format-sq')?.classList.add('active');
      document.getElementById('btn-share-format-story')?.classList.remove('active');
      this.renderShareableCardCanvas();
    });

    document.getElementById('btn-share-format-story')?.addEventListener('click', () => {
      this.shareCardFormat = 'story';
      document.getElementById('btn-share-format-story')?.classList.add('active');
      document.getElementById('btn-share-format-sq')?.classList.remove('active');
      this.renderShareableCardCanvas();
    });

    document.getElementById('btn-share-toggle-privacy')?.addEventListener('click', () => {
      this.shareCardPrivacy = !this.shareCardPrivacy;
      document.getElementById('btn-share-toggle-privacy')?.classList.toggle('active', this.shareCardPrivacy);
      this.renderShareableCardCanvas();
    });

    document.getElementById('btn-download-share-card')?.addEventListener('click', () => {
      this.downloadShareCardPNG();
    });

    document.getElementById('btn-copy-share-card')?.addEventListener('click', () => {
      this.copyShareCardToClipboard();
    });
  }



  // --- HOLDING ADD / EDIT ---
  openHoldingModal(holdingId, portfolioId) {
    const portSelect = document.getElementById('holding-portfolio-id');
    if (portSelect) {
      portSelect.innerHTML = this.portfolios.map(p => `
        <option value="${p.id}" ${p.id === portfolioId ? 'selected' : ''}>${p.emoji || ''} ${this.escapeHtml(p.name)}</option>
      `).join('');
    }

    const deleteBtn = document.getElementById('btn-delete-holding');

    if (holdingId) {
      const port = this.portfolios.find(p => p.id === portfolioId);
      const h = port?.holdings?.find(x => x.id === holdingId);
      if (h) {
        document.getElementById('modal-holding-title').textContent = '✏️ แก้ไขสินทรัพย์หุ้น';
        document.getElementById('holding-id').value = h.id;
        document.getElementById('holding-ticker').value = h.ticker;
        document.getElementById('holding-name').value = h.name || '';
        document.getElementById('holding-name').removeAttribute('data-autofilled');
        document.getElementById('holding-shares').value = h.shares !== undefined && h.shares !== null ? h.shares : '';
        document.getElementById('holding-avg-cost').value = h.avgCostUSD !== undefined && h.avgCostUSD !== null ? h.avgCostUSD : '';
        document.getElementById('holding-current-price').value = (h.currentPriceUSD !== undefined && h.currentPriceUSD !== null && h.currentPriceUSD > 0) ? Number(parseFloat(h.currentPriceUSD).toFixed(3)) : (h.avgCostUSD || '');
        document.getElementById('holding-1d-change').value = (h.change1dPct !== undefined && h.change1dPct !== null) ? Number(parseFloat(h.change1dPct).toFixed(2)) : '';
        
        // Populate 3-Tier Dip Targets
        const target1 = h.dipTarget1 !== undefined && h.dipTarget1 !== null ? h.dipTarget1 : (h.dipTargetUSD || '');
        const target2 = h.dipTarget2 !== undefined && h.dipTarget2 !== null ? h.dipTarget2 : '';
        const target3 = h.dipTarget3 !== undefined && h.dipTarget3 !== null ? h.dipTarget3 : '';

        const dt1 = document.getElementById('holding-dip-target-1');
        const dt2 = document.getElementById('holding-dip-target-2');
        const dt3 = document.getElementById('holding-dip-target-3');
        if (dt1) dt1.value = target1;
        if (dt2) dt2.value = target2;
        if (dt3) dt3.value = target3;
        
        this.updateHoldingTickerPreview(h.ticker);

        if (deleteBtn) {
          deleteBtn.classList.remove('hidden');
          deleteBtn.onclick = async (e) => {
            e.preventDefault();
            if (confirm(`ต้องการลบ ${this.escapeHtml(h.ticker)} ออกจากพอร์ตใช่หรือไม่?`)) {
              const targetPort = this.portfolios.find(p => p.id === portfolioId);
              if (targetPort && targetPort.holdings) {
                targetPort.holdings = targetPort.holdings.filter(x => x.id !== h.id);
                if (!await this.saveData()) return;
                this.closeModal('modal-holding');
                this.renderActiveTab();
              }
            }
          };
        }
      }
    } else {
      document.getElementById('modal-holding-title').textContent = '➕ เพิ่มสินทรัพย์หุ้นใหม่';
      document.getElementById('form-holding').reset();
      document.getElementById('holding-id').value = '';
      document.getElementById('holding-shares').value = '';
      document.getElementById('holding-avg-cost').value = '';
      document.getElementById('holding-current-price').value = '';
      document.getElementById('holding-1d-change').value = '';
      const dt1 = document.getElementById('holding-dip-target-1');
      const dt2 = document.getElementById('holding-dip-target-2');
      const dt3 = document.getElementById('holding-dip-target-3');
      if (dt1) dt1.value = '';
      if (dt2) dt2.value = '';
      if (dt3) dt3.value = '';
      document.getElementById('holding-name').removeAttribute('data-autofilled');
      if (portSelect) portSelect.value = portfolioId || this.selectedPortfolioId;
      this.updateHoldingTickerPreview('');
      deleteBtn?.classList.add('hidden');
    }

    this.openModal('modal-holding');
  }


  checkSingleHoldingDipAlert(h) {
    const price = h.currentPriceUSD || 0;
    if (price <= 0) return;

    const hits = [];
    if (h.dipTarget3 && price <= h.dipTarget3) {
      hits.push(`ไม้ 3 ($${h.dipTarget3})`);
    } else if (h.dipTarget2 && price <= h.dipTarget2) {
      hits.push(`ไม้ 2 ($${h.dipTarget2})`);
    } else if (h.dipTarget1 && price <= h.dipTarget1) {
      hits.push(`ไม้ 1 ($${h.dipTarget1})`);
    } else if (h.dipTargetUSD && price <= h.dipTargetUSD) {
      hits.push(`$${h.dipTargetUSD}`);
    }

    if (hits.length > 0) {
      this.showToast({
        icon: '🎯',
        title: `🔥 [${this.escapeHtml(h.ticker)}] ราคาถึงจุดช้อนแล้ว!`,
        message: `ราคาตลาดปัจจุบัน $${price.toFixed(2)} ถึงแนวรับ ${hits.join(', ')}`,
        type: 'warning',
        duration: 6000
      });
    }
  }

  checkAllDipPriceAlerts() {
    let triggeredCount = 0;
    this.portfolios.forEach(p => {
      (p.holdings || []).forEach(h => {
        const price = h.currentPriceUSD || 0;
        if (price <= 0) return;

        const dip1 = h.dipTarget1 || h.dipTargetUSD || 0;
        const dip2 = h.dipTarget2 || 0;
        const dip3 = h.dipTarget3 || 0;

        if ((dip1 > 0 && price <= dip1) || (dip2 > 0 && price <= dip2) || (dip3 > 0 && price <= dip3)) {
          triggeredCount++;
        }
      });
    });

    if (triggeredCount > 0) {
      this.showToast({
        icon: '🎯',
        title: `🔥 พบ ${triggeredCount} สินทรัพย์ถึงจุดเล็งช้อน!`,
        message: 'ราคาตลาดลงมาแตะแนวรับที่คุณตั้งไว้ เปิดดูได้ในแท็บแยกพอร์ต',
        type: 'warning',
        duration: 6000
      });
    }
  }

  // --- TRADE MODAL & DCA ENGINE ---
  populateTradeStockSelect(preselectedPortId = null, preselectedHoldingId = null) {
    const select = document.getElementById('trade-stock-select');
    if (!select) return;

    let html = '';
    this.portfolios.forEach(p => {
      html += `<optgroup label="${p.emoji || ''} ${this.escapeHtml(p.name)}">`;
      (p.holdings || []).forEach(h => {
        const isSelected = (p.id === preselectedPortId && h.id === preselectedHoldingId);
        html += `<option value="${p.id}:::${h.id}" ${isSelected ? 'selected' : ''}>${this.escapeHtml(h.ticker)} (${h.name || h.ticker})</option>`;
      });
      html += `</optgroup>`;
    });

    select.innerHTML = html;
    this.updateTradeCalculations();
  }

  openTradeModalForHolding(holdingId, portId, prefillPrice = null) {
    this.populateTradeStockSelect(portId, holdingId);
    const port = this.portfolios.find(p => p.id === portId);
    const h = port?.holdings?.find(x => x.id === holdingId);
    if (h) {
      const priceToUse = (prefillPrice && prefillPrice > 0) ? prefillPrice : (h.currentPriceUSD || h.avgCostUSD || 100);
      document.getElementById('trade-price').value = priceToUse.toFixed(2);
      document.getElementById('trade-shares').value = '';
    }
    this.openModal('modal-trade');
  }

  updateTradeCalculations() {
    const selectVal = document.getElementById('trade-stock-select')?.value;
    if (!selectVal) return;

    const [portId, holdingId] = selectVal.split(':::');
    const port = this.portfolios.find(p => p.id === portId);
    const h = port?.holdings?.find(x => x.id === holdingId);
    if (!port || !h) return;

    const type = document.querySelector('input[name="trade-type"]:checked')?.value || 'BUY';
    const sharesInput = parseFloat(document.getElementById('trade-shares')?.value) || 0;
    const priceInput = parseFloat(document.getElementById('trade-price')?.value) || (h.currentPriceUSD || h.avgCostUSD || 0);

    const summaryEl = document.getElementById('trade-holding-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="font-size: 13px; color: #fff;"><strong>${this.escapeHtml(port.name)} ➔ ${this.escapeHtml(h.ticker)}</strong></div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
          หุ้นปัจจุบัน: <strong class="font-mono">${h.shares}</strong> | ต้นทุนเดิม: <strong class="font-mono">$${h.avgCostUSD.toFixed(4)}</strong> | ราคาตลาด: <strong class="font-mono text-emerald">$${(h.currentPriceUSD || h.avgCostUSD).toFixed(2)}</strong>
        </div>
      `;
    }

    const totalUSD = sharesInput * priceInput;
    const totalTHB = this.usdToThb(totalUSD);

    document.getElementById('trade-total-usd').textContent = this.formatUSD(totalUSD);
    document.getElementById('trade-total-thb').textContent = this.formatTHB(totalTHB);

    const btnSubmit = document.getElementById('btn-submit-trade');
    const avgLabel = document.getElementById('trade-avg-label');
    const avgVal = document.getElementById('trade-new-avg');

    if (type === 'BUY') {
      btnSubmit.textContent = `🟢 ยืนยันซื้อ ${this.escapeHtml(h.ticker)} ($${totalUSD.toFixed(2)})`;
      btnSubmit.className = 'btn btn-primary btn-glow';
      avgLabel.textContent = 'ต้นทุนเฉลี่ยใหม่หลังซื้อ (Weighted Avg Cost):';

      const oldTotalCost = (h.shares || 0) * (h.avgCostUSD || 0);
      const newTotalShares = (h.shares || 0) + sharesInput;
      const newAvgCost = newTotalShares > 0 ? (oldTotalCost + totalUSD) / newTotalShares : 0;
      avgVal.textContent = `$${newAvgCost.toFixed(4)}`;
      avgVal.className = 'font-mono text-emerald';
    } else {
      btnSubmit.textContent = `🔴 ยืนยันขาย ${this.escapeHtml(h.ticker)} ($${totalUSD.toFixed(2)})`;
      btnSubmit.className = 'btn btn-danger';
      avgLabel.textContent = 'กำไร/ขาดทุนรับรู้ (Realized P/L):';

      const costOfSoldShares = sharesInput * (h.avgCostUSD || 0);
      const realizedPL = totalUSD - costOfSoldShares;
      const realizedPct = costOfSoldShares > 0 ? (realizedPL / costOfSoldShares) * 100 : 0;
      avgVal.textContent = `${this.formatUSD(realizedPL)} (${this.formatPercent(realizedPct)})`;
      avgVal.className = `font-mono ${realizedPL >= 0 ? 'text-emerald' : 'text-rose'}`;
    }

    // Cash buffer helper text
    const cashBufEl = document.getElementById('trade-available-cash');
    if (cashBufEl) {
      cashBufEl.textContent = `เงินไว้ช้อนคงเหลือใน ${port.name.split(' ')[0]}: ${this.formatUSD(port.cashBufferUSD || 0)} (${this.formatTHB(this.usdToThb(port.cashBufferUSD || 0))})`;
    }
  }

  async executeTrade() {
    const selectVal = document.getElementById('trade-stock-select').value;
    const [portId, holdingId] = selectVal.split(':::');
    const port = this.portfolios.find(p => p.id === portId);
    const h = port?.holdings?.find(x => x.id === holdingId);
    if (!port || !h) return;

    const type = document.querySelector('input[name="trade-type"]:checked').value;
    const tradeShares = parseFloat(document.getElementById('trade-shares').value) || 0;
    const tradePrice = parseFloat(document.getElementById('trade-price').value) || 0;
    const useCashBuffer = document.getElementById('trade-use-cash-buffer').checked;
    const psychologyTag = document.getElementById('trade-selected-tag')?.value || '🎯 ช้อนตามแนวรับ';
    const customNote = (document.getElementById('trade-custom-note')?.value || '').trim();

    if (!Number.isFinite(tradeShares) || !Number.isFinite(tradePrice) || tradeShares <= 0 || tradePrice <= 0) {
      alert('กรุณากรอกจำนวนหุ้นและราคาให้ถูกต้อง');
      return;
    }

    const tradeTotalUSD = tradeShares * tradePrice;
    const costBeforeUSD = this.calculateHoldingStats(h).avgCost;
    h.avgCostUSD = costBeforeUSD;

    if (type === 'BUY') {
      // Check cash buffer
      if (useCashBuffer) {
        if ((port.cashBufferUSD || 0) < tradeTotalUSD) {
          alert('เงินสดไม่พอ กรุณาบันทึกเงินเติมก่อนบันทึกซื้อ');
          return;
        }
        port.cashBufferUSD = Math.max(0, (port.cashBufferUSD || 0) - tradeTotalUSD);
      }

      // Calculate new weighted avg cost
      const oldTotalCost = (h.shares || 0) * (h.avgCostUSD || 0);
      const newTotalShares = (h.shares || 0) + tradeShares;
      const newAvgCost = newTotalShares > 0 ? (oldTotalCost + tradeTotalUSD) / newTotalShares : tradePrice;

      h.shares = newTotalShares;
      h.avgCostUSD = newAvgCost;
      // Execution price is not a market quote.

      this.showToast({
        icon: '🟢',
        title: 'กำลังบันทึกรายการซื้อ',
        message: `ซื้อ ${this.escapeHtml(h.ticker)} จำนวน ${tradeShares} หุ้น [${psychologyTag}] (ต้นทุนเฉลี่ยใหม่: $${newAvgCost.toFixed(4)})`,
        type: 'success'
      });
    } else {
      // SELL
      if ((h.shares || 0) < tradeShares) {
        this.showToast({
          icon: '⚠️',
          title: 'มีหุ้นไม่พอขาย!',
          message: `มี ${h.shares} หุ้น แต่ต้องการขาย ${tradeShares} หุ้น`,
          type: 'error'
        });
        return;
      }

      h.shares = Math.max(0, (h.shares || 0) - tradeShares);
      if (useCashBuffer) {
        port.cashBufferUSD = (port.cashBufferUSD || 0) + tradeTotalUSD;
      }

      this.showToast({
        icon: '🔴',
        title: 'กำลังบันทึกรายการขาย',
        message: `ขาย ${this.escapeHtml(h.ticker)} จำนวน ${tradeShares} หุ้น [${psychologyTag}] ได้เงิน $${tradeTotalUSD.toFixed(2)}`,
        type: 'success'
      });
    }

    if (h.currency === 'THB') h.avgCostNative = h.avgCostUSD * this.exchangeRate;
    if (!useCashBuffer) this.cashFlows.push({id:crypto.randomUUID(),portfolioId:port.id,type:type==='BUY'?'DEPOSIT':'WITHDRAW',date:PortfolioCore.bangkokDate(),at:new Date().toISOString(),amountUSD:tradeTotalUSD,amountTHB:tradeTotalUSD*this.exchangeRate,note:'เงินภายนอกพอร์ตจากรายการ '+type+' '+h.ticker});
    if (!this.tradingHistory) this.tradingHistory = [];
    this.tradingHistory.unshift({
      id: 'trade-' + Date.now(),
      date: new Date().toISOString(),
      type,
      portfolioId: port.id,
      portfolioName: port.name,
      ticker: h.ticker,
      shares: tradeShares,
      priceUSD: tradePrice,
      totalUSD: tradeTotalUSD,
      realizedPLUSD: type === 'SELL' ? tradeTotalUSD - tradeShares * costBeforeUSD : null,
      exchangeRate: this.exchangeRate,
      psychologyTag,
      note: customNote
    });

    if (await this.saveData()) { this.closeModal('modal-trade'); this.renderActiveTab(); this.showToast({title:'บันทึกรายการบน Cloud แล้ว',type:'success'}); }
  }

  // --- CASH BUFFER MODAL & LOGIC ---
  openCashBufferModal(portId) {
    const port = this.portfolios.find(p => p.id === portId);
    if (!port) return;

    document.getElementById('cash-buffer-port-id').value = port.id;
    document.getElementById('cash-buffer-port-name').textContent = `พอร์ต: ${port.emoji || ''} ${this.escapeHtml(port.name)}`;
    document.getElementById('cash-current-usd').textContent = this.formatUSD(port.cashBufferUSD || 0);
    document.getElementById('cash-current-thb').textContent = this.formatTHB(this.usdToThb(port.cashBufferUSD || 0));
    document.getElementById('cash-amount-usd').value = '';
    document.getElementById('cash-amount-thb').value = '';
    document.getElementById('cash-note').value = '';

    this.openModal('modal-cash-buffer');
  }


  // --- DIVIDEND MODAL & LOGIC ---
  openDividendModal() {
    const portSelect = document.getElementById('dividend-portfolio-id');
    if (portSelect) {
      portSelect.innerHTML = this.portfolios.map(p => `
        <option value="${p.id}">${p.emoji || ''} ${this.escapeHtml(p.name)}</option>
      `).join('');
    }

    document.getElementById('form-dividend').reset();
    document.getElementById('dividend-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('dividend-net-usd').textContent = '$0.00';
    document.getElementById('dividend-net-thb').textContent = '฿0.00';

    this.openModal('modal-dividend');
  }

  async saveDividendForm() {
    const date = document.getElementById('dividend-date').value;
    const ticker = document.getElementById('dividend-ticker').value.trim().toUpperCase();
    const portfolioId = document.getElementById('dividend-portfolio-id').value;
    const grossUSD = parseFloat(document.getElementById('dividend-gross-usd').value) || 0;
    const taxUSD = parseFloat(document.getElementById('dividend-tax-usd').value) || 0;
    const netUSD = grossUSD - taxUSD;
    const notes = document.getElementById('dividend-notes').value.trim();
    const addToCash = document.getElementById('dividend-add-to-cash-buffer').checked;
    if (!date || date > PortfolioCore.bangkokDate() || !ticker || !Number.isFinite(grossUSD) || !Number.isFinite(taxUSD) || grossUSD < 0 || taxUSD < 0 || taxUSD > grossUSD) { alert('ตรวจวันที่ จำนวนเงิน และภาษีให้ถูกต้อง'); return; }

    const newDiv = {
      id: 'div-' + Date.now(),
      date,
      ticker,
      portfolioId,
      grossUSD,
      taxUSD,
      netUSD,
      addedToCash: addToCash,
      notes
    };

    this.dividends.unshift(newDiv);

    if (addToCash) {
      const port = this.portfolios.find(p => p.id === portfolioId);
      if (port) {
        port.cashBufferUSD = (port.cashBufferUSD || 0) + netUSD;
      }
    }

    if (!await this.saveData()) return;
    this.closeModal('modal-dividend');
    this.renderActiveTab();
    this.showToast({
      icon: '💰',
      title: 'บันทึกเงินปันผลสำเร็จ!',
      message: `${ticker}: Net $${netUSD.toFixed(2)} (${this.formatTHB(this.usdToThb(netUSD))})`,
      type: 'success'
    });
  }

  // --- SUBPORTFOLIO EDIT / CREATE MODAL ---
  setupPortfolioEmojiPicker() {
    const container = document.getElementById('portfolio-emoji-picker');
    const emojiInput = document.getElementById('edit-port-emoji');
    if (!container || !emojiInput) return;

    container.querySelectorAll('.emoji-pick-btn').forEach(btn => {
      btn.onclick = () => {
        const em = btn.getAttribute('data-emoji');
        if (em) {
          emojiInput.value = em;
          container.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      };
    });
  }

  openPortfolioEditModal(portId) {
    const deletePortBtn = document.getElementById('btn-delete-portfolio');

    if (portId) {
      const port = this.portfolios.find(p => p.id === portId);
      if (!port) return;

      document.getElementById('modal-portfolio-title').textContent = '📁 แก้ไขข้อมูลพอร์ตการลงทุน';
      document.getElementById('edit-port-id').value = port.id;
      document.getElementById('edit-port-name').value = port.name;
      document.getElementById('edit-port-emoji').value = port.emoji || '📁';
      document.getElementById('edit-port-tier').value = port.tier || 'Tier 1';
      document.getElementById('edit-port-horizon').value = port.timeHorizon || '';
      document.getElementById('edit-port-color').value = port.color || '#10b981';
      document.getElementById('edit-port-goal-usd').value = port.goalUSD || 0;
      document.getElementById('edit-port-goal-thb').value = this.formatTHB(this.usdToThb(port.goalUSD || 0));
      document.getElementById('edit-port-notes').value = port.notes || '';

      if (deletePortBtn) {
        deletePortBtn.classList.remove('hidden');
        deletePortBtn.onclick = async (e) => {
          e.preventDefault();
          if (confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบพอร์ต "${this.escapeHtml(port.name)}" และสินทรัพย์ทั้งหมดในพอร์ตนี้?\n(การกระทำนี้ไม่สามารถย้อนกลับได้)`)) {
            this.portfolios = this.portfolios.filter(p => p.id !== port.id);
            if (this.selectedPortfolioId === port.id) {
              this.selectedPortfolioId = this.portfolios[0]?.id || 'zero1';
            }
            if (!await this.saveData()) return;
            this.closeModal('modal-portfolio-edit');
            this.renderActiveTab();
            this.showToast({
              icon: '🗑️',
              title: 'ลบพอร์ตแล้ว',
              message: `ลบพอร์ต ${this.escapeHtml(port.name)} เรียบร้อย`,
              type: 'info'
            });
          }
        };
      }
    } else {
      document.getElementById('modal-portfolio-title').textContent = '➕ เพิ่มพอร์ตการลงทุนใหม่';
      document.getElementById('form-portfolio-edit').reset();
      document.getElementById('edit-port-id').value = '';
      document.getElementById('edit-port-emoji').value = '📁';
      document.getElementById('edit-port-horizon').value = '';
      document.getElementById('edit-port-color').value = '#10b981';
      document.getElementById('edit-port-goal-thb').value = '฿0.00';
      if (deletePortBtn) deletePortBtn.classList.add('hidden');
    }

    this.setupPortfolioEmojiPicker();
    this.openModal('modal-portfolio-edit');
  }

  async savePortfolioEditForm() {
    const portId = document.getElementById('edit-port-id').value;
    const name = document.getElementById('edit-port-name').value.trim();
    const emoji = document.getElementById('edit-port-emoji').value.trim() || '📁';
    const tier = document.getElementById('edit-port-tier').value;
    const timeHorizon = document.getElementById('edit-port-horizon')?.value.trim() || '';
    const color = document.getElementById('edit-port-color').value;
    const goalUSD = parseFloat(document.getElementById('edit-port-goal-usd').value) || 0;
    const notes = document.getElementById('edit-port-notes').value.trim();

    if (portId) {
      const port = this.portfolios.find(p => p.id === portId);
      if (port) {
        port.name = name;
        port.emoji = emoji;
        port.tier = tier;
        port.timeHorizon = timeHorizon;
        port.color = color;
        port.goalUSD = goalUSD;
        port.notes = notes;
        delete port.logo; // Remove legacy image logo if any
      }
    } else {
      const newPort = {
        id: 'port-' + Date.now(),
        name,
        emoji,
        tier,
        category: 'Custom',
        timeHorizon,
        color,
        goalUSD,
        cashBufferUSD: 0.00,
        notes,
        holdings: []
      };
      this.portfolios.push(newPort);
      this.selectedPortfolioId = newPort.id;
    }

    if (!await this.saveData()) return;
    this.closeModal('modal-portfolio-edit');
    this.showToast({
      icon: '💾',
      title: 'บันทึกพอร์ตสำเร็จ!',
      message: `ข้อมูลพอร์ต ${name} ได้รับการอัปเดตแล้ว`,
      type: 'success'
    });
    this.renderActiveTab();
  }

  // --- TRADING PORTFOLIO CRUD & HISTORY METHODS ---
  openTradingPortEditModal(key) {
    const deleteBtn = document.getElementById('btn-delete-trading-port');
    if (key && this.tradingData[key]) {
      const item = this.tradingData[key];
      const list = item.monthlyBalances || [];
      const latestUSD = list.length > 0 ? list[list.length - 1].balanceUSD : 0;

      document.getElementById('modal-trading-port-title').textContent = '⚙️ แก้ไขข้อมูลพอร์ตเทรด';
      document.getElementById('edit-trading-key').value = key;
      document.getElementById('edit-trading-name').value = item.name;
      document.getElementById('edit-trading-color').value = item.color || '#38bdf8';
      document.getElementById('edit-trading-balance').value = latestUSD;

      if (deleteBtn) {
        deleteBtn.classList.remove('hidden');
        deleteBtn.onclick = async (e) => {
          e.preventDefault();
          if (confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบพอร์ตเทรด "${this.escapeHtml(item.name)}" และประวัติทั้งหมด?\n(การกระทำนี้ไม่สามารถย้อนกลับได้)`)) {
            delete this.tradingData[key];
            if (!await this.saveData()) return;
            this.closeModal('modal-trading-port-edit');
            this.renderActiveTab();
            alert(`🗑️ ลบพอร์ตเทรด ${this.escapeHtml(item.name)} เรียบร้อยแล้ว`);
          }
        };
      }
    } else {
      document.getElementById('modal-trading-port-title').textContent = '➕ เพิ่มพอร์ตเทรดใหม่';
      document.getElementById('form-trading-port-edit').reset();
      document.getElementById('edit-trading-key').value = '';
      document.getElementById('edit-trading-color').value = '#38bdf8';
      document.getElementById('edit-trading-balance').value = '0';
      if (deleteBtn) deleteBtn.classList.add('hidden');
    }

    this.openModal('modal-trading-port-edit');
  }

  async saveTradingPortEditForm() {
    const key = document.getElementById('edit-trading-key').value;
    const name = document.getElementById('edit-trading-name').value.trim();
    const color = document.getElementById('edit-trading-color').value;
    const balanceUSD = Number(document.getElementById('edit-trading-balance').value);
    if(!name || !Number.isFinite(balanceUSD) || balanceUSD<0){alert('ตรวจชื่อและยอดเงินตั้งแต่ศูนย์');return;}

    if (!this.tradingData) this.tradingData = {};

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    if (key && this.tradingData[key]) {
      this.tradingData[key].name = name;
      this.tradingData[key].color = color;
      
      const list = this.tradingData[key].monthlyBalances ||= [];
      const lastIdx = list.findIndex(m => m.year === currentYear && m.month === currentMonth);
      if (lastIdx >= 0) {
        list[lastIdx].balanceUSD = balanceUSD;
      } else {
        list.push({ year: currentYear, month: currentMonth, balanceUSD, note: 'อัปเดตรายเดือน' });
      }
    } else {
      const newKey = 'trade_' + Date.now();
      this.tradingData[newKey] = {
        name,
        color,
        monthlyBalances: [
          { year: currentYear, month: currentMonth, balanceUSD, note: 'เปิดพอร์ต' }
        ]
      };
    }

    if (!await this.saveData()) return;
    this.closeModal('modal-trading-port-edit');
    this.renderActiveTab();
    alert(`💾 บันทึกพอร์ตเทรด "${name}" สำเร็จ!`);
  }

  openTradingHistoryModal(key) {
    if (!key || !this.tradingData[key]) return;
    const item = this.tradingData[key];

    document.getElementById('modal-trading-history-title').textContent = `📅 ประวัติรายเดือน: ${this.escapeHtml(item.name)}`;
    document.getElementById('history-trading-key').value = key;
    document.getElementById('hist-year').value = new Date().getFullYear();
    document.getElementById('hist-month').value = new Date().getMonth() + 1;
    document.getElementById('hist-balance').value = '';
    document.getElementById('hist-note').value = '';

    this.renderTradingHistoryList(key);
    this.openModal('modal-trading-history');
  }

  renderTradingHistoryList(key) {
    const listEl = document.getElementById('trading-history-list');
    if (!listEl || !this.tradingData[key]) return;

    const balances = this.tradingData[key].monthlyBalances || [];
    if (balances.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px;">ยังไม่มีประวัติรายเดือน</div>`;
      return;
    }

    const sorted = [...balances].reverse();

    listEl.innerHTML = sorted.map((m) => {
      const origIdx = balances.indexOf(m);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
          <div>
            <div class="font-mono" style="font-weight: 700; color: #fff; font-size: 14px;">${m.year}-${String(m.month).padStart(2, '0')}: <span class="text-amber">$${(m.balanceUSD || 0).toFixed(2)}</span></div>
            <div style="font-size: 11px; color: var(--text-muted);">${m.note || 'ไม่มีโน้ต'}</div>
          </div>
          <button class="btn-icon-xs text-rose" data-delete-trading-month="${origIdx}" data-trading-key="${key}" title="ลบรายการนี้">🗑️</button>
        </div>
      `;
    }).join('');
  }

  async saveTradingMonthForm() {
    const key = document.getElementById('history-trading-key').value;
    if (!key || !this.tradingData[key]) return;

    const year = parseInt(document.getElementById('hist-year').value) || new Date().getFullYear();
    const month = parseInt(document.getElementById('hist-month').value) || 1;
    const balanceUSD = Number(document.getElementById('hist-balance').value);
    if(!Number.isFinite(balanceUSD)||balanceUSD<0||month<1||month>12||year<1900||year*12+month>Number(PortfolioCore.bangkokDate().slice(0,4))*12+Number(PortfolioCore.bangkokDate().slice(5,7))){alert('ตรวจยอดเงินและเดือนที่ไม่เกินปัจจุบัน');return;}
    const note = document.getElementById('hist-note').value.trim();

    if (!this.tradingData[key].monthlyBalances) {
      this.tradingData[key].monthlyBalances = [];
    }

    const list = this.tradingData[key].monthlyBalances;
    const existIdx = list.findIndex(m => m.year === year && m.month === month);
    if (existIdx >= 0) {
      list[existIdx] = { year, month, balanceUSD, note };
    } else {
      list.push({ year, month, balanceUSD, note });
      list.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
    }

    if (!await this.saveData()) return;
    this.renderTradingHistoryList(key);
    this.renderActiveTab();
    alert(`💾 บันทึกยอดเงินเดือน ${year}-${String(month).padStart(2, '0')} เรียบร้อย!`);
  }

  async deleteTradingHistoryEntry(key, index) {
    if (!key || !this.tradingData[key]) return;
    if (confirm('ต้องการลบประวัติของเดือนนี้ใช่หรือไม่?')) {
      const list = this.tradingData[key].monthlyBalances || [];
      if (index >= 0 && index < list.length) {
        list.splice(index, 1);
        if (!await this.saveData()) return;
        this.renderTradingHistoryList(key);
        this.renderActiveTab();
      }
    }
  }

  // --- PWA REGISTRATION ---
  registerPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.1.1')
          .then(reg => {
            console.log('PWA Service Worker registered:', reg.scope);
            reg.update();
          })
          .catch(err => console.log('Service Worker registration failed:', err));
      });
    }
  }
}

// --- INSTANTIATE APP ON DOM LOADED ---
document.addEventListener('DOMContentLoaded', () => {
  window.pixelApp = new PixelStewardApp();
});
