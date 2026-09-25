import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, WalletCards, ArrowLeftRight, Users, FileLock2, Bot,
  Settings, LogOut, Plus, Upload, Search, ShieldCheck, TrendingUp,
  TrendingDown, CircleDollarSign, RefreshCw, LockKeyhole, Eye, EyeOff,
  Sparkles, Database, Download, CheckCircle2, AlertTriangle, BrainCircuit,
  Pencil, Trash2, ChevronUp, ChevronDown, X, BarChart3, PiggyBank,
  ArrowRight, ArrowLeft, Loader2, SlidersHorizontal, ChevronsUpDown, Receipt,
  Clock
} from 'lucide-react';
import logoImg from '../logo.png';
import profileImg from '../Profile.jpeg';
import './styles.css';

export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const round4 = n => Math.round((Number(n) || 0) * 10000) / 10000;
export const addMoney = (a, b) => Math.round((Number(a) || 0) * 100 + (Number(b) || 0) * 100) / 100;
export const subMoney = (a, b) => Math.round((Number(a) || 0) * 100 - (Number(b) || 0) * 100) / 100;
export const mulMoney = (qty, price) => Math.round((Number(qty) || 0) * (Number(price) || 0) * 100) / 100;

export const calcAvgCost = (oldQty, oldAvg, addedQty, addedPrice) => {
  const oQ = Number(oldQty) || 0;
  const aQ = Number(addedQty) || 0;
  const totalQty = round4(oQ + aQ);
  if (totalQty <= 0) return 0;
  const totalCost = (oQ * (Number(oldAvg) || 0)) + (aQ * (Number(addedPrice) || 0));
  return round4(totalCost / totalQty);
};

// ── Currency Conversion Utilities ────────────────────────────────────────────
export const DEFAULT_RATES = { INR: 1, USD: 86.8, EUR: 92.5, GBP: 110.2, AED: 23.6, SGD: 64.8 };

export const toBase = (amount, cur = 'INR', rates = DEFAULT_RATES, base = 'INR') => {
  const fromRate = rates[cur] || (cur === 'INR' ? 1 : 86.8);
  const toRate = rates[base] || 1;
  const inINR = (Number(amount) || 0) * fromRate;
  return round2(inINR / toRate);
};

const money = (n, c = 'INR') => {
  const rounded = round2(n);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: c || 'INR', maximumFractionDigits: 2,
    }).format(rounded);
  } catch { return `${c || 'INR'} ${rounded.toFixed(2)}`; }
};

// ── Profile Photo Configuration ──────────────────────────────────────────────
// Set your profile photo path or image URL here (e.g., "Profile.jpeg", "logo.png", or a web URL)
export const USER_PHOTO_PATH = 'Profile.jpeg';

export const resolvePhotoSrc = p => {
  if (!p || typeof p !== 'string') return logoImg;
  const trimmed = p.trim();
  if (!trimmed) return logoImg;
  if (/^(https?:\/\/|data:|blob:)/i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]:[\\\/]/.test(trimmed)) {
    const clean = trimmed.replace(/\\/g, '/');
    return `file:///${clean}`;
  }
  const lower = trimmed.toLowerCase();
  if (lower.endsWith('profile.jpeg') || lower.endsWith('profile.jpg')) {
    return profileImg;
  }
  if (lower.endsWith('logo.png')) {
    return logoImg;
  }
  if (trimmed.startsWith('./')) return trimmed;
  if (trimmed.startsWith('/')) return `.${trimmed}`;
  return `./${trimmed}`;
};

const uid   = () => crypto.randomUUID();
const base64Bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const norm  = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const fmtChg = (v, pct) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)} (${pct >= 0 ? '+' : ''}${Number(pct).toFixed(2)}%)`;

const TYPE_MAP = {
  equity:'Stock',stock:'Stock',stocks:'Stock',share:'Stock',shares:'Stock',
  mutualfund:'Mutual Fund',mutualfunds:'Mutual Fund',mf:'Mutual Fund',fund:'Mutual Fund',
  etf:'ETF',bond:'Bond',bonds:'Bond',fd:'FD',fixeddeposit:'FD',
  cash:'Cash',gold:'Gold',crypto:'Crypto',reit:'REIT',
};
const classify = t => TYPE_MAP[norm(t)] || 'Other';
const ASSET_TYPES = ['Stock','Mutual Fund','ETF','Bond','FD','Cash','Gold','Crypto','REIT','Other'];
const TX_TYPES    = ['BUY','SELL','DIVIDEND','INTEREST','DEPOSIT','WITHDRAWAL','FEE','OTHER'];

// Precise family relations requested by user
export const FAMILY_RELATIONS = ['Father', 'Mother', 'Sister', 'Brother', 'Spouse', 'Child', 'Other'];

// 7-day retention for uploaded statements & extracted documents
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function filterActiveDocuments(docs = []) {
  const now = Date.now();
  const active = [];
  const expiredIds = [];
  for (const d of docs) {
    const addedTime = d.addedAt ? new Date(d.addedAt).getTime() : 0;
    const expiresTime = d.expiresAt ? new Date(d.expiresAt).getTime() : (addedTime ? addedTime + SEVEN_DAYS_MS : 0);
    if (expiresTime > 0 && now >= expiresTime) {
      expiredIds.push(d.id);
    } else {
      active.push({
        ...d,
        addedAt: d.addedAt || new Date().toISOString(),
        expiresAt: d.expiresAt || (addedTime ? new Date(addedTime + SEVEN_DAYS_MS).toISOString() : new Date(now + SEVEN_DAYS_MS).toISOString()),
      });
    }
  }
  return { active, expiredIds };
}

// Assets that get price from API — no manual price input
const MARKET_PRICED = new Set(['Stock','Mutual Fund','ETF']);
const MANUAL_PRICED = new Set(['Bond','FD','Cash','Gold','Crypto','REIT','Other']);

const TYPE_META = [
  { type:'Stock',       icon:'📈', desc:'Indian (NSE/BSE) or US equities' },
  { type:'Mutual Fund', icon:'🏦', desc:'Indian MFs via MFAPI · live NAV' },
  { type:'ETF',         icon:'📊', desc:'Exchange-traded funds · live price' },
  { type:'Bond',        icon:'🔒', desc:'Government or corporate bonds' },
  { type:'FD',          icon:'💰', desc:'Fixed deposits · bank / NBFC' },
  { type:'Gold',        icon:'🪙', desc:'Physical gold or Sovereign Gold Bond' },
  { type:'Crypto',      icon:'₿',  desc:'Bitcoin, ETH and other crypto assets' },
  { type:'REIT',        icon:'🏢', desc:'Real estate investment trusts' },
  { type:'Cash',        icon:'💵', desc:'Savings, liquid funds, current account' },
  { type:'Other',       icon:'📁', desc:'Any other asset' },
];

function totals(v, rates = DEFAULT_RATES, base = 'INR') {
  let value = 0;
  let cost = 0;
  (v?.holdings || []).filter(h => (Number(h.qty) || 0) > 0).forEach(h => {
    const qty = Number(h.qty) || 0;
    const curVal = mulMoney(qty, Number(h.current) || 0);
    const costVal = mulMoney(qty, Number(h.avg) || 0);
    const valBase = toBase(curVal, h.currency || 'INR', rates, base);
    const costBase = toBase(costVal, h.currency || 'INR', rates, base);
    value = addMoney(value, valBase);
    cost = addMoney(cost, costBase);
  });
  const gain = subMoney(value, cost);
  return { value, cost, gain };
}

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const [hasVault,    setHasVault]    = useState(null);
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [vault,       setVault]       = useState(null);
  const [page,        setPage]        = useState('dashboard');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [rates,       setRates]       = useState(DEFAULT_RATES);
  const [refreshing,  setRefreshing]  = useState(false);
  const [refreshMsg,  setRefreshMsg]  = useState('');

  useEffect(() => {
    window.vaultAPI.exists().then(setHasVault);
    // Fetch live currency rates on load
    if (window.marketAPI?.getRates) {
      window.marketAPI.getRates().then(r => {
        if (r?.ok && r.rates) setRates(prev => ({ ...prev, ...r.rates }));
      }).catch(() => {});
    }
  }, []);

  if (hasVault === null) return <div className="boot">Loading secure vault…</div>;

  if (!vault) return (
    <Login {...{hasVault,password,setPassword,confirm,setConfirm,showPass,setShowPass,error,busy}}
      onSubmit={async () => {
        setError('');
        if (!password) return setError('Enter a master password.');
        if (!hasVault && password !== confirm) return setError('Passwords do not match.');
        setBusy(true);
        const r = hasVault ? await window.vaultAPI.open(password) : await window.vaultAPI.create(password);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setVault(migrate(r.vault));
      }} />
  );

  const save = async next => {
    const v = migrate(next); setVault(v);
    const r = await window.vaultAPI.save(password, v);
    if (!r.ok) alert(r.error || 'Could not save vault.');
  };

  // Global batch price and FX refresh
  const refreshMarketPrices = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg('Fetching live market quotes & FX rates…');
    try {
      // 1. Update FX rates
      if (window.marketAPI?.getRates) {
        const ratesRes = await window.marketAPI.getRates();
        if (ratesRes?.ok && ratesRes.rates) {
          setRates(prev => ({ ...prev, ...ratesRes.rates }));
        }
      }

      // 2. Fetch batch quotes for market holdings
      const marketHoldings = (vault.holdings || []).filter(h =>
        (Number(h.qty) || 0) > 0 && MARKET_PRICED.has(h.type) && (h.symbol || h.isin)
      );

      if (marketHoldings.length > 0 && window.marketAPI?.batchQuotes) {
        const items = marketHoldings.map(h => ({
          symbol: h.symbol,
          schemeCode: h.type === 'Mutual Fund' ? h.symbol : undefined,
          type: h.type,
          isin: h.isin,
        }));

        const res = await window.marketAPI.batchQuotes(items);
        if (res?.ok && res.quotes) {
          let updatedCount = 0;
          const nextHoldings = vault.holdings.map(h => {
            const key = String(h.symbol || '');
            const q = res.quotes[key];
            if (q && q.ok && q.price != null && Number.isFinite(q.price)) {
              updatedCount++;
              return {
                ...h,
                current: q.price,
                lastUpdatedAt: new Date().toISOString(),
              };
            }
            return h;
          });

          await save({ ...vault, holdings: nextHoldings });
          setRefreshMsg(`Updated ${updatedCount} asset quotes and FX rates.`);
        }
      } else {
        setRefreshMsg('FX rates refreshed. No market assets to update.');
      }
    } catch (err) {
      setRefreshMsg(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(''), 6000);
    }
  };

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} onLogout={() => { setVault(null); setPassword(''); }} />
      <main className="main">
        {refreshMsg && (
          <div className="refreshBanner">
            {refreshing ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
            <span>{refreshMsg}</span>
          </div>
        )}
        {page==='dashboard'    && <Dashboard    vault={vault} rates={rates} onRefresh={refreshMarketPrices} refreshing={refreshing} />}
        {page==='portfolio'    && <Portfolio    vault={vault} save={save} rates={rates} onRefresh={refreshMarketPrices} refreshing={refreshing} />}
        {page==='transactions' && <Transactions vault={vault} save={save} />}
        {page==='family'       && <Family       vault={vault} save={save} />}
        {page==='documents'    && <Documents    vault={vault} save={save} password={password} />}
        {page==='ai'           && <AI           vault={vault} rates={rates} />}
        {page==='settings'     && <SettingsPage vault={vault} save={save} password={password} rates={rates} setVault={setVault} />}
      </main>
    </div>
  );
}

// ── SIP (Systematic Investment Plan) Utilities ────────────────────────────────
export function calcNextSipDate(sipDay) {
  const day = Math.min(28, Math.max(1, parseInt(sipDay, 10) || 1));
  const now = new Date();
  const currentDay = now.getDate();
  let targetMonth = now.getMonth();
  let targetYear = now.getFullYear();

  if (currentDay >= day) {
    targetMonth++;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear++;
    }
  }

  const nextDate = new Date(targetYear, targetMonth, day);
  return nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function calcElapsedInstallments(startDateStr, sipDay) {
  if (!startDateStr) return 1;
  const start = new Date(startDateStr);
  const now = new Date();
  if (isNaN(start.getTime()) || start > now) return 1;

  const day = Math.min(28, Math.max(1, parseInt(sipDay, 10) || 1));
  let count = 0;
  let d = new Date(start.getFullYear(), start.getMonth(), day, 12, 0, 0);
  if (d < start) {
    d.setMonth(d.getMonth() + 1);
  }
  while (d <= now) {
    count++;
    d.setMonth(d.getMonth() + 1);
  }
  return Math.max(1, count);
}

// Calculates the total invested, total units, current active SIP amount, and breakdown across installments with step-up and setup value
export function calcStepUpSipPortfolio({
  sipAmount,
  stepUpValue = 0,
  activeInstallments = 1,
  effectiveNav = 100,
  initialSetupValue = 0,
}) {
  const baseAmt = Math.max(0, Number(sipAmount) || 0);
  const stepUp = Math.max(0, Number(stepUpValue) || 0);
  const installments = Math.max(1, parseInt(activeInstallments, 10) || 1);
  const nav = Number(effectiveNav) > 0 ? Number(effectiveNav) : 100;
  const setupVal = Math.max(0, Number(initialSetupValue) || 0);

  let totalInstallmentsInvested = 0;
  let yearWise = [];

  for (let i = 0; i < installments; i++) {
    const yearIdx = Math.floor(i / 12);
    const instAmt = baseAmt + (yearIdx * stepUp);
    totalInstallmentsInvested = addMoney(totalInstallmentsInvested, instAmt);

    if (!yearWise[yearIdx]) {
      yearWise[yearIdx] = { year: yearIdx + 1, count: 0, monthlyAmt: instAmt, total: 0 };
    }
    yearWise[yearIdx].count++;
    yearWise[yearIdx].total = addMoney(yearWise[yearIdx].total, instAmt);
  }

  const totalInvested = addMoney(setupVal, totalInstallmentsInvested);
  const setupUnits = nav > 0 ? round4(setupVal / nav) : 0;
  const installmentUnits = nav > 0 ? round4(totalInstallmentsInvested / nav) : 0;
  const totalUnits = round4(setupUnits + installmentUnits);
  const currentSipAmount = baseAmt + (Math.floor(Math.max(0, installments - 1) / 12) * stepUp);
  const avgCost = totalUnits > 0 ? round4(totalInvested / totalUnits) : nav;

  return {
    baseAmt,
    stepUp,
    installments,
    setupVal,
    setupUnits,
    totalInstallmentsInvested,
    totalInvested,
    totalUnits,
    avgCost,
    currentSipAmount,
    yearWise,
  };
}

export function processAutomaticSips(holdings = [], transactions = [], family = []) {
  const todayDate = new Date();
  let updatedTx = [...transactions];
  let updatedHoldings = holdings.map(h => {
    if (!h.isSip || !(Number(h.sipAmount) > 0) || !h.sipDay || !h.sipStartDate) {
      return h;
    }

    const sipDay = Math.min(28, Math.max(1, parseInt(h.sipDay, 10) || 1));
    const baseSipAmount = Number(h.sipAmount);
    const stepUpValue = Math.max(0, Number(h.stepUpValue) || 0);
    const startD = new Date(h.sipStartDate);
    const lastDate = h.lastSipDate ? new Date(h.lastSipDate) : new Date(h.sipStartDate);
    if (isNaN(lastDate.getTime())) return h;

    let curYear = lastDate.getFullYear();
    let curMonth = lastDate.getMonth();

    let addedQty = 0;
    let addedAmount = 0;
    let latestExecutedDate = h.lastSipDate || h.sipStartDate;

    while (true) {
      curMonth++;
      if (curMonth > 11) {
        curMonth = 0;
        curYear++;
      }

      const installmentDate = new Date(curYear, curMonth, sipDay, 12, 0, 0);
      if (installmentDate > todayDate) {
        break;
      }

      const instDateStr = installmentDate.toISOString().slice(0, 10);
      const importKey = `SIP|${h.id || norm(h.name)}|${instDateStr}`;

      const alreadyLogged = updatedTx.some(t => t.importKey === importKey || (t.source === 'sip-auto' && t.date === instDateStr && (t.asset === h.name || t.symbol === h.symbol)));
      if (!alreadyLogged) {
        let monthsElapsed = 0;
        if (!isNaN(startD.getTime())) {
          monthsElapsed = Math.max(0, (curYear - startD.getFullYear()) * 12 + (curMonth - startD.getMonth()));
        }
        const yearTier = Math.floor(monthsElapsed / 12);
        const effectiveSipAmt = addMoney(baseSipAmount, mulMoney(yearTier, stepUpValue));

        const nav = Number(h.current) || Number(h.avg) || 100;
        const units = round4(effectiveSipAmt / nav);

        addedQty = round4(addedQty + units);
        addedAmount = addMoney(addedAmount, effectiveSipAmt);
        latestExecutedDate = instDateStr;

        updatedTx.push({
          id: uid(),
          date: instDateStr,
          type: 'BUY',
          asset: h.name,
          symbol: h.symbol || '',
          isin: h.isin || '',
          qty: units,
          price: nav,
          amount: effectiveSipAmt,
          currency: h.currency || 'INR',
          ownerId: h.ownerId,
          ownerName: family.find(f => f.id === h.ownerId)?.name || 'Self',
          notes: `Automated Monthly SIP (Day ${sipDay})${stepUpValue > 0 ? ` · Step-up Yr ${yearTier + 1}: ₹${effectiveSipAmt.toLocaleString('en-IN')}/mo` : ''}`,
          source: 'sip-auto',
          importKey,
        });
      }
    }

    if (addedQty > 0) {
      const oldQty = Number(h.qty) || 0;
      const oldAvg = Number(h.avg) || 0;
      const totalQty = round4(oldQty + addedQty);
      const totalInvested = addMoney(mulMoney(oldQty, oldAvg), addedAmount);
      const newAvg = totalQty > 0 ? round4(totalInvested / totalQty) : oldAvg;

      return {
        ...h,
        qty: totalQty,
        avg: newAvg,
        lastSipDate: latestExecutedDate,
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    return h;
  });

  return { holdings: updatedHoldings, transactions: updatedTx };
}

// ── Fixed Income (Bonds & FDs) Utilities ───────────────────────────────────────
export function calcBondFdMetrics({
  qty = 1,
  initialPrice = 1000,
  interestRate = 0,
  payoutFrequency = 'monthly',
  buyDate,
  maturityDate,
}) {
  const q = Math.max(0, Number(qty) || 0);
  const p = Math.max(0, Number(initialPrice) || 0);
  const rate = Math.max(0, Number(interestRate) || 0);
  const principal = mulMoney(q, p);

  const annualIncome = round2(principal * (rate / 100));

  let periodsPerYear = 12;
  const freq = String(payoutFrequency || 'monthly').toLowerCase();
  if (freq === 'quarterly') periodsPerYear = 4;
  else if (freq === 'half-yearly') periodsPerYear = 2;
  else if (freq === 'annually') periodsPerYear = 1;
  else if (freq === 'cumulative') periodsPerYear = 0;

  const periodicPayout = periodsPerYear > 0 ? round2(annualIncome / periodsPerYear) : 0;

  let tenorYears = 0;
  if (buyDate && maturityDate) {
    const start = new Date(buyDate);
    const end = new Date(maturityDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      tenorYears = round2((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }

  let totalInterest = 0;
  let maturityValue = principal;

  if (freq === 'cumulative') {
    // Standard quarterly compounding for cumulative FDs and bonds in India
    const n = 4;
    const r = rate / 100;
    if (tenorYears > 0) {
      maturityValue = round2(principal * Math.pow(1 + r / n, n * tenorYears));
      totalInterest = round2(maturityValue - principal);
    } else {
      totalInterest = round2(annualIncome);
      maturityValue = round2(principal + totalInterest);
    }
  } else {
    totalInterest = tenorYears > 0 ? round2(annualIncome * tenorYears) : annualIncome;
    maturityValue = principal;
  }

  return {
    principal,
    rate,
    annualIncome,
    periodicPayout,
    tenorYears,
    totalInterest,
    maturityValue,
    payoutFrequency: freq,
  };
}

export function calcNextPayoutDate(lastOrStartDateStr, payoutFrequency = 'monthly', payoutDay = 15, maturityDateStr = null) {
  const freq = String(payoutFrequency || 'monthly').toLowerCase();
  if (freq === 'cumulative') {
    return maturityDateStr ? new Date(maturityDateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'At Maturity';
  }

  const now = new Date();
  const day = Math.min(28, Math.max(1, parseInt(payoutDay, 10) || 1));
  let targetMonth = now.getMonth();
  let targetYear = now.getFullYear();

  let stepMonths = 1;
  if (freq === 'quarterly') stepMonths = 3;
  else if (freq === 'half-yearly') stepMonths = 6;
  else if (freq === 'annually') stepMonths = 12;

  if (now.getDate() >= day) {
    targetMonth += stepMonths;
  }

  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }

  const nextDate = new Date(targetYear, targetMonth, day);
  if (maturityDateStr) {
    const mat = new Date(maturityDateStr);
    if (!isNaN(mat.getTime()) && nextDate > mat) {
      return 'Matured on ' + mat.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  return nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function processAutomaticInterestPayouts(holdings = [], transactions = [], family = []) {
  const todayDate = new Date();
  let updatedTx = [...transactions];

  let updatedHoldings = holdings.map(h => {
    const isBondOrFd = h.type === 'Bond' || h.type === 'FD';
    const rate = Number(h.interestRate) || 0;
    const qty = Number(h.qty) || 0;
    const buyPrice = Number(h.avg) || 0;
    const principal = mulMoney(qty, buyPrice);

    if (!isBondOrFd || rate <= 0 || principal <= 0 || !h.buyDate) {
      return h;
    }

    const freq = String(h.payoutFrequency || (h.type === 'FD' ? 'cumulative' : 'monthly')).toLowerCase();
    const payoutDay = Math.min(28, Math.max(1, parseInt(h.payoutDay, 10) || new Date(h.buyDate).getDate() || 15));
    const startD = new Date(h.buyDate);
    const maturityD = h.maturityDate ? new Date(h.maturityDate) : null;
    const lastD = h.lastPayoutDate ? new Date(h.lastPayoutDate) : startD;

    if (isNaN(startD.getTime()) || isNaN(lastD.getTime())) return h;

    if (freq === 'cumulative') {
      const n = 4; // quarterly compounding
      const r = rate / 100;
      const effectiveEndDate = maturityD && todayDate > maturityD ? maturityD : todayDate;
      const elapsedYears = Math.max(0, (effectiveEndDate.getTime() - startD.getTime()) / (365.25 * 24 * 3600 * 1000));
      const compoundedTotal = round2(principal * Math.pow(1 + r / n, n * elapsedYears));
      const currentPerUnit = qty > 0 ? round4(compoundedTotal / qty) : (Number(h.current) || buyPrice);

      const isMatured = Boolean(maturityD && todayDate >= maturityD);

      return {
        ...h,
        current: currentPerUnit,
        accruedInterest: round2(compoundedTotal - principal),
        isMatured,
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    let stepMonths = 1;
    let periodsPerYear = 12;
    if (freq === 'quarterly') { stepMonths = 3; periodsPerYear = 4; }
    else if (freq === 'half-yearly') { stepMonths = 6; periodsPerYear = 2; }
    else if (freq === 'annually') { stepMonths = 12; periodsPerYear = 1; }

    const annualIncome = round2(principal * (rate / 100));
    const payoutAmt = round2(annualIncome / periodsPerYear);

    let curYear = lastD.getFullYear();
    let curMonth = lastD.getMonth();
    let latestExecutedDate = h.lastPayoutDate || h.buyDate;
    let newPayoutsCount = 0;

    while (true) {
      curMonth += stepMonths;
      while (curMonth > 11) {
        curMonth -= 12;
        curYear += 1;
      }

      const payoutDate = new Date(curYear, curMonth, payoutDay, 12, 0, 0);
      if (payoutDate > todayDate) break;
      if (maturityD && payoutDate > maturityD) break;

      const pDateStr = payoutDate.toISOString().slice(0, 10);
      const importKey = `INTEREST|${h.id || norm(h.name)}|${pDateStr}`;

      const alreadyLogged = updatedTx.some(t => t.importKey === importKey || (t.source === 'interest-auto' && t.date === pDateStr && (t.asset === h.name || t.symbol === h.symbol)));

      if (!alreadyLogged) {
        latestExecutedDate = pDateStr;
        newPayoutsCount++;

        updatedTx.push({
          id: uid(),
          date: pDateStr,
          type: 'INTEREST',
          asset: h.name,
          symbol: h.symbol || h.isin || '',
          isin: h.isin || '',
          amount: payoutAmt,
          currency: h.currency || 'INR',
          ownerId: h.ownerId,
          ownerName: family.find(f => f.id === h.ownerId)?.name || 'Self',
          notes: `${h.type} Interest Payout (${freq}) · ${rate}% p.a.`,
          source: 'interest-auto',
          importKey,
        });
      }
    }

    const isMatured = Boolean(maturityD && todayDate >= maturityD);

    if (newPayoutsCount > 0 || isMatured !== h.isMatured) {
      return {
        ...h,
        lastPayoutDate: latestExecutedDate,
        isMatured,
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    return h;
  });

  return { holdings: updatedHoldings, transactions: updatedTx };
}

export function consolidateHoldings(holdings = []) {
  const consolidated = [];
  holdings.forEach(h => {
    const qty = Number(h.qty) || 0;
    if (qty <= 0) return; // Ignore and purge sold-out holdings
    const avg = Number(h.avg) || 0;
    const cur = Number(h.current) || avg;
    const isMF = h.type === 'Mutual Fund' || classify(h.name) === 'Mutual Fund';
    const hIsin = norm(h.isin);
    const hSym = norm(h.symbol);
    const hName = norm(h.name);
    const hFolio = norm(h.folio);
    const ownerId = h.ownerId || '';

    const existingIdx = consolidated.findIndex(x => {
      if ((x.ownerId || '') !== ownerId) return false;
      const xFolio = norm(x.folio);
      if (isMF) {
        if (hFolio && xFolio && hFolio !== xFolio) return false;
        if (hIsin && norm(x.isin) === hIsin) return true;
        if (hSym && norm(x.symbol) === hSym) return true;
        if (hName && norm(x.name) === hName) return true;
      } else {
        if (hIsin && norm(x.isin) === hIsin) return true;
        if (hSym && norm(x.symbol) === hSym) return true;
        if (hName && norm(x.name) === hName && x.type === h.type) return true;
      }
      return false;
    });

    if (existingIdx >= 0) {
      const target = consolidated[existingIdx];
      const targetQty = Number(target.qty) || 0;
      const targetAvg = Number(target.avg) || 0;
      const combinedQty = round4(targetQty + qty);
      let combinedAvg = targetAvg;
      if (combinedQty > 0) {
        const totalInvested = addMoney(mulMoney(targetQty, targetAvg), mulMoney(qty, avg));
        combinedAvg = round4(totalInvested / combinedQty);
      }
      consolidated[existingIdx] = {
        ...target,
        isSip: h.isSip != null ? h.isSip : target.isSip,
        sipAmount: h.sipAmount != null ? h.sipAmount : target.sipAmount,
        stepUpValue: h.stepUpValue != null ? h.stepUpValue : target.stepUpValue,
        initialSetupValue: h.initialSetupValue != null ? h.initialSetupValue : target.initialSetupValue,
        sipDay: h.sipDay != null ? h.sipDay : target.sipDay,
        sipStartDate: h.sipStartDate || target.sipStartDate,
        lastSipDate: h.lastSipDate || target.lastSipDate,
        interestRate: h.interestRate != null ? h.interestRate : target.interestRate,
        payoutFrequency: h.payoutFrequency || target.payoutFrequency,
        payoutDay: h.payoutDay != null ? h.payoutDay : target.payoutDay,
        buyDate: h.buyDate || target.buyDate,
        maturityDate: h.maturityDate || target.maturityDate,
        lastPayoutDate: h.lastPayoutDate || target.lastPayoutDate,
        accruedInterest: h.accruedInterest != null ? h.accruedInterest : target.accruedInterest,
        isMatured: h.isMatured != null ? h.isMatured : target.isMatured,
        qty: combinedQty,
        avg: combinedAvg,
        current: cur || target.current,
        lastUpdatedAt: new Date().toISOString(),
      };
    } else {
      consolidated.push({
        ...h,
        qty: round4(qty),
        avg: round4(avg),
        current: round4(cur),
      });
    }
  });
  return consolidated.filter(h => (Number(h.qty) || 0) > 0);
}

function migrate(v) {
  const { active: sanitizedDocs, expiredIds } = filterActiveDocuments(v.documents || []);
  if (expiredIds.length > 0 && window.vaultAPI?.purgeExpiredFiles) {
    window.vaultAPI.purgeExpiredFiles({ ids: expiredIds }).catch(() => {});
  }
  const family = v.family?.length ? v.family : [{ id: uid(), name: 'Me', relation: 'Self' }];
  const { holdings: sipHoldings, transactions: sipTx } = processAutomaticSips(v.holdings || [], v.transactions || [], family);
  const { holdings: autoHoldings, transactions: autoTx } = processAutomaticInterestPayouts(sipHoldings, sipTx, family);

  return {
    ...v, schema: 2,
    family,
    holdings:    consolidateHoldings(autoHoldings),
    transactions:autoTx,
    documents:   sanitizedDocs,
    importLog:   v.importLog   || [],
    settings: { aiProvider:'gemini', geminiApiKey:'', geminiModel:'gemini-2.5-flash',
      ollamaUrl:'http://127.0.0.1:11434', ollamaModel:'qwen2.5:3b', hiddenAssets:[], ...(v.settings||{}) },
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ hasVault, password, setPassword, confirm, setConfirm, showPass, setShowPass, error, busy, onSubmit }) {
  return (
    <div className="loginWrap">
      <div className="network" />
      <div className="loginCard">
        <div className="brandMini">BABA WEALTH</div>
        <div className="loginAvatarFrame">
          {USER_PHOTO_PATH ? (
            <img
              src={resolvePhotoSrc(USER_PHOTO_PATH)}
              alt="Baba Wealth Logo"
              className="loginAvatarImg"
              onError={(e) => {
                if (!e.currentTarget.dataset.triedFallback && logoImg && e.currentTarget.src !== logoImg) {
                  e.currentTarget.dataset.triedFallback = 'true';
                  e.currentTarget.src = logoImg;
                  return;
                }
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.loginLogoFallback');
                if (fallback) fallback.style.display = 'grid';
              }}
            />
          ) : null}
          <div
            className="loginLogoFallback"
            style={{ display: USER_PHOTO_PATH ? 'none' : 'grid' }}
          >
            BW
          </div>
        </div>
        <h1>{hasVault ? 'Welcome Back' : 'Create Your Vault'}</h1>
        <p>{hasVault ? 'Unlock your private portfolio manager' : 'One master password. All data stays on this device.'}</p>
        <label>Master Password</label>
        <div className="pass">
          <input autoFocus type={showPass?'text':'password'} value={password}
            onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSubmit()}
            placeholder="Enter master password" />
          <button onClick={()=>setShowPass(!showPass)}>{showPass?<EyeOff size={15}/>:<Eye size={15}/>}</button>
        </div>
        {!hasVault && <>
          <label>Confirm Password</label>
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&onSubmit()} placeholder="Repeat master password" />
        </>}
        {error && <div className="error"><AlertTriangle size={14}/> {error}</div>}
        <button className="primary full" onClick={onSubmit} disabled={busy}>
          {busy ? 'Unlocking…' : hasVault ? 'UNLOCK VAULT' : 'CREATE VAULT'}
        </button>
        <div className="securityNote"><ShieldCheck size={13}/> AES-256-GCM encrypted local vault</div>
        <div className="loginCredit">
          <span>Made by <b>Harish</b></span>
        </div>
      </div>
    </div>
  );
}

// ── Market Live Status (Exclusively in Indian Standard Time - IST) ─────────────
function getUsMarketHoursInIST(now = new Date()) {
  const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).formatToParts(now);
  const isEDT = nyParts.some(p => p.type === 'timeZoneName' && p.value.includes('DT'));
  return {
    openTimeIST: isEDT ? '07:00 PM' : '08:00 PM',
    closeTimeIST: isEDT ? '01:30 AM' : '02:30 AM',
    rangeLabel: isEDT ? '07:00 PM - 01:30 AM IST' : '08:00 PM - 02:30 AM IST',
  };
}

function checkMarketStatus() {
  const now = new Date();

  // 1. Indian Stock Market (IST: UTC+5:30)
  // Trading days: Mon - Fri, 09:15 to 15:30 IST
  const istParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now);

  let istDay = '', istHour = 0, istMin = 0;
  for (const p of istParts) {
    if (p.type === 'weekday') istDay = p.value;
    if (p.type === 'hour') istHour = parseInt(p.value, 10) % 24;
    if (p.type === 'minute') istMin = parseInt(p.value, 10);
  }
  const isIndWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(istDay);
  const istMinTotal = istHour * 60 + istMin;
  const isIndOpen = isIndWeekday && istMinTotal >= 555 && istMinTotal < 930;

  // 2. US Stock Market (Evaluated via NY session, strictly presented in IST)
  // Trading days: Mon - Fri, 09:30 to 16:00 ET (which corresponds to 07:00 PM - 01:30 AM IST during EDT)
  const usParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now);

  let usDay = '', usHour = 0, usMin = 0;
  for (const p of usParts) {
    if (p.type === 'weekday') usDay = p.value;
    if (p.type === 'hour') usHour = parseInt(p.value, 10) % 24;
    if (p.type === 'minute') usMin = parseInt(p.value, 10);
  }
  const isUsWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(usDay);
  const usMinTotal = usHour * 60 + usMin;
  const isUsOpen = isUsWeekday && usMinTotal >= 570 && usMinTotal < 960;

  const usIST = getUsMarketHoursInIST(now);

  if (isIndOpen && isUsOpen) {
    return {
      isOpen: true,
      label: 'IND & US Markets are open',
      sub: 'NSE/BSE & US exchanges live (IST)',
    };
  }
  if (isIndOpen) {
    return {
      isOpen: true,
      label: 'IND Market is open',
      sub: 'NSE/BSE · 09:15 AM - 03:30 PM IST',
    };
  }
  if (isUsOpen) {
    return {
      isOpen: true,
      label: 'US Market is Open',
      sub: `NYSE/NASDAQ · ${usIST.rangeLabel}`,
    };
  }

  // All closed: Show next market session strictly in Indian Time (IST)
  let sub = 'Opens next trading session (IST)';
  if (['Sat', 'Sun'].includes(istDay)) {
    sub = 'Weekend · IND opens Monday 09:15 AM IST';
  } else if (isIndWeekday && istMinTotal < 555) {
    sub = 'IND market opens at 09:15 AM IST';
  } else if (isIndWeekday && istMinTotal >= 930 && !isUsOpen) {
    sub = `US market opens at ${usIST.openTimeIST} IST`;
  }

  return {
    isOpen: false,
    label: 'Markets are closed',
    sub,
  };
}

function MarketStatusBadge() {
  const [status, setStatus] = useState(() => checkMarketStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(checkMarketStatus());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`marketBadge ${status.isOpen ? 'open' : 'closed'}`}>
      <div className={`marketPulseDot ${status.isOpen ? 'open' : 'closed'}`} />
      <div className="marketBadgeText">
        <b>{status.label}</b>
        <small>{status.sub}</small>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, onLogout }) {
  const items = [
    ['dashboard','Dashboard',LayoutDashboard],
    ['portfolio','Portfolio',WalletCards],
    ['transactions','Transactions',ArrowLeftRight],
    ['family','Family',Users],
    ['documents','Documents',FileLock2],
    ['ai','AI Analyst',Bot],
    ['settings','Settings',Settings],
  ];
  return (
    <aside className="side">
      <div className="logo">
        <div className="userAvatarFrame">
          {USER_PHOTO_PATH ? (
            <img
              src={resolvePhotoSrc(USER_PHOTO_PATH)}
              alt="Profile"
              className="userAvatarImg"
              onError={(e) => {
                if (!e.currentTarget.dataset.triedFallback && logoImg && e.currentTarget.src !== logoImg) {
                  e.currentTarget.dataset.triedFallback = 'true';
                  e.currentTarget.src = logoImg;
                  return;
                }
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.logoMark');
                if (fallback) fallback.style.display = 'grid';
              }}
            />
          ) : null}
          <div
            className="logoMark"
            style={{ display: USER_PHOTO_PATH ? 'none' : 'grid' }}
            title="Set USER_PHOTO_PATH in src/main.jsx to display your profile picture"
          >
            BW
          </div>
        </div>
        <div><b>Baba</b><span>WEALTH</span></div>
      </div>
      <MarketStatusBadge />
      <nav>
        {items.map(([id,label,I])=>(
          <button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}>
            <I size={17}/><span>{label}</span>
          </button>
        ))}
      </nav>
      <button className="logout" onClick={onLogout}><LogOut size={16}/><span>Lock Vault</span></button>
    </aside>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({ label, title, sub, children }) {
  return (
    <div className="header">
      <div>
        {label && <div className="pageLabel">{label}</div>}
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>{children}</div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function Stat({ icon:Icon, label, value, sub, positive=true }) {
  return (
    <div className="stat">
      <div className="statTop"><span>{label}</span><Icon size={16}/></div>
      <strong>{value}</strong>
      <small className={positive?'up':'down'}>{sub}</small>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function Dashboard({ vault, rates, onRefresh, refreshing }) {
  const hiddenIds = vault.settings?.hiddenAssets || [];
  const [showHiddenList, setShowHiddenList] = useState(false);

  // Filter holdings: exclude individually hidden assets
  const visibleVault = useMemo(() => {
    if (!hiddenIds.length) return vault;
    return { ...vault, holdings: vault.holdings.filter(h => !hiddenIds.includes(h.id)) };
  }, [vault, hiddenIds]);

  // Names of hidden holdings for the dropdown
  const hiddenHoldings = useMemo(() =>
    vault.holdings.filter(h => hiddenIds.includes(h.id) && (Number(h.qty)||0) > 0),
  [vault, hiddenIds]);

  const t = totals(visibleVault, rates, 'INR');
  const recent = vault.transactions.slice(-6).reverse();

  return (<>
    <Header label="Overview" title="Dashboard" sub="Your complete household wealth at a glance">
      <button className="ghost" onClick={onRefresh} disabled={refreshing} title="Update live market quotes and currency rates">
        <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh Prices'}
      </button>
      <div className="pill"><Database size={12}/> Offline-first</div>
    </Header>

    {hiddenHoldings.length > 0 && (
      <div className="hidden-assets-banner" style={{position:'relative'}}>
        <EyeOff size={14}/>
        <span
          style={{cursor:'pointer',textDecoration:'underline',textUnderlineOffset:3}}
          onClick={()=>setShowHiddenList(x=>!x)}
        >
          {hiddenHoldings.length} asset{hiddenHoldings.length>1?'s':''} hidden from overview & portfolio
        </span>
        {showHiddenList && (
          <div className="hidden-assets-dropdown">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <b style={{fontSize:12,color:'var(--muted)'}}>Hidden Assets ({hiddenHoldings.length})</b>
              <X size={13} style={{cursor:'pointer',color:'var(--muted)'}} onClick={()=>setShowHiddenList(false)}/>
            </div>
            {hiddenHoldings.map(h=>(
              <div key={h.id} className="hidden-asset-tag">
                <EyeOff size={11}/> <span>{h.name}</span> <small style={{marginLeft:'auto',color:'var(--muted)'}}>{h.type}</small>
              </div>
            ))}
            <small style={{marginTop:8,display:'block',color:'var(--muted)'}}>Go to Settings → Asset Visibility to change</small>
          </div>
        )}
      </div>
    )}

    <section className="stats">
      <Stat icon={PiggyBank}   label="Total Invested"   value={money(t.cost)}   sub="Across all positions (base INR)"/>
      <Stat icon={BarChart3}   label="Current Value"    value={money(t.value)}  sub={`${visibleVault.holdings.filter(h=>(Number(h.qty)||0)>0).length} active positions`}/>
      <Stat icon={t.gain>=0?TrendingUp:TrendingDown} label="Unrealised P/L"
        value={money(t.gain)}
        sub={t.cost?`${(t.gain/t.cost*100).toFixed(2)}% total return`:'Add holdings to track'}
        positive={t.gain>=0}/>
      <Stat icon={Users} label="Family Members" value={vault.family.length} sub="Shared vault"/>
    </section>
    <div className="grid2" style={{marginTop:18}}>
      <div className="panel heroPanel">
        <div className="panelHead">
          <div><h3>Allocation</h3><span>By asset class · normalized to INR</span></div>
          <SlidersHorizontal size={16}/>
        </div>
        {ASSET_TYPES.map(type=>{
          const val = visibleVault.holdings
            .filter(h => (Number(h.qty) || 0) > 0 && h.type === type)
            .reduce((s, h) => s + toBase(mulMoney(h.qty, h.current), h.currency, rates, 'INR'), 0);
          return (
            <div className="allocRow" key={type}>
              <span>{type}</span>
              <div className="bar"><i style={{width:`${t.value?Math.min(100,val/t.value*100):0}%`}}/></div>
              <b>{money(val)}</b>
            </div>
          );
        })}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div className="panel" style={{flex:1}}>
          <div className="panelHead"><h3>Recent Activity</h3><ArrowLeftRight size={15}/></div>
          {recent.map(x=>(
            <div className="activity" key={x.id}>
              <div className="dot"/>
              <div><b>{x.type} · {x.asset||x.name||'—'}</b><small>{x.date||'No date'} · {x.ownerName||'Self'}</small></div>
              <strong>{money(x.amount,x.currency)}</strong>
            </div>
          ))}
          {!vault.transactions.length&&<Empty text="No transactions yet"/>}
        </div>
        <div className="insight">
          <Bot size={18}/>
          <div>
            <b>AI Import ready</b>
            <p>Drop any CAS, P&L or broker statement in Documents — Gemini extracts and reconciles automatically.</p>
          </div>
        </div>
      </div>
    </div>
  </>);
}

// ── Portfolio ──────────────────────────────────────────────────────────────────
function Portfolio({ vault, save, rates, onRefresh, refreshing }) {
  const [showWizard,   setShowWizard]   = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [editForm,     setEditForm]     = useState(null);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('All');
  const [ownerFilter,  setOwnerFilter]  = useState('All');
  const [sort,         setSort]         = useState({ col:'name', dir:'asc' });
  const [confirmDel,   setConfirmDel]   = useState(null);

  const toggleSort = col => setSort(s=>({ col, dir: s.col===col&&s.dir==='asc'?'desc':'asc' }));
  const SortIcon = ({ col }) => {
    if (sort.col!==col) return <ChevronsUpDown size={11} className="sort-icon"/>;
    return sort.dir==='asc'?<ChevronUp size={11} className="sort-icon"/>:<ChevronDown size={11} className="sort-icon"/>;
  };

  const hiddenIds = vault.settings?.hiddenAssets || [];

  const rows = useMemo(()=>{
    let r = vault.holdings.filter(h=>{
      const hasUnits = (Number(h.qty) || 0) > 0;
      const isHidden = hiddenIds.includes(h.id);
      const q = search.toLowerCase();
      return hasUnits && !isHidden
        && (!q||(h.name+' '+h.symbol+' '+(h.isin||'')+' '+(h.folio||'')+' '+h.type).toLowerCase().includes(q))
        &&(typeFilter==='All'||h.type===typeFilter)
        &&(ownerFilter==='All'||h.ownerId===ownerFilter);
    });
    return [...r].sort((a,b)=>{
      let av,bv;
      if(sort.col==='name'){av=a.name;bv=b.name;}
      else if(sort.col==='cost'){
        av = toBase(mulMoney(a.qty, a.avg), a.currency, rates, 'INR');
        bv = toBase(mulMoney(b.qty, b.avg), b.currency, rates, 'INR');
      }
      else if(sort.col==='pl'){
        av = toBase(subMoney(mulMoney(a.qty, a.current), mulMoney(a.qty, a.avg)), a.currency, rates, 'INR');
        bv = toBase(subMoney(mulMoney(b.qty, b.current), mulMoney(b.qty, b.avg)), b.currency, rates, 'INR');
      }
      else if(sort.col==='value'){
        av = toBase(mulMoney(a.qty, a.current), a.currency, rates, 'INR');
        bv = toBase(mulMoney(b.qty, b.current), b.currency, rates, 'INR');
      }
      else if(sort.col==='qty'){av=+a.qty;bv=+b.qty;}
      else{av=a[sort.col];bv=b[sort.col];}
      if(typeof av==='string')return sort.dir==='asc'?av.localeCompare(bv):bv.localeCompare(av);
      return sort.dir==='asc'?av-bv:bv-av;
    });
  },[vault.holdings,search,typeFilter,ownerFilter,sort,rates,hiddenIds]);

  // Normalized base totals in INR
  const ft = useMemo(() => {
    let invested = 0;
    let value = 0;
    rows.forEach(h => {
      const q = Number(h.qty) || 0;
      const curV = mulMoney(q, h.current);
      const costV = mulMoney(q, h.avg);
      invested = addMoney(invested, toBase(costV, h.currency, rates, 'INR'));
      value = addMoney(value, toBase(curV, h.currency, rates, 'INR'));
    });
    return { invested, value, gain: subMoney(value, invested) };
  }, [rows, rates]);

  // Save from wizard (pools into existing holding if stock already bought, logs individual BUY tx)
  const handleWizardSave = ({ holding, tx }) => {
    const isMF = holding.type === 'Mutual Fund' || classify(holding.name) === 'Mutual Fund';
    const hIsin = norm(holding.isin);
    const hSym = norm(holding.symbol);
    const hName = norm(holding.name);
    const hFolio = norm(holding.folio);
    const ownerId = holding.ownerId || '';

    const existingIdx = vault.holdings.findIndex(h => {
      if ((h.ownerId || '') !== ownerId) return false;
      const xFolio = norm(h.folio);
      if (isMF) {
        if (hFolio && xFolio && hFolio !== xFolio) return false;
        if (hIsin && norm(h.isin) === hIsin) return true;
        if (hSym && norm(h.symbol) === hSym) return true;
        if (hName && norm(h.name) === hName) return true;
      } else {
        if (hIsin && norm(h.isin) === hIsin) return true;
        if (hSym && norm(h.symbol) === hSym) return true;
        if (hName && norm(h.name) === hName && h.type === holding.type) return true;
      }
      return false;
    });

    let newHoldings;
    if (existingIdx >= 0) {
      const existing = vault.holdings[existingIdx];
      const oldQty = Number(existing.qty) || 0;
      const oldAvg = Number(existing.avg) || 0;
      const addQty = Number(holding.qty) || 0;
      const addAvg = Number(holding.avg) || 0;
      const combinedQty = round4(oldQty + addQty);
      const combinedAvg = calcAvgCost(oldQty, oldAvg, addQty, addAvg);

      newHoldings = vault.holdings.map((h, i) => i === existingIdx ? {
        ...existing,
        isSip: holding.isSip != null ? holding.isSip : existing.isSip,
        sipAmount: holding.sipAmount != null ? holding.sipAmount : existing.sipAmount,
        stepUpValue: holding.stepUpValue != null ? holding.stepUpValue : existing.stepUpValue,
        initialSetupValue: holding.initialSetupValue != null ? holding.initialSetupValue : existing.initialSetupValue,
        sipDay: holding.sipDay != null ? holding.sipDay : existing.sipDay,
        sipStartDate: holding.sipStartDate || existing.sipStartDate,
        lastSipDate: holding.lastSipDate || existing.lastSipDate,
        interestRate: holding.interestRate != null ? holding.interestRate : existing.interestRate,
        payoutFrequency: holding.payoutFrequency || existing.payoutFrequency,
        payoutDay: holding.payoutDay != null ? holding.payoutDay : existing.payoutDay,
        buyDate: holding.buyDate || existing.buyDate,
        maturityDate: holding.maturityDate || existing.maturityDate,
        lastPayoutDate: holding.lastPayoutDate || existing.lastPayoutDate,
        accruedInterest: holding.accruedInterest != null ? holding.accruedInterest : existing.accruedInterest,
        isMatured: holding.isMatured != null ? holding.isMatured : existing.isMatured,
        qty: combinedQty,
        avg: combinedAvg,
        current: holding.current || existing.current,
        lastUpdatedAt: new Date().toISOString(),
      } : h);
    } else {
      newHoldings = [...vault.holdings, { ...holding, id: uid() }];
    }

    const newTx = tx ? [...vault.transactions, { ...tx, id: uid() }] : vault.transactions;
    save({ ...vault, holdings: newHoldings.filter(h => (Number(h.qty) || 0) > 0), transactions: newTx });
    setShowWizard(false);
  };

  // Save from edit modal (if quantity is 0 or less, remove holding entirely)
  const handleEditSave = () => {
    if (!editForm?.name) return;
    const newQty = round4(editForm.qty);
    if (newQty <= 0) {
      save({
        ...vault,
        holdings: vault.holdings.filter(h => h.id !== editTarget)
      });
    } else {
      save({
        ...vault,
        holdings: vault.holdings.map(h => h.id === editTarget ? {
          ...h,
          ...editForm,
          qty: newQty,
          avg: round4(editForm.avg),
          current: round4(editForm.current)
        } : h)
      });
    }
    setEditTarget(null); setEditForm(null);
  };

  const handleDelete = id => { save({...vault,holdings:vault.holdings.filter(h=>h.id!==id)}); setConfirmDel(null); };

  const hasForeign = vault.holdings.some(h => (Number(h.qty) || 0) > 0 && !hiddenIds.includes(h.id) && h.currency && h.currency !== 'INR');
  const activeHoldingsCount = vault.holdings.filter(h => (Number(h.qty) || 0) > 0 && !hiddenIds.includes(h.id)).length;
  const totalHiddenCount = vault.holdings.filter(h => (Number(h.qty) || 0) > 0 && hiddenIds.includes(h.id)).length;

  return (<>
    <Header label="Holdings" title="Portfolio" sub="All positions — add, edit and manage your assets">
      <button className="ghost" onClick={onRefresh} disabled={refreshing} title="Update market prices via batch API">
        <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh Prices'}
      </button>
      <button className="primary" onClick={()=>setShowWizard(true)}><Plus size={15}/> Add Asset</button>
    </Header>

    <div className="toolbar">
      <div className="search">
        <Search size={15}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, symbol, ISIN, folio…"/>
        {search&&<button style={{background:'none',border:'none',color:'var(--muted)',padding:'0 4px',cursor:'pointer'}} onClick={()=>setSearch('')}><X size={13}/></button>}
      </div>
      <select className="filterSelect" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
        <option value="All">All types</option>
        {ASSET_TYPES.map(t=><option key={t}>{t}</option>)}
      </select>
      <select className="filterSelect" value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}>
        <option value="All">All owners</option>
        {vault.family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <div className="pill" style={{flexShrink:0}}>{rows.length} / {activeHoldingsCount}</div>
      {totalHiddenCount > 0 && (
        <div
          className="pill"
          style={{flexShrink:0, color:'var(--amber)', borderColor:'rgba(245,158,11,0.35)', background:'rgba(245,158,11,0.08)'}}
          title={`${totalHiddenCount} asset(s) hidden in Settings (excluded from P&L and totals)`}
        >
          <EyeOff size={11}/> {totalHiddenCount} hidden
        </div>
      )}
    </div>

    <div className="panel tablePanel">
      <table>
        <thead>
          <tr>
            <th className={`sortable${sort.col==='name'?' sorted':''}`} onClick={()=>toggleSort('name')}>Asset <SortIcon col="name"/></th>
            <th>Type</th><th>Owner</th>
            <th className={`sortable${sort.col==='qty'?' sorted':''}`} onClick={()=>toggleSort('qty')}>Qty <SortIcon col="qty"/></th>
            <th className={`sortable${sort.col==='cost'?' sorted':''}`} onClick={()=>toggleSort('cost')}>Invested <SortIcon col="cost"/></th>
            <th className={`sortable${sort.col==='value'?' sorted':''}`} onClick={()=>toggleSort('value')}>Current Value <SortIcon col="value"/></th>
            <th className={`sortable${sort.col==='pl'?' sorted':''}`} onClick={()=>toggleSort('pl')}>P / L <SortIcon col="pl"/></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(h=>{
            const q = Number(h.qty) || 0;
            const nativeVal = mulMoney(q, h.current);
            const nativeCost = mulMoney(q, h.avg);
            const pl = subMoney(nativeVal, nativeCost);
            const plPct = h.avg ? ((h.current - h.avg) / h.avg * 100).toFixed(2) : '0.00';
            const owner = vault.family.find(f=>f.id===h.ownerId)?.name || 'Self';
            const isForeign = h.currency && h.currency !== 'INR';
            const baseVal = toBase(nativeVal, h.currency, rates, 'INR');

            return (
              <tr key={h.id}>
                <td>
                  <b>
                    {h.name}
                    {h.isSip && (() => {
                      const baseAmt = Number(h.sipAmount || 0);
                      const stepUp = Number(h.stepUpValue || 0);
                      const startD = h.sipStartDate ? new Date(h.sipStartDate) : null;
                      let activeMonthly = baseAmt;
                      if (stepUp > 0 && startD && !isNaN(startD.getTime())) {
                        const now = new Date();
                        const months = Math.max(0, (now.getFullYear() - startD.getFullYear()) * 12 + (now.getMonth() - startD.getMonth()));
                        activeMonthly = baseAmt + Math.floor(months / 12) * stepUp;
                      }
                      return (
                        <span className="sip-badge" title={`Monthly SIP: ₹${activeMonthly.toLocaleString('en-IN')}/mo on Day ${h.sipDay}${stepUp > 0 ? ` (Base: ₹${baseAmt.toLocaleString('en-IN')}, Step-up: +₹${stepUp.toLocaleString('en-IN')}/yr)` : ''}`}>
                          <RefreshCw size={10} /> SIP · ₹{activeMonthly.toLocaleString('en-IN')}/mo (Day {h.sipDay})
                          {stepUp > 0 && (
                            <span style={{marginLeft:4,opacity:.9,color:'var(--cyan)'}}>
                              · Step-up: +₹{stepUp.toLocaleString('en-IN')}/yr
                            </span>
                          )}
                          {Number(h.initialSetupValue) > 0 && (
                            <span style={{marginLeft:4,opacity:.85}}>
                              · Setup: ₹{Number(h.initialSetupValue).toLocaleString('en-IN')}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    {(h.type === 'Bond' || h.type === 'FD') && Number(h.interestRate) > 0 && (() => {
                      const metrics = calcBondFdMetrics({
                        qty: h.qty,
                        initialPrice: h.avg,
                        interestRate: h.interestRate,
                        payoutFrequency: h.payoutFrequency,
                        buyDate: h.buyDate,
                        maturityDate: h.maturityDate,
                      });
                      const freq = String(h.payoutFrequency || (h.type === 'FD' ? 'cumulative' : 'monthly')).toLowerCase();
                      return (
                        <span className="bond-badge" title={`${h.type} yield: ${h.interestRate}% p.a. · ${freq === 'cumulative' ? 'Cumulative Interest' : `${money(metrics.periodicPayout, h.currency)} / ${freq}`}`}>
                          <LockKeyhole size={10} /> {h.interestRate}% p.a.
                          {freq !== 'cumulative' && (
                            <span style={{marginLeft:4}}>· {money(metrics.periodicPayout, h.currency)}/{freq === 'monthly' ? 'mo' : freq === 'quarterly' ? 'qtr' : 'yr'}</span>
                          )}
                          {freq === 'cumulative' && (
                            <span style={{marginLeft:4}}>· Cumulative</span>
                          )}
                          {h.isMatured && (
                            <span style={{marginLeft:4, color:'#38bdf8', fontWeight:700}}>· Matured</span>
                          )}
                        </span>
                      );
                    })()}
                  </b>
                  <small>
                    {h.symbol||h.isin||'Manual entry'}
                    {h.folio && <span style={{marginLeft:6,color:'var(--cyan)',opacity:.8}}>Folio: {h.folio}</span>}
                    {h.isSip && (
                      <span style={{marginLeft:8,color:'var(--cyan)',fontWeight:500}}>
                        Next SIP: {calcNextSipDate(h.sipDay)}
                      </span>
                    )}
                    {(h.type === 'Bond' || h.type === 'FD') && Number(h.interestRate) > 0 && (
                      <span style={{marginLeft:8,color:'var(--cyan)',fontWeight:500}}>
                        {h.payoutFrequency === 'cumulative'
                          ? `Maturity: ${h.maturityDate || 'At term'}`
                          : `Next Payout: ${calcNextPayoutDate(h.lastPayoutDate || h.buyDate, h.payoutFrequency, h.payoutDay, h.maturityDate)}`
                        }
                        {h.maturityDate && !h.isMatured && (
                          <span style={{marginLeft:6,opacity:.8}}>
                            (Matures {h.maturityDate})
                          </span>
                        )}
                      </span>
                    )}
                  </small>
                </td>
                <td>
                  <span className={`tag${(h.isSip || h.type === 'Bond' || h.type === 'FD') ? ' secure' : ''}`}>
                    {h.isSip
                      ? (Number(h.stepUpValue) > 0 ? 'Step-up SIP' : 'Monthly SIP')
                      : (h.type === 'Bond' || h.type === 'FD') && Number(h.interestRate) > 0
                      ? `${h.type} · ${h.interestRate}% ${h.payoutFrequency === 'cumulative' ? 'Cum.' : (h.payoutFrequency || 'Monthly')}`
                      : h.type
                    }
                  </span>
                  {isForeign && <span className="currency-badge">{h.currency}</span>}
                </td>
                <td>{owner}</td>
                <td>{Number(h.qty).toLocaleString('en-IN')}</td>
                <td>
                  <b>{money(nativeCost, h.currency)}</b>
                  {isForeign && <small style={{color:'var(--muted)'}}>≈ {money(toBase(nativeCost, h.currency, rates, 'INR'), 'INR')}</small>}
                </td>
                <td>
                  <b>{money(nativeVal, h.currency)}</b>
                  {isForeign ? (
                    <small style={{color:'var(--cyan)'}}>≈ {money(baseVal, 'INR')}</small>
                  ) : (
                    <small>{money(h.current, h.currency)} / unit{MARKET_PRICED.has(h.type)&&h.symbol?' · live':''}</small>
                  )}
                </td>
                <td className={pl>=0?'green':'red'}>
                  <b>{money(pl, h.currency)}</b>
                  <small style={{color:'inherit',opacity:.7}}>{plPct}%</small>
                </td>
                <td>
                  {confirmDel===h.id?(
                    <div className="confirm-inline">
                      <span>Delete?</span>
                      <button className="btn-confirm-yes" onClick={()=>handleDelete(h.id)}>Yes</button>
                      <button className="btn-confirm-no" onClick={()=>setConfirmDel(null)}>No</button>
                    </div>
                  ):(
                    <div className="row-actions">
                      <button className="btn-icon" title="Edit" onClick={()=>{setEditTarget(h.id);setEditForm({...h});}}><Pencil size={13}/></button>
                      <button className="btn-icon danger" title="Delete" onClick={()=>setConfirmDel(h.id)}><Trash2 size={13}/></button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length&&<Empty text={vault.holdings.length?'No assets match current filters.':'No assets yet. Click "Add Asset" to begin.'}/>}
      {rows.length>0&&(
        <div className="portfolio-footer">
          <div className="portfolio-footer-cell">
            <small>Total Invested {hasForeign && '(INR Eqv)'}</small>
            <strong>{money(ft.invested, 'INR')}</strong>
          </div>
          <div className="portfolio-footer-cell">
            <small>Current Value {hasForeign && '(INR Eqv)'}</small>
            <strong>{money(ft.value, 'INR')}</strong>
          </div>
          <div className="portfolio-footer-cell">
            <small>Total P / L {hasForeign && '(INR Eqv)'}</small>
            <strong className={ft.gain>=0?'green':'red'}>
              {money(ft.gain, 'INR')} ({ft.invested?(ft.gain/ft.invested*100).toFixed(2):'0.00'}%)
            </strong>
          </div>
        </div>
      )}
    </div>

    {/* Add asset wizard */}
    {showWizard&&(
      <Modal title="Add Asset" onClose={()=>setShowWizard(false)}>
        <AddAssetWizard family={vault.family} holdings={vault.holdings} onSave={handleWizardSave} onClose={()=>setShowWizard(false)}/>
      </Modal>
    )}

    {/* Edit modal */}
    {editTarget&&editForm&&(
      <Modal title="Edit Asset" onClose={()=>{setEditTarget(null);setEditForm(null);}}>
        <EditAssetForm form={editForm} setForm={setEditForm} family={vault.family}/>
        <button className="primary full" onClick={handleEditSave}>Save Changes</button>
      </Modal>
    )}
  </>);
}

// ── Add Asset Wizard ───────────────────────────────────────────────────────────
function AddAssetWizard({ family, holdings, onSave, onClose }) {
  const [step,      setStep]      = useState(1);
  const [assetType, setAssetType] = useState(null);

  const handleTypeSelect = type => { setAssetType(type); setStep(2); };

  if (step === 1) return <TypePicker onSelect={handleTypeSelect}/>;

  if (MARKET_PRICED.has(assetType)) {
    return (
      <MarketAssetForm
        assetType={assetType} family={family}
        onBack={()=>setStep(1)} onSave={onSave}
      />
    );
  }
  if (assetType === 'Bond' || assetType === 'FD') {
    return (
      <BondFdAssetForm
        assetType={assetType} family={family}
        onBack={()=>setStep(1)} onSave={onSave}
      />
    );
  }
  return (
    <ManualAssetForm
      assetType={assetType} family={family}
      onBack={()=>setStep(1)} onSave={onSave}
    />
  );
}

function TypePicker({ onSelect }) {
  return (
    <div>
      <p style={{color:'var(--muted)',fontSize:13,marginBottom:16}}>
        What kind of asset do you want to add?
      </p>
      <div className="type-grid">
        {TYPE_META.map(m=>(
          <button key={m.type} className="type-card" onClick={()=>onSelect(m.type)}>
            <span className="type-icon">{m.icon}</span>
            <b>{m.type}</b>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

// Step 2a: Stock / ETF / MF — live price from API
function MarketAssetForm({ assetType, family, onBack, onSave }) {
  const isMF   = assetType === 'Mutual Fund';
  const isStock = assetType === 'Stock' || assetType === 'ETF';

  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [quote,        setQuote]        = useState(null);
  const [quoting,      setQuoting]      = useState(false);
  const [quoteErr,     setQuoteErr]     = useState('');

  // Investment mode: defaults to 'sip' for Mutual Funds, 'lumpsum' for Stocks
  const [investMode,        setInvestMode]        = useState(isMF ? 'sip' : 'lumpsum');
  const [sipAmount,         setSipAmount]         = useState('5000');
  const [stepUpValue,       setStepUpValue]       = useState('');
  const [initialSetupValue, setInitialSetupValue] = useState('');
  const [sipDay,            setSipDay]            = useState(10);
  const [sipStartDate,      setSipStartDate]      = useState(today());
  const [customNav,         setCustomNav]         = useState('');
  const [instOverride,      setInstOverride]      = useState('');
  const [showOverride,      setShowOverride]      = useState(false);

  // Lumpsum mode fields
  const [qty,          setQty]          = useState('');
  const [avg,          setAvg]          = useState('');
  const [folio,        setFolio]        = useState('');
  const [buyDate,      setBuyDate]      = useState(today());
  const [market,       setMarket]       = useState('IN');
  const [ownerId,      setOwnerId]      = useState(family[0]?.id||'');
  const debounce = useRef(null);

  const doSearch = useCallback(async q => {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = isMF
        ? await window.marketAPI.mfSearch(q)
        : await window.marketAPI.search(q, market);
      setResults(r.results || []);
    } catch {}
    setSearching(false);
  }, [isMF, market]);

  const handleQueryChange = q => {
    setQuery(q); setSelected(null); setQuote(null); setQuoteErr('');
    clearTimeout(debounce.current);
    debounce.current = setTimeout(()=>doSearch(q), 380);
  };

  const handleSelect = async item => {
    setSelected(item); setResults([]); setQuery(item.name);
    setQuoting(true); setQuoteErr('');
    try {
      const r = isMF
        ? await window.marketAPI.mfNav(item.schemeCode)
        : await window.marketAPI.quote(item.symbol);
      if (r.ok) {
        setQuote(r);
        if (isMF && r.nav) {
          setCustomNav(String(r.nav));
          setAvg(String(r.nav));
        } else if (r.price) {
          setAvg(String(r.price));
        }
      } else {
        setQuoteErr(r.error || 'Could not fetch price.');
      }
    } catch (e) { setQuoteErr(e.message); }
    setQuoting(false);
  };

  const currentPrice = isMF ? quote?.nav : quote?.price;
  const currency     = isMF ? 'INR' : (quote?.currency || (market==='IN'?'INR':'USD'));

  const elapsedInstallments = useMemo(() => {
    return calcElapsedInstallments(sipStartDate, sipDay);
  }, [sipStartDate, sipDay]);

  const activeInstallments = instOverride !== '' ? (Math.max(1, parseInt(instOverride, 10)) || 1) : elapsedInstallments;
  const sipAmtNum = Number(sipAmount) || 0;
  const effectiveNav = Number(customNav || (isMF ? quote?.nav : quote?.price) || avg || 100);

  const sipPortfolio = useMemo(() => {
    return calcStepUpSipPortfolio({
      sipAmount: sipAmtNum,
      stepUpValue: Number(stepUpValue) || 0,
      activeInstallments,
      effectiveNav,
      initialSetupValue: Number(initialSetupValue) || 0,
    });
  }, [sipAmtNum, stepUpValue, activeInstallments, effectiveNav, initialSetupValue]);

  const totalSipInvested = sipPortfolio.totalInvested;
  const totalSipUnits = sipPortfolio.totalUnits;

  const handleSave = () => {
    if (!selected) return;

    if (investMode === 'sip') {
      if (sipAmtNum <= 0 || effectiveNav <= 0 || totalSipUnits <= 0) return;
      const holding = {
        name:              selected.name,
        symbol:            isMF ? selected.schemeCode : selected.symbol,
        isin:              isMF ? (quote?.isin || '') : '',
        folio:             isMF ? folio.trim() : '',
        type:              assetType,
        ownerId,
        isSip:             true,
        sipAmount:         sipAmtNum,
        stepUpValue:       Number(stepUpValue) || 0,
        initialSetupValue: Number(initialSetupValue) || 0,
        sipDay:            parseInt(sipDay, 10) || 10,
        sipStartDate,
        lastSipDate:       today(),
        qty:               totalSipUnits,
        avg:               sipPortfolio.avgCost,
        current:           currentPrice ? round4(currentPrice) : effectiveNav,
        currency,
        source:            'manual-sip',
        lastUpdatedAt:     new Date().toISOString(),
      };
      const noteDetails = [`SIP Setup · ${activeInstallments} installment${activeInstallments>1?'s':''} (Day ${sipDay})`];
      if (Number(stepUpValue) > 0) {
        noteDetails.push(`Step-up: +₹${Number(stepUpValue).toLocaleString('en-IN')}/yr`);
      }
      if (Number(initialSetupValue) > 0) {
        noteDetails.push(`Setup: ₹${Number(initialSetupValue).toLocaleString('en-IN')}`);
      }
      const tx = {
        date:      sipStartDate,
        type:      'BUY',
        asset:     selected.name,
        symbol:    holding.symbol,
        isin:      holding.isin,
        qty:       totalSipUnits,
        price:     sipPortfolio.avgCost,
        amount:    totalSipInvested,
        currency,
        ownerId,
        ownerName: family.find(f=>f.id===ownerId)?.name||'Self',
        notes:     noteDetails.join(' · '),
        source:    'sip',
      };
      onSave({ holding, tx });
    } else {
      if (!qty || !avg) return;
      const qtyN = round4(qty), avgN = round4(avg), curN = currentPrice ? round4(currentPrice) : avgN;
      const holding = {
        name:     selected.name,
        symbol:   isMF ? selected.schemeCode : selected.symbol,
        isin:     isMF ? (quote?.isin||'') : '',
        folio:    isMF ? folio.trim() : '',
        type:     assetType,
        ownerId,
        isSip:    false,
        qty:      qtyN,
        avg:      avgN,
        current:  curN,
        currency,
        source:   'manual',
        lastUpdatedAt: new Date().toISOString(),
      };
      const tx = {
        date:      buyDate,
        type:      'BUY',
        asset:     selected.name,
        symbol:    holding.symbol,
        isin:      holding.isin,
        qty:       qtyN,
        price:     avgN,
        amount:    mulMoney(qtyN, avgN),
        currency,
        ownerId,
        ownerName: family.find(f=>f.id===ownerId)?.name||'Self',
        notes:     'One-time purchase auto-logged',
        source:    'manual',
      };
      onSave({ holding, tx });
    }
  };

  const canSave = selected && (investMode === 'sip' ? (sipAmtNum > 0 && effectiveNav > 0 && totalSipUnits > 0) : (qty && avg));

  return (
    <div>
      {isStock && (
        <div className="seg-group" style={{marginBottom:14}}>
          {[['IN','🇮🇳 Indian (NSE/BSE)'],['US','🇺🇸 US (NYSE/NASDAQ)'],['ALL','🌐 All markets']].map(([v,l])=>(
            <button key={v} className={`seg-btn${market===v?' active':''}`} onClick={()=>{setMarket(v);setQuery('');setResults([]);setSelected(null);setQuote(null);}}>
              {l}
            </button>
          ))}
        </div>
      )}

      <label className="field-label">{isMF?'Fund Name':'Company / Ticker'}</label>
      <div className="search-wrap">
        <div className="search" style={{marginBottom:0}}>
          {searching?<Loader2 size={15} className="spin"/>:<Search size={15}/>}
          <input value={query} onChange={e=>handleQueryChange(e.target.value)}
            placeholder={isMF?'e.g. Mirae Asset Large Cap / Parag Parikh…':'e.g. Reliance Industries / AAPL…'}
            autoFocus/>
          {query&&<button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'0 4px'}} onClick={()=>{setQuery('');setResults([]);setSelected(null);setQuote(null);}}><X size={13}/></button>}
        </div>
        {results.length>0&&(
          <div className="search-dropdown">
            {results.map((r,i)=>(
              <button key={i} className="search-result" onClick={()=>handleSelect(r)}>
                <div className="sr-name">{r.name}</div>
                <div className="sr-meta">
                  {isMF?`Code: ${r.schemeCode}`:`${r.symbol} · ${r.exchange}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {quoting && <div className="price-card loading"><Loader2 size={16} className="spin"/> Fetching live price…</div>}
      {quoteErr && <div className="price-card error-card"><AlertTriangle size={14}/> {quoteErr}</div>}
      {quote && !quoting && (
        <div className="price-card">
          <div className="price-main">
            <span className="price-label">{isMF?'Latest NAV':'Last Traded Price'}</span>
            <strong className="price-value">{money(currentPrice, currency)}</strong>
          </div>
          {!isMF && quote.change!=null && (
            <div className={`price-change ${quote.change>=0?'up':'down'}`}>
              {fmtChg(quote.change, quote.changePct)}
            </div>
          )}
          {isMF && quote.date && <div className="price-date">NAV date: {quote.date}</div>}
          {!isMF && <div className="price-date">Market: {quote.marketState}</div>}
        </div>
      )}

      {selected && (
        <>
          {/* Investment Mode Toggle: SIP vs Lumpsum */}
          <div className="seg-group" style={{marginTop:16, marginBottom:16}}>
            <button
              type="button"
              className={`seg-btn${investMode==='sip'?' active':''}`}
              onClick={()=>setInvestMode('sip')}
            >
              <RefreshCw size={13}/> Monthly SIP
            </button>
            <button
              type="button"
              className={`seg-btn${investMode==='lumpsum'?' active':''}`}
              onClick={()=>setInvestMode('lumpsum')}
            >
              <WalletCards size={13}/> One-time (Lumpsum)
            </button>
          </div>

          {investMode === 'sip' ? (
            <div className="formGrid">
              <label>Monthly SIP Amount (₹) *
                <input
                  type="number"
                  step="any"
                  min="100"
                  value={sipAmount}
                  onChange={e=>setSipAmount(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </label>

              <label>Annual Step-up Value (₹/yr, optional)
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={stepUpValue}
                  onChange={e=>setStepUpValue(e.target.value)}
                  placeholder="e.g. 500 (+₹500 every 12 mos)"
                />
              </label>

              <label>Initial Setup Value (₹, optional)
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={initialSetupValue}
                  onChange={e=>setInitialSetupValue(e.target.value)}
                  placeholder="e.g. 25000 (initial lumpsum / setup)"
                />
              </label>

              <label>SIP Deduction Day *
                <select
                  value={sipDay}
                  onChange={e=>setSipDay(parseInt(e.target.value, 10))}
                >
                  {Array.from({length:28}, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'} of every month</option>
                  ))}
                </select>
              </label>

              <label>SIP Start Date *
                <input
                  type="date"
                  value={sipStartDate}
                  onChange={e=>setSipStartDate(e.target.value)}
                />
              </label>

              <label>NAV Value (₹ per unit) *
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customNav}
                  onChange={e=>setCustomNav(e.target.value)}
                  placeholder={quote?.nav ? `Live: ${quote.nav}` : 'e.g. 145.50'}
                />
              </label>

              {isMF && (
                <label>Folio Number (optional)
                  <input value={folio} onChange={e=>setFolio(e.target.value)} placeholder="e.g. 1234567/89"/>
                </label>
              )}

              <label>Owner
                <select value={ownerId} onChange={e=>setOwnerId(e.target.value)}>
                  {family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>

              {/* Groww-style Step-up SIP projection box */}
              <div className="sip-calc-box">
                <div className="sip-calc-head">
                  <span>Groww-style Step-up SIP Portfolio Projection</span>
                  <button
                    type="button"
                    className="ghost"
                    style={{fontSize:11,padding:'2px 8px',height:'auto',color:'var(--cyan)',border:'1px solid rgba(0,200,224,.3)'}}
                    onClick={()=>setShowOverride(!showOverride)}
                  >
                    {showOverride ? 'Use auto-count' : 'Edit completed count'}
                  </button>
                </div>

                {showOverride && (
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,marginBottom:4}}>Override Completed Installments Count
                      <input
                        type="number"
                        min="1"
                        value={instOverride}
                        onChange={e=>setInstOverride(e.target.value)}
                        placeholder={`Calculated: ${elapsedInstallments} months`}
                      />
                    </label>
                  </div>
                )}

                <div className="sip-calc-stats">
                  <div className="sip-calc-stat">
                    <small>Completed Installments</small>
                    <strong>{sipPortfolio.installments} month{sipPortfolio.installments>1?'s':''}</strong>
                  </div>
                  {Number(stepUpValue) > 0 && (
                    <div className="sip-calc-stat">
                      <small>Current Monthly SIP</small>
                      <strong style={{color:'var(--cyan)'}}>₹{sipPortfolio.currentSipAmount.toLocaleString('en-IN')}/mo</strong>
                    </div>
                  )}
                  {Number(initialSetupValue) > 0 && (
                    <div className="sip-calc-stat">
                      <small>Initial Setup</small>
                      <strong>₹{Number(initialSetupValue).toLocaleString('en-IN')}</strong>
                    </div>
                  )}
                  <div className="sip-calc-stat">
                    <small>Total Portfolio Cost</small>
                    <strong>{money(sipPortfolio.totalInvested, currency)}</strong>
                  </div>
                  <div className="sip-calc-stat">
                    <small>Accumulated Units</small>
                    <strong>{sipPortfolio.totalUnits.toLocaleString('en-IN')} units</strong>
                  </div>
                </div>

                {sipPortfolio.yearWise.length > 1 && Number(stepUpValue) > 0 && (
                  <div className="sip-stepup-breakdown" style={{marginTop:10,fontSize:11,color:'var(--muted)',display:'flex',flexWrap:'wrap',gap:6}}>
                    {sipPortfolio.yearWise.map(y => (
                      <span key={y.year} style={{background:'rgba(255,255,255,0.04)',padding:'3px 8px',borderRadius:4,border:'1px solid rgba(255,255,255,0.08)'}}>
                        Yr {y.year}: {y.count} mos @ ₹{y.monthlyAmt.toLocaleString('en-IN')}/mo = ₹{y.total.toLocaleString('en-IN')}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{marginTop:10,fontSize:11,color:'var(--muted)',display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}}>
                  <span>
                    Current deduction: ₹{sipPortfolio.currentSipAmount.toLocaleString('en-IN')}/mo on Day {sipDay}
                    {Number(stepUpValue) > 0 && ` (Step-up: +₹${Number(stepUpValue).toLocaleString('en-IN')}/yr)`}
                  </span>
                  <span style={{color:'var(--cyan)',fontWeight:600}}>Next SIP: {calcNextSipDate(sipDay)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="formGrid">
              <label>Quantity / Units *
                <input type="number" step="any" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="e.g. 10"/>
              </label>
              <label>Avg Buy Price ({isMF?'NAV per unit':'per share'}) *
                <input type="number" step="any" min="0" value={avg} onChange={e=>setAvg(e.target.value)} placeholder={quote?.nav?`Live: ${quote.nav}`:'e.g. 2500'}/>
              </label>
              {isMF && (
                <label>Folio Number (optional)
                  <input value={folio} onChange={e=>setFolio(e.target.value)} placeholder="e.g. 1234567/89"/>
                </label>
              )}
              <label>Purchase Date
                <input type="date" value={buyDate} onChange={e=>setBuyDate(e.target.value)}/>
              </label>
              <label>Owner
                <select value={ownerId} onChange={e=>setOwnerId(e.target.value)}>
                  {family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              {qty&&avg&&(
                <div className="form-summary" style={{gridColumn:'1/-1'}}>
                  <span>Total Invested</span>
                  <strong>{money(mulMoney(qty, avg), currency)}</strong>
                  {currentPrice&&<><span>Current Value</span><strong>{money(mulMoney(qty, currentPrice), currency)}</strong></>}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="wizard-footer">
        <button className="ghost" onClick={onBack}><ArrowLeft size={14}/> Back</button>
        <button className="primary" onClick={handleSave} disabled={!canSave}>
          Add to Portfolio <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

// Step 2b: Dedicated Fixed Income Asset Form (Bonds & FDs)
function BondFdAssetForm({ assetType, family, onBack, onSave }) {
  const isBond = assetType === 'Bond';
  const isFD = assetType === 'FD';

  // Form states
  const [name,            setName]            = useState('');
  const [symbol,          setSymbol]          = useState('');
  const [isin,            setIsin]            = useState('');
  const [qty,             setQty]             = useState(isBond ? '10' : '1');
  const [initialPrice,    setInitialPrice]    = useState(isBond ? '1000' : '100000');
  const [interestRate,    setInterestRate]    = useState(isBond ? '10.0' : '7.5');
  const [payoutFrequency, setPayoutFrequency] = useState(isFD ? 'cumulative' : 'monthly');
  const [payoutDay,       setPayoutDay]       = useState(15);
  const [buyDate,         setBuyDate]         = useState(today());
  const [maturityDate,    setMaturityDate]    = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + (isBond ? 4 : 3));
    return d.toISOString().slice(0, 10);
  });
  const [currency,        setCurrency]        = useState('INR');
  const [ownerId,         setOwnerId]         = useState(family[0]?.id || '');
  const [notes,           setNotes]           = useState('');

  // Live price quote state
  const [liveQuote,       setLiveQuote]       = useState(null);
  const [checkingQuote,   setCheckingQuote]   = useState(false);
  const [quoteErr,        setQuoteErr]        = useState('');
  const [useLivePrice,    setUseLivePrice]    = useState(false);

  // Auto-fill suggestions for popular bonds/FDs (like IIFL Finance, GOI, SBI FD, HDFC FD)
  const handleQuickTemplate = (tpl) => {
    setName(tpl.name);
    if (tpl.symbol) setSymbol(tpl.symbol);
    if (tpl.isin) setIsin(tpl.isin);
    if (tpl.initialPrice) setInitialPrice(String(tpl.initialPrice));
    if (tpl.interestRate) setInterestRate(String(tpl.interestRate));
    if (tpl.payoutFrequency) setPayoutFrequency(tpl.payoutFrequency);
  };

  const handleFetchLivePrice = async () => {
    const querySym = symbol.trim() || isin.trim();
    if (!querySym) {
      setQuoteErr('Please enter a Symbol or ISIN to check live quote.');
      return;
    }
    setCheckingQuote(true);
    setQuoteErr('');
    try {
      let symToTry = querySym.toUpperCase();
      if (!symToTry.includes('.') && !symToTry.startsWith('^')) {
        symToTry = `${symToTry}.NS`;
      }
      let r = await window.marketAPI?.quote?.(symToTry);
      if (!r?.ok && symToTry.endsWith('.NS')) {
        r = await window.marketAPI?.quote?.(querySym.toUpperCase());
      }
      if (r?.ok && r.price) {
        setLiveQuote(r);
        setUseLivePrice(true);
      } else {
        setQuoteErr(r?.error || `No exchange quote found for "${querySym}". Using face value/internal calculation.`);
      }
    } catch (e) {
      setQuoteErr(e.message || 'Error checking live price.');
    }
    setCheckingQuote(false);
  };

  // Fixed Income Metrics Calculation
  const metrics = useMemo(() => {
    return calcBondFdMetrics({
      qty,
      initialPrice,
      interestRate,
      payoutFrequency,
      buyDate,
      maturityDate,
    });
  }, [qty, initialPrice, interestRate, payoutFrequency, buyDate, maturityDate]);

  // Elapsed Payouts count if buyDate was in the past
  const elapsedPayoutsCount = useMemo(() => {
    if (!buyDate || payoutFrequency === 'cumulative') return 0;
    const start = new Date(buyDate);
    const now = new Date();
    if (isNaN(start.getTime()) || start >= now) return 0;

    let stepMonths = 1;
    if (payoutFrequency === 'quarterly') stepMonths = 3;
    else if (payoutFrequency === 'half-yearly') stepMonths = 6;
    else if (payoutFrequency === 'annually') stepMonths = 12;

    let count = 0;
    let curYear = start.getFullYear();
    let curMonth = start.getMonth();
    while (true) {
      curMonth += stepMonths;
      while (curMonth > 11) { curMonth -= 12; curYear += 1; }
      const pDate = new Date(curYear, curMonth, payoutDay, 12, 0, 0);
      if (pDate > now) break;
      if (maturityDate && pDate > new Date(maturityDate)) break;
      count++;
    }
    return count;
  }, [buyDate, payoutFrequency, payoutDay, maturityDate]);

  const canSave = name.trim() && Number(qty) > 0 && Number(initialPrice) > 0 && Number(interestRate) > 0;

  const handleSave = () => {
    if (!canSave) return;
    const qtyN = round4(qty);
    const initPriceN = round4(initialPrice);
    const rateN = Number(interestRate) || 0;
    const effectiveCurPrice = (useLivePrice && liveQuote?.price) ? round4(liveQuote.price) : initPriceN;

    const holding = {
      name:            name.trim(),
      symbol:          symbol.trim(),
      isin:            isin.trim(),
      type:            assetType,
      ownerId,
      qty:             qtyN,
      avg:             initPriceN,
      current:         effectiveCurPrice,
      currency,
      interestRate:    rateN,
      payoutFrequency,
      payoutDay:       parseInt(payoutDay, 10) || 15,
      buyDate,
      maturityDate:    maturityDate || null,
      lastPayoutDate:  buyDate,
      notes:           notes.trim(),
      source:          'manual-fixed-income',
      lastUpdatedAt:   new Date().toISOString(),
    };

    const tx = {
      date:      buyDate,
      type:      'BUY',
      asset:     holding.name,
      symbol:    holding.symbol,
      isin:      holding.isin,
      qty:       qtyN,
      price:     initPriceN,
      amount:    metrics.principal,
      currency,
      ownerId,
      ownerName: family.find(f => f.id === ownerId)?.name || 'Self',
      notes:     `${assetType} Setup · ${rateN}% p.a. (${payoutFrequency})`,
      source:    'manual',
    };

    onSave({ holding, tx });
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <p style={{color:'var(--muted)',fontSize:13,margin:0}}>
          Configure your {assetType} details, yearly yield, and payout schedule.
        </p>
      </div>

      {/* Quick template buttons */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        <span style={{fontSize:11,color:'var(--muted)',alignSelf:'center'}}>Templates:</span>
        {isBond ? [
          { label: 'IIFL Finance 10% NCD', name: 'IIFL Finance Limited NCD 10%', symbol: 'IIFL-N1', isin: 'INE530B07038', initialPrice: 1000, interestRate: 10.0, payoutFrequency: 'monthly' },
          { label: 'GOI 7.26% 2032', name: 'Government of India Bond 7.26% 2032', symbol: '726GS2032', isin: 'IN0020220011', initialPrice: 100, interestRate: 7.26, payoutFrequency: 'half-yearly' },
          { label: 'NHAI 8.75% Tax-Free', name: 'NHAI Tax-Free Bond 8.75%', symbol: 'NHAI-N1', isin: 'INE906B07DF8', initialPrice: 1000, interestRate: 8.75, payoutFrequency: 'annually' },
        ].map(t => (
          <button
            key={t.label}
            type="button"
            className="ghost"
            style={{fontSize:11,padding:'2px 8px',height:'auto',border:'1px solid rgba(255,255,255,0.1)'}}
            onClick={() => handleQuickTemplate(t)}
          >
            {t.label}
          </button>
        )) : [
          { label: 'SBI FD 7.5% (Cumulative)', name: 'SBI Fixed Deposit 7.5%', symbol: 'SBI-FD', isin: '', initialPrice: 100000, interestRate: 7.5, payoutFrequency: 'cumulative' },
          { label: 'HDFC FD 7.75% (Monthly)', name: 'HDFC Bank FD 7.75% Monthly', symbol: 'HDFC-FD', isin: '', initialPrice: 500000, interestRate: 7.75, payoutFrequency: 'monthly' },
          { label: 'Bajaj Finance 8.1% (Quarterly)', name: 'Bajaj Finance FD 8.1%', symbol: 'BAJAJ-FD', isin: '', initialPrice: 200000, interestRate: 8.1, payoutFrequency: 'quarterly' },
        ].map(t => (
          <button
            key={t.label}
            type="button"
            className="ghost"
            style={{fontSize:11,padding:'2px 8px',height:'auto',border:'1px solid rgba(255,255,255,0.1)'}}
            onClick={() => handleQuickTemplate(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="formGrid">
        <label style={{gridColumn:'1/-1'}}>
          {isBond ? 'Bond Name *' : 'Fixed Deposit Name *'}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={isBond ? 'e.g. IIFL Finance Limited NCD 10% 2028' : 'e.g. SBI Fixed Deposit — 7.5% 3Y'}
            autoFocus
          />
        </label>

        <label>
          Code / Ticker (optional)
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            placeholder={isBond ? 'e.g. IIFL-N1 / ECLFINANCE' : 'e.g. SBI-FD / Receipt No.'}
          />
        </label>

        <label>
          ISIN / Reference No. (optional)
          <input
            value={isin}
            onChange={e => setIsin(e.target.value)}
            placeholder="e.g. INE530B07038"
          />
        </label>

        {isBond && (symbol || isin) && (
          <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.02)',padding:'8px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)'}}>
            <button
              type="button"
              className="ghost"
              style={{fontSize:11,padding:'4px 10px',height:'auto',color:'var(--cyan)',border:'1px solid rgba(0,200,224,0.3)'}}
              onClick={handleFetchLivePrice}
              disabled={checkingQuote}
            >
              {checkingQuote ? <Loader2 size={12} className="spin" /> : <Search size={12} />}
              {' Check Live Price on NSE/BSE'}
            </button>
            {liveQuote && (
              <span style={{fontSize:12,color:'#38bdf8',fontWeight:600}}>
                Live: {money(liveQuote.price, liveQuote.currency || 'INR')}
                <button
                  type="button"
                  style={{marginLeft:8,fontSize:11,background:useLivePrice?'var(--cyan)':'transparent',color:useLivePrice?'#000':'var(--cyan)',border:'1px solid var(--cyan)',borderRadius:4,padding:'2px 6px',cursor:'pointer'}}
                  onClick={() => setUseLivePrice(!useLivePrice)}
                >
                  {useLivePrice ? 'Using Live Price' : 'Use Live Price'}
                </button>
              </span>
            )}
            {quoteErr && <span style={{fontSize:11,color:'var(--muted)'}}>{quoteErr}</span>}
          </div>
        )}

        <label>
          {isBond ? 'Units / Quantity Bought *' : 'Number of Deposits *'}
          <input
            type="number"
            step="any"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder={isBond ? 'e.g. 10' : 'e.g. 1'}
          />
        </label>

        <label>
          {isBond ? 'Initial Value / Buy Price per unit (₹) *' : 'Principal Deposit Amount (₹) *'}
          <input
            type="number"
            step="any"
            min="1"
            value={initialPrice}
            onChange={e => setInitialPrice(e.target.value)}
            placeholder={isBond ? 'e.g. 1000' : 'e.g. 100000'}
          />
        </label>

        <label>
          Yearly Yield / Coupon Rate (% p.a.) *
          <input
            type="number"
            step="any"
            min="0"
            value={interestRate}
            onChange={e => setInterestRate(e.target.value)}
            placeholder="e.g. 10.0"
          />
        </label>

        <label>
          Interest Payout Frequency *
          <select value={payoutFrequency} onChange={e => setPayoutFrequency(e.target.value)}>
            <option value="monthly">Monthly (Every month regular income)</option>
            <option value="quarterly">Quarterly (Every 3 months)</option>
            <option value="half-yearly">Half-Yearly (Every 6 months)</option>
            <option value="annually">Annually (Every 12 months)</option>
            <option value="cumulative">Cumulative / Compounded (Paid at Maturity)</option>
          </select>
        </label>

        {payoutFrequency !== 'cumulative' && (
          <label>
            Payout Day of Month *
            <select value={payoutDay} onChange={e => setPayoutDay(parseInt(e.target.value, 10))}>
              {Array.from({length:28}, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'} of every month</option>
              ))}
            </select>
          </label>
        )}

        <label>
          Issue / Purchase Date *
          <input
            type="date"
            value={buyDate}
            onChange={e => setBuyDate(e.target.value)}
          />
        </label>

        <label>
          Maturity Date *
          <input
            type="date"
            value={maturityDate}
            onChange={e => setMaturityDate(e.target.value)}
          />
        </label>

        <label>
          Owner
          <select value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            {family.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>

        <label style={{gridColumn: payoutFrequency === 'cumulative' ? 'span 1' : '1/-1'}}>
          Currency
          <select value={currency} onChange={e => setCurrency(e.target.value)}>
            {['INR','USD','EUR','GBP','SGD','AED'].map(c => <option key={c}>{c}</option>)}
          </select>
        </label>

        {/* Live Fixed-Income Projection Card */}
        <div className="bond-calc-box">
          <div className="bond-calc-head">
            <span>Fixed Income Yield & Cashflow Projection</span>
            <span style={{fontSize:11,color:'var(--muted)'}}>
              Tenor: {metrics.tenorYears > 0 ? `${metrics.tenorYears} yrs` : 'Flexible'}
            </span>
          </div>

          <div className="bond-calc-stats">
            <div className="bond-calc-stat">
              <small>Total Principal Invested</small>
              <strong>{money(metrics.principal, currency)}</strong>
            </div>
            {metrics.payoutFrequency !== 'cumulative' ? (
              <>
                <div className="bond-calc-stat">
                  <small>Periodic Payout ({metrics.payoutFrequency})</small>
                  <strong style={{color:'var(--cyan)'}}>{money(metrics.periodicPayout, currency)}</strong>
                </div>
                <div className="bond-calc-stat">
                  <small>Annual Income</small>
                  <strong style={{color:'#10b981'}}>{money(metrics.annualIncome, currency)}/yr</strong>
                </div>
              </>
            ) : (
              <>
                <div className="bond-calc-stat">
                  <small>Compound Interest</small>
                  <strong style={{color:'#10b981'}}>{money(metrics.totalInterest, currency)}</strong>
                </div>
                <div className="bond-calc-stat">
                  <small>Projected Maturity Value</small>
                  <strong style={{color:'var(--cyan)'}}>{money(metrics.maturityValue, currency)}</strong>
                </div>
              </>
            )}
            <div className="bond-calc-stat">
              <small>{metrics.payoutFrequency === 'cumulative' ? 'Maturity Date' : 'Next Payout Date'}</small>
              <strong style={{color:'#fbd38d'}}>
                {calcNextPayoutDate(buyDate, payoutFrequency, payoutDay, maturityDate)}
              </strong>
            </div>
          </div>

          {elapsedPayoutsCount > 0 && (
            <div style={{marginTop:10,fontSize:11.5,color:'var(--cyan)',background:'rgba(0,200,224,0.06)',padding:'6px 10px',borderRadius:4,border:'1px solid rgba(0,200,224,0.15)'}}>
              🔄 <strong>{elapsedPayoutsCount} elapsed interest payout{elapsedPayoutsCount>1?'s':''}</strong> (≈ {money(round2(elapsedPayoutsCount * metrics.periodicPayout), currency)}) will be automatically added to your ledger on save.
            </div>
          )}
        </div>
      </div>

      <div className="wizard-footer">
        <button className="ghost" onClick={onBack}><ArrowLeft size={14}/> Back</button>
        <button className="primary" onClick={handleSave} disabled={!canSave}>
          Add to Portfolio <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

// Step 2c: Manual assets (Gold, Crypto, Cash, REIT, Other)
function ManualAssetForm({ assetType, family, onBack, onSave }) {
  const needsCurrentPrice = MANUAL_PRICED.has(assetType);
  const [form, setForm] = useState({
    name:'', symbol:'', isin:'', folio:'', qty:'1', avg:'', current:'',
    currency:'INR', ownerId: family[0]?.id||'', buyDate: today(),
    maturityDate:'', interestRate:'', notes:'',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const isBondOrFD = assetType==='Bond'||assetType==='FD';

  const handleSave = () => {
    if(!form.name||!form.qty||!form.avg) return;
    const qtyN = round4(form.qty);
    const avgN = round4(form.avg);
    const curN = form.current ? round4(form.current) : avgN;
    const holding = {
      name:form.name, symbol:form.symbol, isin:form.isin, folio:form.folio||'',
      type:assetType, ownerId:form.ownerId, qty:qtyN, avg:avgN, current:curN,
      currency:form.currency, maturityDate:form.maturityDate||null,
      interestRate:form.interestRate||null, notes:form.notes,
      source:'manual', lastUpdatedAt:new Date().toISOString(),
    };
    const tx = {
      date:form.buyDate, type:'BUY', asset:form.name, symbol:form.symbol,
      isin:form.isin, qty:qtyN, price:avgN, amount:mulMoney(qtyN, avgN),
      currency:form.currency, ownerId:form.ownerId,
      ownerName:family.find(f=>f.id===form.ownerId)?.name||'Self',
      notes:'Auto-logged on asset add', source:'manual',
    };
    onSave({ holding, tx });
  };

  const canSave = form.name && form.qty && form.avg;

  return (
    <div>
      <p style={{color:'var(--muted)',fontSize:13,marginBottom:14}}>
        Enter {assetType} details below.
      </p>
      <div className="formGrid">
        <label style={{gridColumn:'1/-1'}}>Asset Name *
          <input value={form.name} onChange={e=>set('name',e.target.value)}
            placeholder={assetType==='FD'?'SBI FD — 7.5% 2Y':assetType==='Bond'?'GOI Bond 7.26% 2032':assetType==='Gold'?'Physical Gold — 22K':assetType==='Crypto'?'Bitcoin':'Asset name'}/>
        </label>

        {(assetType==='Bond'||assetType==='FD')&&(
          <label>ISIN / Reference No.
            <input value={form.isin} onChange={e=>set('isin',e.target.value)} placeholder="INE… or FD ref no."/>
          </label>
        )}
        {assetType==='Crypto'&&(
          <label>Ticker
            <input value={form.symbol} onChange={e=>set('symbol',e.target.value)} placeholder="BTC-USD"/>
          </label>
        )}
        {assetType==='Gold'&&(
          <label>Form / Purity
            <input value={form.symbol} onChange={e=>set('symbol',e.target.value)} placeholder="22K / SGB / ETF"/>
          </label>
        )}

        <label>{assetType==='FD'?'Principal (₹)':assetType==='Gold'?'Quantity (grams)':assetType==='Bond'?'Face Value Units':'Quantity'} *
          <input type="number" step="any" min="0" value={form.qty} onChange={e=>set('qty',e.target.value)}/>
        </label>
        <label>{assetType==='FD'?'FD Rate (% p.a.)':assetType==='Bond'?'Coupon Rate (%)':assetType==='Gold'?'Buy Price per gram':'Buy Price per unit'} *
          <input type="number" step="any" min="0" value={form.avg} onChange={e=>set('avg',e.target.value)}/>
        </label>

        {needsCurrentPrice&&(
          <label>Current Value / Price {assetType==='FD'?'(maturity value)':'per unit'}
            <input type="number" step="any" min="0" value={form.current}
              onChange={e=>set('current',e.target.value)}
              placeholder="Leave blank to use buy price"/>
          </label>
        )}

        <label>Currency
          <select value={form.currency} onChange={e=>set('currency',e.target.value)}>
            {['INR','USD','EUR','GBP','SGD','AED'].map(c=><option key={c}>{c}</option>)}
          </select>
        </label>

        <label>Purchase Date
          <input type="date" value={form.buyDate} onChange={e=>set('buyDate',e.target.value)}/>
        </label>

        {isBondOrFD&&(
          <label>Maturity Date
            <input type="date" value={form.maturityDate} onChange={e=>set('maturityDate',e.target.value)}/>
          </label>
        )}

        <label>Owner
          <select value={form.ownerId} onChange={e=>set('ownerId',e.target.value)}>
            {family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>

        {form.qty&&form.avg&&(
          <div className="form-summary" style={{gridColumn:'1/-1'}}>
            <span>Total Invested</span>
            <strong>{money(mulMoney(form.qty, form.avg), form.currency)}</strong>
          </div>
        )}
      </div>

      <div className="wizard-footer">
        <button className="ghost" onClick={onBack}><ArrowLeft size={14}/> Back</button>
        <button className="primary" onClick={handleSave} disabled={!canSave}>
          Add to Portfolio <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

// Simple edit form
function EditAssetForm({ form, setForm, family }) {
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div className="formGrid">
      <label style={{gridColumn:'1/-1'}}>Asset Name *
        <input value={form.name} onChange={e=>set('name',e.target.value)}/>
      </label>
      <label>Symbol / Ticker<input value={form.symbol||''} onChange={e=>set('symbol',e.target.value)}/></label>
      <label>ISIN<input value={form.isin||''} onChange={e=>set('isin',e.target.value)}/></label>
      {form.type === 'Mutual Fund' && (
        <label>Folio Number<input value={form.folio||''} onChange={e=>set('folio',e.target.value)}/></label>
      )}
      <label>Type
        <select value={form.type} onChange={e=>set('type',e.target.value)}>
          {ASSET_TYPES.map(x=><option key={x}>{x}</option>)}
        </select>
      </label>
      <label>Owner
        <select value={form.ownerId} onChange={e=>set('ownerId',e.target.value)}>
          {family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label>Currency
        <select value={form.currency||'INR'} onChange={e=>set('currency',e.target.value)}>
          {['INR','USD','EUR','GBP','SGD','AED'].map(c=><option key={c}>{c}</option>)}
        </select>
      </label>
      <label>Quantity *<input type="number" step="any" min="0" value={form.qty} onChange={e=>set('qty',e.target.value)}/></label>
      <label>Avg Buy Price *<input type="number" step="any" min="0" value={form.avg} onChange={e=>set('avg',e.target.value)}/></label>
      <label>
        Current Price {MARKET_PRICED.has(form.type)?<span style={{color:'var(--muted)',fontWeight:400}}>(override live price)</span>:''}
        <input type="number" step="any" min="0" value={form.current} onChange={e=>set('current',e.target.value)}/>
      </label>

      <div style={{gridColumn:'1/-1',marginTop:8,padding:'10px 14px',background:'rgba(0,200,224,.04)',border:'1px solid rgba(0,200,224,.15)',borderRadius:'var(--radius-sm)'}}>
        <label className="checkbox-row" style={{marginBottom: form.isSip ? 10 : 0}}>
          <input type="checkbox" checked={!!form.isSip} onChange={e=>set('isSip', e.target.checked)}/>
          <span style={{fontWeight:600,color:'var(--text)'}}>🔄 Active Monthly SIP (Auto-accrue on deduction day)</span>
        </label>
        {form.isSip && (
          <div className="formGrid" style={{marginTop:10}}>
            <label>Monthly SIP Amount (₹) *
              <input type="number" step="any" min="100" value={form.sipAmount||''} onChange={e=>set('sipAmount',e.target.value)} placeholder="e.g. 5000"/>
            </label>
            <label>Annual Step-up Value (₹/yr, optional)
              <input type="number" step="any" min="0" value={form.stepUpValue||''} onChange={e=>set('stepUpValue',e.target.value)} placeholder="e.g. 500 (+₹500 every 12 mos)"/>
            </label>
            <label>Initial Setup Value (₹, optional)
              <input type="number" step="any" min="0" value={form.initialSetupValue||''} onChange={e=>set('initialSetupValue',e.target.value)} placeholder="e.g. 25000 (initial lumpsum / setup)"/>
            </label>
            <label>Deduction Day of Month *
              <select value={form.sipDay||10} onChange={e=>set('sipDay',parseInt(e.target.value,10))}>
                {Array.from({length:28},(_,i)=>i+1).map(d=>(
                  <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'} of every month</option>
                ))}
              </select>
            </label>
            <label>SIP Start Date
              <input type="date" value={form.sipStartDate||today()} onChange={e=>set('sipStartDate',e.target.value)}/>
            </label>
            <label>Last Deducted Date
              <input type="date" value={form.lastSipDate||form.sipStartDate||today()} onChange={e=>set('lastSipDate',e.target.value)}/>
            </label>
          </div>
        )}
      </div>

      {(form.type === 'Bond' || form.type === 'FD') && (
        <div style={{gridColumn:'1/-1',marginTop:8,padding:'10px 14px',background:'rgba(245,158,11,.04)',border:'1px solid rgba(245,158,11,.2)',borderRadius:'var(--radius-sm)'}}>
          <span style={{fontWeight:600,color:'#fbd38d'}}>🔒 Fixed Income Interest & Maturity Settings</span>
          <div className="formGrid" style={{marginTop:10}}>
            <label>Yearly Yield / Coupon Rate (% p.a.) *
              <input type="number" step="any" min="0" value={form.interestRate||''} onChange={e=>set('interestRate',e.target.value)} placeholder="e.g. 10.0"/>
            </label>
            <label>Interest Payout Frequency *
              <select value={form.payoutFrequency||(form.type==='FD'?'cumulative':'monthly')} onChange={e=>set('payoutFrequency',e.target.value)}>
                <option value="monthly">Monthly (Every month)</option>
                <option value="quarterly">Quarterly (Every 3 months)</option>
                <option value="half-yearly">Half-Yearly (Every 6 months)</option>
                <option value="annually">Annually (Every 12 months)</option>
                <option value="cumulative">Cumulative / Compounded (At Maturity)</option>
              </select>
            </label>
            {form.payoutFrequency !== 'cumulative' && (
              <label>Payout Day of Month
                <select value={form.payoutDay||15} onChange={e=>set('payoutDay',parseInt(e.target.value,10))}>
                  {Array.from({length:28},(_,i)=>i+1).map(d=>(
                    <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'} of month</option>
                  ))}
                </select>
              </label>
            )}
            <label>Purchase Date
              <input type="date" value={form.buyDate||today()} onChange={e=>set('buyDate',e.target.value)}/>
            </label>
            <label>Maturity Date
              <input type="date" value={form.maturityDate||''} onChange={e=>set('maturityDate',e.target.value)}/>
            </label>
            {form.payoutFrequency !== 'cumulative' && (
              <label>Last Payout Date
                <input type="date" value={form.lastPayoutDate||form.buyDate||today()} onChange={e=>set('lastPayoutDate',e.target.value)}/>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transactions ───────────────────────────────────────────────────────────────
function Transactions({ vault, save }) {
  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState({date:today(),type:'BUY',asset:'',symbol:'',isin:'',qty:'',price:'',amount:'',currency:'INR',ownerId:vault.family[0]?.id||'',notes:''});
  const [syncHoldings,  setSyncHoldings]  = useState(true);
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('All');
  const [expanded,      setExpanded]      = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);

  const handleAdd = () => {
    if(!form.asset&&!form.symbol) return;
    const qtyN = form.qty ? round4(form.qty) : undefined;
    const priceN = form.price != null && form.price !== '' ? round4(form.price) : null;
    const amtN = form.amount ? round2(form.amount) : (qtyN && priceN ? mulMoney(qtyN, priceN) : 0);

    const newTx = {
      ...form, id:uid(),
      qty:   qtyN,
      price: priceN,
      amount: amtN,
      ownerName: vault.family.find(f=>f.id===form.ownerId)?.name||'Self',
      source:'manual',
    };

    let nextHoldings = [...vault.holdings];

    // Synchronize manual transactions with active holdings
    if (syncHoldings && qtyN && qtyN > 0) {
      const normIsin = norm(form.isin);
      const normSym = norm(form.symbol);
      const normName = norm(form.asset);

      let matchIdx = -1;
      if (normIsin) matchIdx = nextHoldings.findIndex(h => norm(h.isin) === normIsin && h.ownerId === form.ownerId);
      if (matchIdx < 0 && normSym) matchIdx = nextHoldings.findIndex(h => norm(h.symbol) === normSym && h.ownerId === form.ownerId);
      if (matchIdx < 0 && normName) matchIdx = nextHoldings.findIndex(h => norm(h.name) === normName && h.ownerId === form.ownerId);

      if (form.type === 'BUY') {
        if (matchIdx >= 0) {
          const existing = nextHoldings[matchIdx];
          const oldQty = Number(existing.qty) || 0;
          const oldAvg = Number(existing.avg) || 0;
          const newQty = round4(oldQty + qtyN);
          const newAvg = calcAvgCost(oldQty, oldAvg, qtyN, priceN || oldAvg);
          nextHoldings[matchIdx] = {
            ...existing,
            qty: newQty,
            avg: newAvg,
            current: priceN || existing.current || newAvg,
            lastUpdatedAt: new Date().toISOString(),
          };
        } else {
          const newH = {
            id: uid(),
            name: form.asset,
            symbol: form.symbol || '',
            isin: form.isin || '',
            type: classify(form.asset),
            ownerId: form.ownerId,
            qty: qtyN,
            avg: priceN || 0,
            current: priceN || 0,
            currency: form.currency || 'INR',
            source: 'manual',
            lastUpdatedAt: new Date().toISOString(),
          };
          nextHoldings.push(newH);
        }
      } else if (form.type === 'SELL') {
        if (matchIdx >= 0) {
          const existing = nextHoldings[matchIdx];
          const oldQty = Number(existing.qty) || 0;
          const newQty = round4(oldQty - qtyN);
          if (newQty <= 0) {
            nextHoldings.splice(matchIdx, 1);
          } else {
            nextHoldings[matchIdx] = {
              ...existing,
              qty: newQty,
              lastUpdatedAt: new Date().toISOString(),
            };
          }
        }
      }
    }

    save({
      ...vault,
      transactions: [...vault.transactions, newTx],
      holdings: nextHoldings.filter(h => (Number(h.qty) || 0) > 0),
    });
    setForm({date:today(),type:'BUY',asset:'',symbol:'',isin:'',qty:'',price:'',amount:'',currency:'INR',ownerId:vault.family[0]?.id||'',notes:''});
    setShowModal(false);
  };

  const handleDelete = id => {
    save({...vault, transactions: vault.transactions.filter(t=>t.id!==id)});
    setConfirmDel(null); if(expanded===id) setExpanded(null);
  };

  const rows = useMemo(()=>{
    let r=[...vault.transactions].reverse();
    if(search){const q=search.toLowerCase();r=r.filter(t=>(t.asset+' '+(t.symbol||'')+' '+(t.isin||'')+' '+t.type).toLowerCase().includes(q));}
    if(typeFilter!=='All')r=r.filter(t=>t.type===typeFilter);
    return r;
  },[vault.transactions,search,typeFilter]);

  const txColor = type=>({BUY:'var(--cyan)',SELL:'var(--red)',DIVIDEND:'var(--green)',INTEREST:'var(--green)'}[type]||'var(--muted)');

  return (<>
    <Header label="Activity" title="Transactions" sub="All buy/sell events, dividends and cash flows">
      <button className="primary" onClick={()=>setShowModal(true)}><Plus size={15}/> Add Transaction</button>
    </Header>
    <div className="toolbar">
      <div className="search">
        <Search size={15}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search asset or type…"/>
        {search&&<button style={{background:'none',border:'none',color:'var(--muted)',padding:'0 4px',cursor:'pointer'}} onClick={()=>setSearch('')}><X size={13}/></button>}
      </div>
      <select className="filterSelect" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
        <option value="All">All types</option>
        {TX_TYPES.map(t=><option key={t}>{t}</option>)}
      </select>
      <div className="pill" style={{flexShrink:0}}>{rows.length}</div>
    </div>
    <div className="panel tablePanel">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Qty</th><th>Price / Unit</th><th>Total Amount</th><th>Owner</th><th></th></tr></thead>
        <tbody>
          {rows.map(t=>(<React.Fragment key={t.id}>
            <tr style={{cursor:'pointer'}} onClick={()=>setExpanded(expanded===t.id?null:t.id)}>
              <td>{t.date||'—'}</td>
              <td><span className="tag" style={{color:txColor(t.type),borderColor:`${txColor(t.type)}33`}}>{t.type}</span></td>
              <td><b>{t.asset||t.name||'—'}</b><small>{t.symbol||t.isin||''}</small></td>
              <td>{t.qty?Number(t.qty).toLocaleString('en-IN'):'—'}</td>
              <td>{t.price!=null?money(t.price,t.currency):'—'}</td>
              <td><b>{money(t.amount,t.currency)}</b></td>
              <td>{t.ownerName||'Self'}</td>
              <td onClick={e=>e.stopPropagation()}>
                {confirmDel===t.id?(
                  <div className="confirm-inline">
                    <span>Delete?</span>
                    <button className="btn-confirm-yes" onClick={()=>handleDelete(t.id)}>Yes</button>
                    <button className="btn-confirm-no" onClick={()=>setConfirmDel(null)}>No</button>
                  </div>
                ):(
                  <div className="row-actions">
                    <button className="btn-icon danger" title="Delete" onClick={()=>setConfirmDel(t.id)}><Trash2 size={13}/></button>
                  </div>
                )}
              </td>
            </tr>
            {expanded===t.id&&(
              <tr className="tx-expand"><td colSpan={8}>
                {t.notes&&<div><b>Notes:</b> {t.notes}</div>}
                {t.source&&<div><b>Source:</b> {t.source}</div>}
                {t.evidence&&<div className="tx-evidence"><b>Evidence:</b> {t.evidence}</div>}
                {!t.notes&&!t.evidence&&!t.source&&<span>No additional details.</span>}
              </td></tr>
            )}
          </React.Fragment>))}
        </tbody>
      </table>
      {!rows.length&&<Empty text={vault.transactions.length?'No transactions match the filters.':'No transactions yet. They auto-log when you add holdings, or add one manually.'}/>}
    </div>

    {showModal&&(
      <Modal title="Add Transaction" onClose={()=>setShowModal(false)}>
        <TxForm form={form} setForm={setForm} family={vault.family} holdings={vault.holdings} syncHoldings={syncHoldings} setSyncHoldings={setSyncHoldings}/>
        <button className="primary full" onClick={handleAdd}>Add Transaction</button>
      </Modal>
    )}
  </>);
}

function TxForm({ form, setForm, family, holdings, syncHoldings, setSyncHoldings }) {
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const handleQtyPrice = (k,v) => {
    const next={...form,[k]:v};
    if(next.qty&&next.price) next.amount=mulMoney(next.qty, next.price);
    setForm(next);
  };
  const fillFromHolding = id => {
    const h = holdings.find(x => x.id === id);
    if (!h) return;
    const price = h.current || h.avg || form.price || '';
    const amount = (form.qty && price) ? mulMoney(form.qty, price) : form.amount;
    setForm(f => ({
      ...f,
      asset: h.name,
      symbol: h.symbol || '',
      isin: h.isin || '',
      currency: h.currency || 'INR',
      ownerId: h.ownerId || f.ownerId,
      price,
      amount
    }));
  };
  return (
    <div className="formGrid">
      <label>Date *<input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></label>
      <label>Type *
        <select value={form.type} onChange={e=>set('type',e.target.value)}>
          {TX_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
      </label>
      {holdings.filter(h => (Number(h.qty) || 0) > 0).length > 0 && (
        <label style={{gridColumn:'1/-1'}}>Pick from Holdings (optional)
          <select onChange={e=>fillFromHolding(e.target.value)} defaultValue="">
            <option value="">— Select to auto-fill asset —</option>
            {holdings.filter(h => (Number(h.qty) || 0) > 0).map(h=><option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
          </select>
        </label>
      )}
      <label>Asset Name *<input value={form.asset} onChange={e=>set('asset',e.target.value)} placeholder="Reliance Industries"/></label>
      <label>Symbol<input value={form.symbol} onChange={e=>set('symbol',e.target.value)} placeholder="RELIANCE.NS"/></label>
      <label>ISIN<input value={form.isin} onChange={e=>set('isin',e.target.value)} placeholder="INE002A01018"/></label>
      <label>Owner
        <select value={form.ownerId} onChange={e=>set('ownerId',e.target.value)}>
          {family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <hr className="formDivider"/>
      <label>Quantity<input type="number" step="any" min="0" value={form.qty} onChange={e=>handleQtyPrice('qty',e.target.value)} placeholder="0"/></label>
      <label>Price per Unit<input type="number" step="any" min="0" value={form.price} onChange={e=>handleQtyPrice('price',e.target.value)} placeholder="0.00"/></label>
      <label>Total Amount *<input type="number" step="any" min="0" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="Auto-calculated from qty × price"/></label>
      <label>Currency
        <select value={form.currency} onChange={e=>set('currency',e.target.value)}>
          {['INR','USD','EUR','GBP','SGD','AED'].map(c=><option key={c}>{c}</option>)}
        </select>
      </label>
      <label style={{gridColumn:'1/-1'}}>Notes<input value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Optional…"/></label>
      <label className="checkbox-row">
        <input type="checkbox" checked={syncHoldings} onChange={e=>setSyncHoldings(e.target.checked)}/>
        <span>Sync to Portfolio (updates units & weighted average cost for BUY / SELL)</span>
      </label>
    </div>
  );
}

// ── Family ─────────────────────────────────────────────────────────────────────
function Family({ vault, save }) {
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Father');
  const [confirmDel, setConfirmDel] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRel, setEditRel] = useState('Father');

  const add = () => {
    if (!name.trim()) return;
    save({
      ...vault,
      family: [...vault.family, { id: uid(), name: name.trim(), relation: rel }]
    });
    setName('');
  };

  const remove = id => {
    save({ ...vault, family: vault.family.filter(f => f.id !== id) });
    setConfirmDel(null);
    if (editTarget === id) setEditTarget(null);
  };

  const startEdit = f => {
    setEditTarget(f.id);
    setEditName(f.name);
    setEditRel(FAMILY_RELATIONS.includes(f.relation) ? f.relation : 'Father');
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    save({
      ...vault,
      family: vault.family.map(f => f.id === editTarget ? { ...f, name: editName.trim(), relation: editRel } : f)
    });
    setEditTarget(null);
  };

  return (<>
    <Header label="Family" title="Family Vault" sub="Track assets and transactions per family member">
      <div className="pill"><Users size={12}/> {vault.family.length} members</div>
    </Header>
    <div className="grid2">
      <div className="panel">
        <div className="panelHead"><h3>Add Member</h3><Users size={16}/></div>
        <div className="formGrid">
          <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Ramesh"/></label>
          <label>Relation
            <select value={rel} onChange={e=>setRel(e.target.value)}>
              {FAMILY_RELATIONS.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <button className="primary" onClick={add}><Plus size={15}/> Add Member</button>
      </div>
      <div className="panel">
        <div className="panelHead"><h3>Members</h3></div>
        {vault.family.map(f=>(
          <div className="member" key={f.id}>
            <div className="avatar">{f.name[0]}</div>
            {editTarget === f.id ? (
              <div style={{display:'flex',gap:8,alignItems:'center',flex:1,flexWrap:'wrap'}}>
                <input
                  value={editName}
                  onChange={e=>setEditName(e.target.value)}
                  placeholder="Name"
                  style={{padding:'5px 10px',fontSize:13,flex:1,minWidth:120}}
                />
                <select
                  value={editRel}
                  onChange={e=>setEditRel(e.target.value)}
                  style={{padding:'5px 10px',fontSize:13}}
                >
                  {FAMILY_RELATIONS.map(x=><option key={x} value={x}>{x}</option>)}
                </select>
                <button className="btn-confirm-yes" onClick={saveEdit}>Save</button>
                <button className="btn-confirm-no" onClick={()=>setEditTarget(null)}>Cancel</button>
              </div>
            ) : (
              <>
                <div>
                  <b>{f.name}</b>
                  <small style={{color:'var(--cyan)',fontWeight:500}}>{f.relation}</small>
                </div>
                <span>{vault.holdings.filter(h=>h.ownerId===f.id && (Number(h.qty)||0) > 0).length} assets</span>
                {f.relation !== 'Self' && (
                  <div className="row-actions" style={{marginLeft:8}}>
                    <button className="btn-icon" title="Edit member" onClick={()=>startEdit(f)}><Pencil size={13}/></button>
                    {confirmDel === f.id ? (
                      <div className="confirm-inline">
                        <button className="btn-confirm-yes" onClick={()=>remove(f.id)}>Delete</button>
                        <button className="btn-confirm-no" onClick={()=>setConfirmDel(null)}>No</button>
                      </div>
                    ) : (
                      <button className="btn-icon danger" title="Delete member" onClick={()=>setConfirmDel(f.id)}><Trash2 size={13}/></button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  </>);
}

// ── AI helpers (Refined reconciliation with strict ISIN & MF Folio isolation) ──
function ownerFor(vault, h) {
  const hint = norm(h.ownerHint);
  if (!hint) return vault.family[0]?.id;

  const direct = vault.family.find(f => norm(f.name) === hint || norm(f.relation) === hint);
  if (direct) return direct.id;

  const isFather  = /father|dad|papa|appa|pitaji/i.test(hint);
  const isMother  = /mother|mom|mum|mummy|amma|mataji/i.test(hint);
  const isSister  = /sister|sis/i.test(hint);
  const isBrother = /brother|bro/i.test(hint);
  const isSpouse  = /spouse|wife|husband|patni|pati/i.test(hint);
  const isChild   = /child|son|daughter|kid|beta|beti/i.test(hint);

  const match = vault.family.find(f => {
    const rel = norm(f.relation);
    if (isFather  && rel === 'father')  return true;
    if (isMother  && rel === 'mother')  return true;
    if (isSister  && rel === 'sister')  return true;
    if (isBrother && rel === 'brother') return true;
    if (isSpouse  && rel === 'spouse')  return true;
    if (isChild   && rel === 'child')   return true;
    return false;
  });
  return match?.id || vault.family[0]?.id;
}

// Strict ISIN precedence, falling back to folio number plus scheme name for mutual funds
function matchHolding(vault, h) {
  const isMF = (h.type === 'Mutual Fund') || (classify(h.name) === 'Mutual Fund');
  const hFolio = norm(h.folio || '');
  const hIsin = norm(h.isin || '');
  const hName = norm(h.name || '');
  const hSym = norm(h.symbol || '');

  if (isMF) {
    // 1. Strict precedence on ISIN, isolating distinct folios
    if (hIsin) {
      const match = vault.holdings.find(x => {
        if (norm(x.isin) !== hIsin) return false;
        const xFolio = norm(x.folio || '');
        if (hFolio && xFolio && hFolio !== xFolio) return false;
        return true;
      });
      if (match) return match;
    }
    // 2. Fallback to folio number + scheme name for mutual funds
    if (hFolio && hName) {
      const match = vault.holdings.find(x => {
        const xFolio = norm(x.folio || '');
        const xName = norm(x.name || '');
        return xFolio === hFolio && (xName.includes(hName) || hName.includes(xName));
      });
      if (match) return match;
    }
  } else {
    // Stocks / ETFs / Bonds / others: Strict precedence on ISIN > symbol > name
    if (hIsin) {
      const match = vault.holdings.find(x => norm(x.isin) === hIsin);
      if (match) return match;
    }
    if (hSym) {
      const match = vault.holdings.find(x => norm(x.symbol) === hSym);
      if (match) return match;
    }
  }

  // Name match as last resort
  if (hName) {
    const match = vault.holdings.find(x => norm(x.name) === hName);
    if (match) return match;
  }
  return null;
}

function normalizeAI(result,vault){
  const rawHoldings=Array.isArray(result?.holdings)?result.holdings:[];
  const rawTransactions=Array.isArray(result?.transactions)?result.transactions:[];
  const documentType=result?.documentType||'Unknown';
  const isSnapshotDocument=/cas|portfolio|holding|demat|custody|mutual.?fund.?statement|statement/i.test(documentType);
  const holdings=rawHoldings.map(h=>{
    const existing=matchHolding(vault,h);
    const quantity=round4(h.quantity??h.qty??0);
    let marketValue=h.marketValue!=null?round2(h.marketValue):null;
    let currentPrice=h.currentPrice!=null?round4(h.currentPrice):null;
    if(currentPrice==null&&marketValue!=null&&quantity>0)currentPrice=round4(marketValue/quantity);
    let avgCost=h.avgCost!=null?round4(h.avgCost):null;
    if(avgCost==null&&h.costValue!=null&&quantity>0)avgCost=round4(Number(h.costValue)/quantity);
    const positionState=h.positionState||(h.status==='ZERO'?'ZERO':quantity>0?'ACTIVE':'UNKNOWN');
    const snapshot=Boolean(h.snapshot)||quantity>0||(isSnapshotDocument&&positionState!=='ZERO');
    return{
      existing,
      name:h.name||existing?.name||h.isin||h.symbol||'Unknown',
      symbol:h.symbol||existing?.symbol||'',
      isin:h.isin||existing?.isin||'',
      folio:h.folio||existing?.folio||'',
      type:h.type||existing?.type||classify(h.name),
      quantity,avgCost,currentPrice,marketValue,costValue:h.costValue!=null?round2(h.costValue):null,
      ownerId:existing?.ownerId||ownerFor(vault,h),
      positionState,snapshot,evidence:h.evidence||'',
      confidence:Number(h.confidence??result?.confidence??0)
    };
  });
  const transactions=rawTransactions.map(t=>({
    ...t,
    quantity:round4(t.quantity??t.qty??0),
    amount:t.amount==null?0:round2(t.amount),
    price:t.price==null?null:round4(t.price),
    confidence:Number(t.confidence??result?.confidence??0)
  }));
  return{
    documentType,provider:result?.provider||'Unknown',accountHolder:result?.accountHolder||'',
    asOfDate:result?.asOfDate||null,currency:result?.currency||'INR',
    confidence:Number(result?.confidence??0),warnings:Array.isArray(result?.warnings)?result.warnings:[],
    holdings,transactions
  };
}

function reconcile(vault,parsed){
  let holdings=vault.holdings.map(x=>({...x}));
  let tx=vault.transactions.slice();
  const changes=[],skipped=[];
  const documentConfidence=Number(parsed.confidence||0);
  const isSnapshotDocument=/cas|portfolio|holding|demat|custody|mutual.?fund.?statement|statement/i.test(parsed.documentType||'');

  parsed.holdings.forEach(h=>{
    const itemConfidence=Number(h.confidence??documentConfidence);
    const name=h.name||h.symbol||h.isin||'Unknown security';
    if(itemConfidence<0.60){skipped.push(`${name} — confidence ${(itemConfidence*100).toFixed(0)}%`);return;}
    if(!h.name&&!h.symbol&&!h.isin){skipped.push('Unknown security — no name, symbol or ISIN');return;}
    const quantity=round4(h.quantity||0);
    const isExplicitZero=h.positionState==='ZERO';
    const isSnapshot=Boolean(h.snapshot)||quantity>0||isExplicitZero||isSnapshotDocument;
    if(!isSnapshot)return;

    let index = -1;
    const isMF = (h.type === 'Mutual Fund') || (classify(h.name) === 'Mutual Fund');
    const hFolio = norm(h.folio || '');
    const hIsin = norm(h.isin || '');
    const hName = norm(h.name || '');

    if (isMF) {
      // 1. Strict precedence on ISIN (respecting folio isolation)
      if (hIsin) {
        index = holdings.findIndex(x => {
          if (norm(x.isin) !== hIsin) return false;
          const xFolio = norm(x.folio || '');
          if (hFolio && xFolio && hFolio !== xFolio) return false;
          return true;
        });
      }
      // 2. Fallback to folio number + scheme name
      if (index < 0 && hFolio && hName) {
        index = holdings.findIndex(x => {
          const xFolio = norm(x.folio || '');
          const xName = norm(x.name || '');
          return xFolio === hFolio && (xName.includes(hName) || hName.includes(xName));
        });
      }
    } else {
      // Strict precedence on ISIN > symbol > name
      if (hIsin) index = holdings.findIndex(x => norm(x.isin) === hIsin);
      if (index < 0 && h.symbol) index = holdings.findIndex(x => norm(x.symbol) === norm(h.symbol));
    }

    if (index < 0 && hName) index = holdings.findIndex(x => norm(x.name) === hName);
    if (index < 0 && h.existing?.id) index = holdings.findIndex(x => x.id === h.existing.id);

    const before=index>=0?holdings[index]:null;
    const ownerId=before?.ownerId||ownerFor(vault,h);

    let current = h.currentPrice!=null?round4(h.currentPrice):null;
    if(current==null&&h.marketValue!=null&&quantity>0)current=round4(Number(h.marketValue)/quantity);
    if(current==null)current=before?.current||0;

    let avg = h.avgCost!=null?round4(h.avgCost):null;
    if(avg==null&&h.costValue!=null&&quantity>0)avg=round4(Number(h.costValue)/quantity);
    if(avg==null)avg=before?.avg||0;

    const next={
      id:before?.id||uid(),
      name:h.name||before?.name||h.symbol||h.isin,
      symbol:h.symbol||before?.symbol||'',
      isin:h.isin||before?.isin||'',
      folio:h.folio||before?.folio||'',
      type:h.type||before?.type||classify(h.name),
      ownerId,
      qty:isExplicitZero?0:quantity,
      avg,
      current,
      currency:h.currency||parsed.currency||before?.currency||'INR',
      source:'ai-import',
      sourceDate:parsed.asOfDate||null,
      lastEvidence:h.evidence||'',
      lastConfidence:itemConfidence,
      lastDocumentType:parsed.documentType,
      lastUpdatedAt:new Date().toISOString()
    };

    if (isExplicitZero || quantity <= 0) {
      if (index >= 0) {
        const removed = holdings.splice(index, 1)[0];
        changes.push({ kind: 'removed', text: `Closed / Exited ${removed.name || next.name}`, detail: `Position fully sold / 0 units`, evidence: h.evidence || '' });
      }
      return;
    }

    if(index<0){
      holdings.push(next);
      changes.push({kind:'added',text:`Added ${next.name}`,detail:`${next.qty} ${next.type}${next.current?` · ${money(next.current,next.currency)}`:''}`,evidence:h.evidence||''});
      return;
    }

    const differences=[];
    if(Number(before.qty||0)!==Number(next.qty||0))differences.push(`qty ${before.qty||0}→${next.qty||0}`);
    if(Number(before.current||0)!==Number(next.current||0))differences.push(`price ${before.current||0}→${next.current||0}`);
    if(Number(before.avg||0)!==Number(next.avg||0))differences.push(`avg ${before.avg||0}→${next.avg||0}`);
    holdings[index]={...before,...next};
    if(differences.length)changes.push({kind:'updated',text:`Updated ${next.name}`,detail:differences.join(' · '),evidence:h.evidence||''});
  });

  const transactionDocument=/p&l|pnl|ledger|contract|trade|transaction|activity|capital.?gain|broker/i.test(parsed.documentType||'');
  if(transactionDocument||parsed.transactions.length){
    parsed.transactions.forEach(t=>{
      const confidence=Number(t.confidence??documentConfidence);
      if(confidence<0.60){skipped.push(`${t.name||t.symbol||'Transaction'} — low confidence`);return;}
      if(!t.name&&!t.symbol&&!t.isin)return;
      const holding=matchHolding({holdings},t);
      const asset=holding?.name||t.name||t.symbol||t.isin;
      const importKey=[t.date||'',t.type||'OTHER',norm(t.isin||t.symbol||asset),t.quantity||0,t.price??'',t.amount??''].join('|');
      if(tx.some(x=>x.importKey===importKey))return;
      const ownerId=holding?.ownerId||ownerFor({family:vault.family},t);
      tx.push({
        id:uid(),date:t.date||parsed.asOfDate||new Date().toISOString().slice(0,10),
        type:t.type||'OTHER',asset,
        qty:round4(t.quantity||0),
        price:t.price==null?null:round4(t.price),
        amount:t.amount==null?0:round2(t.amount),
        currency:t.currency||parsed.currency||'INR',
        ownerId,ownerName:vault.family.find(f=>f.id===ownerId)?.name||'Self',
        source:'ai-import',importKey,evidence:t.evidence||'',confidence
      });
      changes.push({kind:'transaction',text:`Imported ${t.type||'event'} · ${asset}`,detail:t.quantity?`${t.quantity} units${t.price!=null?` @ ${t.price}`:''}`:(t.amount?money(t.amount,t.currency||parsed.currency):''),evidence:t.evidence||''});
    });
  }
  return{...vault,holdings: holdings.filter(h => (Number(h.qty) || 0) > 0),transactions:tx,importLog:[...(vault.importLog||[]),{id:uid(),at:new Date().toISOString(),documentType:parsed.documentType,provider:parsed.provider,confidence:documentConfidence,changes,skipped,warnings:parsed.warnings||[]}],_changes:changes,_skipped:skipped};
}

// ── Documents ──────────────────────────────────────────────────────────────────
function Documents({vault,save,password}){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[logs,setLogs]=useState([]),[drag,setDrag]=useState(false);
  const [confirmDelDoc, setConfirmDelDoc] = useState(null);

  const downloadDoc = async d => {
    try {
      const res = await window.vaultAPI.openEncryptedFile({ password, id: d.id });
      if (res?.ok && res.data) {
        const byteCharacters = atob(res.data);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteNumbers]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Could not decrypt document: ' + (res?.error || 'File may have expired or was removed.'));
      }
    } catch (err) {
      alert('Download error: ' + err.message);
    }
  };

  const deleteDoc = async id => {
    try {
      if (window.vaultAPI?.deleteEncryptedFile) {
        await window.vaultAPI.deleteEncryptedFile({ id });
      }
      const nextDocs = vault.documents.filter(d => d.id !== id);
      await save({ ...vault, documents: nextDocs });
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDelDoc(null);
    }
  };

  const processFiles=async files=>{
    const usable=files.filter(f=>f?.path).map(f=>({path:f.path,name:f.name||f.path.split(/[\\\/]/).pop(),size:f.size||0}));
    if(!usable.length)return;
    setBusy(true);setLogs([]);let next=vault,docs=[...vault.documents],logsNow=[];
    for(let i=0;i<usable.length;i++){
      const f=usable[i];setStatus(`Analyzing ${i+1} of ${usable.length} · ${f.name}`);
      let ai=null,engine='',warnings=[],changes=[],skipped=[];
      const raw=await window.vaultAPI.analyzeFile({filePath:f.path,name:f.name});
      if(raw.ok){
        const provider=next.settings.aiProvider||'gemini';
        const r=await window.vaultAPI.analyzeWithAI({provider,geminiApiKey:next.settings.geminiApiKey,geminiModel:next.settings.geminiModel,ollamaUrl:next.settings.ollamaUrl,ollamaModel:next.settings.ollamaModel,doc:raw,context:{family:next.family,holdings:next.holdings.map(h=>({name:h.name,symbol:h.symbol,isin:h.isin,folio:h.folio,type:h.type,qty:h.qty,avg:h.avg,current:h.current,currency:h.currency}))}});
        if(r.ok){ai=normalizeAI(r.result,next);engine=r.engine;const reconciled=reconcile(next,ai);next={...reconciled};changes=next._changes||[];skipped=next._skipped||[];delete next._changes;delete next._skipped;warnings=[...(ai.warnings||[])];}
        else warnings.push(r.error||'AI analysis failed.');
      }else warnings.push(raw.error||'Could not read file.');
      const id=uid();const bytes=await window.vaultAPI.readBytes(f.path);
      const stored=bytes.ok&&await window.vaultAPI.saveEncryptedFile({password,id,name:f.name,mime:raw.mime||'application/octet-stream',buffer:base64Bytes(bytes.data)});
      if(!stored?.ok)warnings.push('Original file could not be encrypted/stored.');
      const addedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
      docs.push({
        id,
        name: f.name,
        size: f.size,
        addedAt,
        expiresAt,
        analyzed: !!ai,
        engine,
        documentType: ai?.documentType || 'Unknown',
        provider: ai?.provider || 'Unknown',
        confidence: ai?.confidence || 0,
        detectedChanges: changes.length,
        warnings,
        skipped
      });
      logsNow.push({name:f.name,engine,type:ai?.documentType||'Unknown',provider:ai?.provider||'Unknown',confidence:ai?.confidence||0,changes,warnings,skipped,accountHolder:ai?.accountHolder||'',asOfDate:ai?.asOfDate||null});
      next={...next,documents:docs};
    }

    const { active, expiredIds } = filterActiveDocuments(docs);
    if (expiredIds.length > 0 && window.vaultAPI?.purgeExpiredFiles) {
      window.vaultAPI.purgeExpiredFiles({ ids: expiredIds }).catch(() => {});
    }
    next = { ...next, documents: active };

    await save(next);setLogs(logsNow);setBusy(false);setStatus(`Finished · ${logsNow.reduce((n,x)=>n+x.changes.length,0)} portfolio changes applied`);
  };
  const choose=async()=>{const picked=await window.vaultAPI.pickFiles();if(picked.ok)processFiles(picked.files);};
  const onDrop=e=>{e.preventDefault();setDrag(false);if(busy)return;processFiles([...e.dataTransfer.files]);};
  return(<>
    <Header label="Documents" title="AI Document Import" sub="Drop any financial statement — Gemini extracts, reconciles and stores encrypted locally.">
      <button className="primary" disabled={busy} onClick={choose}>{busy?<RefreshCw className="spin" size={15}/>:<Upload size={15}/>}{busy?'Processing…':'Upload Files'}</button>
    </Header>
    <div className={`aiDrop${drag?' dragging':''}`} onDragEnter={e=>{e.preventDefault();setDrag(true);}} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={busy?undefined:choose}>
      <div className="aiDropContent">
        <div className="dropGlow"><BrainCircuit size={32}/></div>
        <div className="dropTitle">Drop CAS, P&L, statements or broker files</div>
        <div className="dropSub">Groww · CDSL · NSDL · INDmoney · Indian/US brokers · MF · FD · bonds</div>
        <div className="dropFormats">PDF · scanned PDF · XLSX · XLS · CSV · images · TXT · JSON</div>
        <div className="dropFlow"><span>ORIGINAL FILE</span><i>→</i><span>GEMINI EXTRACTION</span><i>→</i><span>RECONCILE</span><i>→</i><span>ENCRYPT 7-DAY VAULT</span></div>
      </div>
    </div>
    {busy&&<div className="importProgress"><div className="progressHead"><span><Sparkles size={13}/> {status}</span><span>Gemini-powered</span></div><div className="progressTrack"><i/></div></div>}
    {status&&!busy&&<div className="success"><CheckCircle2 size={14}/> {status}</div>}
    {logs.length>0&&<div className="panel importPanel">
      <div className="panelHead"><div><h3>Latest Import Run</h3><span>Every change came from document evidence.</span></div><Bot size={17}/></div>
      {logs.map((x,i)=>(
        <div className="importCard" key={i}>
          <div className="importIcon"><FileLock2 size={17}/></div>
          <div className="importBody">
            <div className="importTitle"><b>{x.name}</b><span className="tag secure"><Sparkles size={10}/> {x.engine||'AI'}</span></div>
            <div className="importMeta">{x.type} · {x.provider} · {x.asOfDate||'date not stated'} · {(x.confidence*100).toFixed(0)}% confidence</div>
            {x.accountHolder&&<div className="importMeta">Account: {x.accountHolder}</div>}
            {x.changes.slice(0,7).map((c,j)=><div className="changeLine" key={j}><CheckCircle2 size={11}/><b>{c.text}</b><span>{c.detail}</span></div>)}
            {x.skipped.map((c,j)=><div className="changeLine skipped" key={`s${j}`}><AlertTriangle size={11}/><b>Skipped</b><span>{c}</span></div>)}
            {x.warnings.slice(0,3).map((w,j)=><div className="changeLine warning" key={`w${j}`}><AlertTriangle size={11}/><span>{w}</span></div>)}
          </div>
          <div className="importState">{x.warnings.length?<AlertTriangle size={15}/>:<CheckCircle2 size={15}/>}<small>{x.warnings.length?'Review':'Applied'}</small></div>
        </div>
      ))}
    </div>}
    <div className="panel tablePanel">
      <div className="docTableHead">
        <div>
          <h3>Encrypted Document Vault</h3>
          <span>{vault.documents.length} files stored locally · 7-day automatic retention policy</span>
        </div>
        <span className="tag secure"><LockKeyhole size={10}/> AES-256-GCM · 7-Day Auto-Purge</span>
      </div>
      <table>
        <thead><tr><th>Document</th><th>Detected Type</th><th>Engine</th><th>Confidence</th><th>Added</th><th>Retention</th><th></th></tr></thead>
        <tbody>{vault.documents.map(d=>{
          const expTime = d.expiresAt ? new Date(d.expiresAt).getTime() : (new Date(d.addedAt).getTime() + SEVEN_DAYS_MS);
          const daysLeft = Math.max(0, Math.ceil((expTime - Date.now()) / (24 * 60 * 60 * 1000)));
          return (
            <tr key={d.id}>
              <td><b>{d.name}</b><small>{(Number(d.size||0)/1024/1024).toFixed(2)} MB</small></td>
              <td>{d.documentType} · {d.provider||'Unknown'}</td>
              <td>{d.analyzed?<span className="tag secure"><Sparkles size={10}/> {d.engine}</span>:<span className="tag">Stored</span>}</td>
              <td>{d.analyzed?`${(d.confidence*100).toFixed(0)}%`:'—'}</td>
              <td>{new Date(d.addedAt).toLocaleDateString('en-IN')}</td>
              <td>
                <span className={`tag ${daysLeft <= 1 ? 'danger' : daysLeft <= 3 ? 'warning' : 'secure'}`} style={{display:'inline-flex',alignItems:'center',gap:4}}>
                  <Clock size={11} /> {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                </span>
              </td>
              <td>
                {confirmDelDoc === d.id ? (
                  <div className="confirm-inline">
                    <span>Delete?</span>
                    <button className="btn-confirm-yes" onClick={() => deleteDoc(d.id)}>Yes</button>
                    <button className="btn-confirm-no" onClick={() => setConfirmDelDoc(null)}>No</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button className="btn-icon" title="Download decrypted copy" onClick={() => downloadDoc(d)}><Download size={13}/></button>
                    <button className="btn-icon danger" title="Delete file now" onClick={() => setConfirmDelDoc(d.id)}><Trash2 size={13}/></button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      {!vault.documents.length&&<Empty text="No documents in vault. Uploaded statements are kept for 7 days for verification, then automatically purged."/>}
    </div>
  </>);
}

// ── AI Analyst ─────────────────────────────────────────────────────────────────
function AI({vault, rates}){
  const [q,setQ]=useState(''),[a,setA]=useState('');
  const ask=()=>{
    const t=totals(vault, rates, 'INR'),s=q.toLowerCase();
    if(s.includes('worth')||s.includes('value'))setA(`Recorded portfolio value is ${money(t.value, 'INR')} across ${vault.holdings.length} positions (normalized to INR).`);
    else if(s.includes('profit')||s.includes('return')||s.includes('gain'))setA(`Unrealised P/L is ${money(t.gain, 'INR')} (${t.cost?(t.gain/t.cost*100).toFixed(2):0}% return on ${money(t.cost, 'INR')} invested).`);
    else if(s.includes('family'))setA(`The vault has ${vault.family.length} family members with ${vault.holdings.length} holdings tracked.`);
    else if(s.includes('invest'))setA(`Total invested across all positions: ${money(t.cost, 'INR')}.`);
    else setA('Ask about portfolio value, return, holdings, allocation, or family ownership. Document-level AI analysis runs in the Documents section.');
  };
  return(<>
    <Header label="Analyst" title="AI Analyst" sub="Local portfolio analysis — no data leaves your device">
      <div className="pill"><Bot size={12}/> Private</div>
    </Header>
    <div className="aiHero">
      <div className="aiOrb"><Bot size={32}/></div>
      <div><h3>Baba Wealth Analyst</h3><p>Uploads use Ollama locally or Gemini when configured. Original documents stay encrypted on your device.</p></div>
    </div>
    <div className="panel">
      <div className="search aiSearch">
        <Bot size={16}/>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="What is my portfolio worth? What is my return? …"/>
        <button className="primary" onClick={ask}>Ask</button>
      </div>
      {a&&<div className="answer"><Sparkles size={16}/><p>{a}</p></div>}
    </div>
  </>);
}

// ── Asset Visibility Modal ──────────────────────────────────────────────────
function AssetVisibilityModal({ vault, hiddenAssets, rates, onSave, onClose }) {
  const [selectedIds, setSelectedIds] = useState(new Set(hiddenAssets || []));
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');

  const activeHoldings = useMemo(() =>
    vault.holdings.filter(h => (Number(h.qty) || 0) > 0),
    [vault.holdings]
  );

  const availableTypes = useMemo(() => {
    const types = new Set(activeHoldings.map(h => h.type || 'Other'));
    return ['All', ...Array.from(types)];
  }, [activeHoldings]);

  const filteredHoldings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeHoldings.filter(h => {
      const isHidden = selectedIds.has(h.id);
      if (statusFilter === 'hidden' && !isHidden) return false;
      if (statusFilter === 'visible' && isHidden) return false;
      if (typeFilter !== 'All' && h.type !== typeFilter) return false;
      if (q) {
        const text = `${h.name} ${h.symbol || ''} ${h.isin || ''} ${h.folio || ''} ${h.type || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [activeHoldings, selectedIds, search, typeFilter, statusFilter]);

  const toggleAsset = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unhideAll = () => setSelectedIds(new Set());
  const hideAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredHoldings.forEach(h => next.add(h.id));
      return next;
    });
  };

  const excludedStats = useMemo(() => {
    let value = 0;
    let cost = 0;
    activeHoldings.forEach(h => {
      if (selectedIds.has(h.id)) {
        const q = Number(h.qty) || 0;
        const curV = mulMoney(q, h.current);
        const costV = mulMoney(q, h.avg);
        value = addMoney(value, toBase(curV, h.currency || 'INR', rates, 'INR'));
        cost = addMoney(cost, toBase(costV, h.currency || 'INR', rates, 'INR'));
      }
    });
    return { value, cost, count: selectedIds.size };
  }, [activeHoldings, selectedIds, rates]);

  return (
    <div className="modalBack" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal asset-visibility-modal">
        <div className="modalHead">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div className="modal-icon-badge"><EyeOff size={18}/></div>
            <div>
              <h3 style={{margin:0}}>Manage Asset Visibility</h3>
              <small style={{color:'var(--muted)',fontSize:12}}>Check an asset to hide it from Dashboard and Portfolio totals</small>
            </div>
          </div>
          <button onClick={onClose}><X size={18}/></button>
        </div>

        {/* Toolbar */}
        <div className="av-toolbar">
          <div className="search av-search">
            <Search size={14}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, symbol, ISIN, folio..."
            />
            {search && (
              <button className="clear-btn" onClick={() => setSearch('')}>
                <X size={12}/>
              </button>
            )}
          </div>
          <select
            className="filterSelect"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            {availableTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
          </select>
          <select
            className="filterSelect"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="hidden">Hidden ({selectedIds.size})</option>
            <option value="visible">Visible ({activeHoldings.length - selectedIds.size})</option>
          </select>
        </div>

        {/* Action bar */}
        <div className="av-actions-row">
          <span className="av-count-info">
            Showing <b>{filteredHoldings.length}</b> of <b>{activeHoldings.length}</b> assets · <b style={{color: selectedIds.size > 0 ? 'var(--amber)' : 'var(--muted)'}}>{selectedIds.size} Hidden</b>
          </span>
          <div style={{display:'flex',gap:8}}>
            {selectedIds.size > 0 && (
              <button className="ghost av-action-btn" onClick={unhideAll}>
                <Eye size={12}/> Unhide All
              </button>
            )}
            <button className="ghost av-action-btn" onClick={hideAllFiltered}>
              <EyeOff size={12}/> Hide Filtered
            </button>
          </div>
        </div>

        {/* Asset list */}
        <div className="av-list">
          {filteredHoldings.length === 0 ? (
            <div className="av-empty">
              <EyeOff size={28} style={{color:'var(--muted)',opacity:0.5}}/>
              <p>No assets found matching current filters.</p>
            </div>
          ) : (
            filteredHoldings.map(h => {
              const isHidden = selectedIds.has(h.id);
              const q = Number(h.qty) || 0;
              const curVal = mulMoney(q, h.current);
              const owner = vault.family?.find(f => f.id === h.ownerId)?.name || 'Self';
              const isForeign = h.currency && h.currency !== 'INR';

              return (
                <div
                  key={h.id}
                  className={`av-item ${isHidden ? 'is-hidden' : 'is-visible'}`}
                  onClick={() => toggleAsset(h.id)}
                >
                  <div className="av-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={isHidden}
                      onChange={() => {}}
                      className="av-checkbox"
                    />
                  </div>

                  <div className="av-item-info">
                    <div className="av-item-title-row">
                      <b className="av-item-name">{h.name}</b>
                      <span className="av-badge-type">{h.type}</span>
                      {h.isSip && <span className="sip-badge" style={{margin:0,padding:'1px 6px',fontSize:10}}>SIP</span>}
                      {(h.type === 'Bond' || h.type === 'FD') && Number(h.interestRate) > 0 && (
                        <span className="bond-badge" style={{margin:0,padding:'1px 6px',fontSize:10}}>
                          {h.interestRate}%
                        </span>
                      )}
                    </div>
                    <div className="av-item-meta">
                      <span>{h.symbol || h.isin || 'Manual'}</span>
                      {h.folio && <span>· Folio: {h.folio}</span>}
                      <span>· {owner}</span>
                      <span>· Qty: {Number(h.qty).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="av-item-val">
                    <strong>{money(curVal, h.currency)}</strong>
                    {isForeign && (
                      <small style={{color:'var(--muted)',fontSize:11}}>
                        ≈ {money(toBase(curVal, h.currency, rates, 'INR'), 'INR')}
                      </small>
                    )}
                  </div>

                  <div className="av-item-status">
                    {isHidden ? (
                      <span className="av-status-tag hidden" title="Currently hidden — click to unhide">
                        <EyeOff size={11}/> Hidden
                      </span>
                    ) : (
                      <span className="av-status-tag visible" title="Currently visible — click to hide">
                        <Eye size={11}/> Visible
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="av-footer">
          <div className="av-footer-stats">
            {selectedIds.size > 0 ? (
              <span>
                <AlertTriangle size={13} style={{color:'var(--amber)',verticalAlign:'middle',marginRight:4}}/>
                <b>{selectedIds.size}</b> hidden · Excluded value: <b>{money(excludedStats.value, 'INR')}</b>
              </span>
            ) : (
              <span style={{color:'var(--muted)'}}>
                All {activeHoldings.length} assets are currently visible in Portfolio and Dashboard.
              </span>
            )}
          </div>
          <div className="av-footer-actions">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button
              className="primary"
              onClick={() => onSave(Array.from(selectedIds))}
            >
              <CheckCircle2 size={14}/> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────
function SettingsPage({vault,save,password,rates,setVault}){
  const [s,setS]=useState(vault.settings||{}),[msg,setMsg]=useState(''),[isError,setIsError]=useState(false);
  const [busy, setBusy] = useState(false);
  const [importPending, setImportPending] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const set=(k,v)=>setS(x=>({...x,[k]:v}));

  const handleExport = async () => {
    setBusy(true);
    setIsError(false);
    setMsg('Exporting encrypted backup…');
    try {
      const r = await window.vaultAPI.exportBackup(password);
      setBusy(false);
      if (r.cancelled) {
        setMsg('Backup export cancelled.');
        setIsError(false);
      } else if (r.ok) {
        setMsg(`Backup saved successfully: ${r.filename || r.path}`);
        setIsError(false);
      } else {
        setMsg(`Export failed: ${r.error || 'Unknown error'}`);
        setIsError(true);
      }
    } catch (e) {
      setBusy(false);
      setMsg(`Export error: ${e.message}`);
      setIsError(true);
    }
  };

  const handleImportClick = async () => {
    setIsError(false);
    try {
      const r = await window.vaultAPI.importBackup(password);
      if (r.cancelled) return;
      if (!r.ok) {
        setMsg(`Import failed: ${r.error}`);
        setIsError(true);
        return;
      }
      setImportPending(r);
    } catch (e) {
      setMsg(`Import error: ${e.message}`);
      setIsError(true);
    }
  };

  const executeRestore = async (mode) => {
    if (!importPending) return;
    setBusy(true);
    setIsError(false);
    setMsg(mode === 'merge' ? 'Merging backup into active portfolio…' : 'Restoring complete vault…');
    try {
      const restored = await window.vaultAPI.restoreVaultFile({
        filePath: importPending.filePath,
        password,
        vault: importPending.vault,
        mode
      });
      setBusy(false);
      if (restored.ok) {
        const migrated = migrate(restored.vault);
        if (setVault) setVault(migrated);
        setImportPending(null);
        setMsg(mode === 'merge'
          ? 'Backup merged successfully! Added any missing items.'
          : 'Vault restored completely from backup file.');
        setIsError(false);
      } else {
        setMsg(`Restore failed: ${restored.error}`);
        setIsError(true);
      }
    } catch (e) {
      setBusy(false);
      setMsg(`Restore error: ${e.message}`);
      setIsError(true);
    }
  };

  return(<>
    <Header label="Configuration" title="Settings" sub="AI engine, security options, and offline encrypted backups">
      <div style={{display:'flex',gap:8}}>
        <button className="primary" onClick={handleExport} disabled={busy}><Download size={15}/> Export Backup</button>
        <button className="secondary" onClick={handleImportClick} disabled={busy}><Upload size={15}/> Import Backup</button>
      </div>
    </Header>

    {msg && (
      <div className={isError ? 'error' : 'success'} style={{marginBottom:14}}>
        {isError ? <AlertTriangle size={14}/> : <CheckCircle2 size={14}/>} {msg}
      </div>
    )}

    {importPending && (
      <div className="panel" style={{marginBottom:18,borderColor:'var(--cyan)',background:'rgba(0,200,224,0.04)'}}>
        <div className="panelHead">
          <h3>Import Options — {importPending.filename}</h3>
          <X size={16} style={{cursor:'pointer'}} onClick={()=>setImportPending(null)}/>
        </div>
        <p style={{color:'var(--muted)',fontSize:13,margin:'6px 0 14px'}}>
          Choose how you would like to import <b>{importPending.filename}</b>:
        </p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button className="primary" onClick={()=>executeRestore('merge')} disabled={busy}>
            <ArrowRight size={14}/> Merge Data (Keep Existing + Add New)
          </button>
          <button className="secondary" onClick={()=>executeRestore('replace')} disabled={busy} style={{borderColor:'var(--amber)',color:'var(--amber)'}}>
            <RefreshCw size={14}/> Full Restore (Replace All Data)
          </button>
          <button className="ghost" onClick={()=>setImportPending(null)}>Cancel</button>
        </div>
      </div>
    )}

    <div className="grid2">
      <div className="panel">
        <div className="panelHead"><h3>AI Engine</h3><Bot size={16}/></div>
        <label>Upload AI provider<select value={s.aiProvider} onChange={e=>set('aiProvider',e.target.value)}><option value="auto">Auto: Local → Gemini</option><option value="local">Local Ollama only</option><option value="gemini">Gemini only</option></select></label>
        <label>Ollama URL<input value={s.ollamaUrl||''} onChange={e=>set('ollamaUrl',e.target.value)} placeholder="http://127.0.0.1:11434"/></label>
        <label>Local model<input value={s.ollamaModel||''} onChange={e=>set('ollamaModel',e.target.value)} placeholder="qwen2.5:3b"/></label>
        <p style={{color:'var(--muted)',fontSize:12,marginTop:10}}>Install Ollama and pull a small instruct model. Auto mode tries it before Gemini.</p>
      </div>
      <div className="panel">
        <div className="panelHead"><h3>Gemini API</h3><Bot size={16}/></div>
        <label>Gemini API key<input type="password" value={s.geminiApiKey||''} onChange={e=>set('geminiApiKey',e.target.value)} placeholder="AIza…"/></label>
        <label>Model<input value={s.geminiModel||''} onChange={e=>set('geminiModel',e.target.value)} placeholder="gemini-2.5-flash"/></label>
        <p style={{color:'var(--muted)',fontSize:12,marginTop:10}}>Key is stored inside your encrypted vault. Gemini receives the selected document only during analysis.</p>
      </div>
    </div>

    <div className="panel" style={{marginTop:18}}>
      <div className="panelHead">
        <div>
          <h3>Asset Visibility</h3>
          <span>Select individual assets to hide or unhide from Dashboard and Portfolio views</span>
        </div>
        <EyeOff size={16}/>
      </div>
      <p style={{color:'var(--muted)',fontSize:13,margin:'6px 0 16px',lineHeight:1.5}}>
        Hidden assets will not show up in your Dashboard or Portfolio, and their values are completely excluded from P&L, Total Invested, and Total Current Value. Background tracking (market prices, SIP schedules, and FD interest accrual) continues without interruption.
      </p>

      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <button
          className="secondary"
          onClick={() => setShowAssetModal(true)}
          style={{display:'flex',alignItems:'center',gap:8,padding:'9px 18px',fontWeight:600}}
        >
          <EyeOff size={15}/> Manage Hidden Assets
          {(s.hiddenAssets || []).length > 0 && (
            <span style={{
              background:'var(--amber)',
              color:'#000',
              padding:'1px 8px',
              borderRadius:10,
              fontSize:11,
              fontWeight:700,
              marginLeft:2
            }}>
              {(s.hiddenAssets || []).length} Hidden
            </span>
          )}
        </button>

        {(s.hiddenAssets || []).length > 0 ? (
          <>
            <button
              className="ghost"
              onClick={async () => {
                const next = { ...s, hiddenAssets: [] };
                setS(next);
                await save({ ...vault, settings: next });
                setMsg('All assets unhidden.');
                setIsError(false);
              }}
              style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}
            >
              <Eye size={14}/> Unhide All ({(s.hiddenAssets || []).length})
            </button>
            <span style={{fontSize:12.5,color:'var(--amber)',display:'flex',alignItems:'center',gap:5,marginLeft:4}}>
              <AlertTriangle size={13}/> {(s.hiddenAssets || []).length} asset{(s.hiddenAssets || []).length > 1 ? 's' : ''} currently excluded from totals
            </span>
          </>
        ) : (
          <span style={{fontSize:12.5,color:'var(--muted)',display:'flex',alignItems:'center',gap:5}}>
            <CheckCircle2 size={13} style={{color:'var(--cyan)'}}/> All assets currently visible
          </span>
        )}
      </div>
    </div>

    <button className="primary" style={{marginTop:16}} onClick={()=>{save({...vault,settings:s});setMsg('Settings saved.');setIsError(false);}}>Save Settings</button>

    <div className="panel" style={{marginTop:18}}>
      <div className="panelHead"><h3>Live Exchange Rates (Base: INR)</h3><CircleDollarSign size={16}/></div>
      {Object.entries(rates).filter(([k])=>k!=='INR').map(([cur, rate])=>(
        <div className="setting" key={cur}><b>1 {cur}</b><span>₹{Number(rate).toFixed(2)}</span></div>
      ))}
    </div>
    <div className="panel" style={{marginTop:18}}>
      <div className="panelHead"><h3>Security Model</h3><ShieldCheck size={16}/></div>
      {[['Master password','Single unlock credential — no username required'],['Vault encryption','AES-256-GCM · all data encrypted at rest with async scrypt'],['Memory protection','Sensitive buffers zeroed with .fill(0) immediately after use'],['Documents','Each file encrypted individually before local storage'],['AI privacy','Local mode stays on-device · Gemini receives only the selected document']].map(([k,v])=>(
        <div className="setting" key={k}><b>{k}</b><span>{v}</span></div>
      ))}
    </div>

    {showAssetModal && (
      <AssetVisibilityModal
        vault={vault}
        hiddenAssets={s.hiddenAssets || []}
        rates={rates}
        onSave={async (newHiddenIds) => {
          const next = { ...s, hiddenAssets: newHiddenIds };
          setS(next);
          setShowAssetModal(false);
          await save({ ...vault, settings: next });
          setMsg(`Asset visibility updated (${newHiddenIds.length} hidden).`);
          setIsError(false);
        }}
        onClose={() => setShowAssetModal(false)}
      />
    )}
  </>);
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
function Modal({title,onClose,children}){
  return(
    <div className="modalBack" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modalHead"><h3>{title}</h3><button onClick={onClose}><X size={17}/></button></div>
        {children}
      </div>
    </div>
  );
}
function Empty({text}){return <div className="empty"><Database size={20}/><p>{text}</p></div>;}

const container = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
