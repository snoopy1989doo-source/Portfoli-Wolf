/* Shared calculations. No browser, network, or storage side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PortfolioCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const empty = () => ({ portfolios: [], tradingData: {}, quarterlySnapshots: [],
    dividends: [], achievements: [], tradingHistory: [], cashFlows: [], exchangeRate: 32.83 });
  function bangkokDate(time = Date.now()) {
    return new Date(new Date(time).getTime() + 7 * 3600000).toISOString().slice(0, 10);
  }
  function quarterEnd(time = Date.now()) {
    const date = bangkokDate(time);
    const index = ['03-31', '06-30', '09-30', '12-31'].indexOf(date.slice(5));
    return index < 0 ? null : { year: Number(date.slice(0, 4)), quarter: `Q${index + 1}`, date };
  }
  function normalize(value) {
    const data = empty();
    if (!value || typeof value !== 'object') return data;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) data[key] = Array.isArray(value[key]) ? clone(value[key]) : [];
    }
    if (value.tradingData && typeof value.tradingData === 'object' && !Array.isArray(value.tradingData)) data.tradingData = clone(value.tradingData);
    if (Number.isFinite(value.exchangeRate) && value.exchangeRate > 0) data.exchangeRate = value.exchangeRate;
    data.portfolios = data.portfolios.filter(p => p && typeof p.id === 'string').map(p => ({...p, holdings: Array.isArray(p.holdings) ? p.holdings : []}));
    return data;
  }
  function validateImport(value) {
    if(!value || !Array.isArray(value.portfolios))throw Error('ต้องมีรายการ portfolios');
    for(const key of ['portfolios','dividends','quarterlySnapshots','achievements','tradingHistory','cashFlows'])if(value[key]!==undefined&&!Array.isArray(value[key]))throw Error('รูปแบบ '+key+' ไม่ถูกต้อง');
    const ids=new Set(),holdingIds=new Set();
    const safeId=id=>typeof id==='string'&&/^[\w:-]+$/.test(id);
    const finite=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
    for(const p of value.portfolios){
      if(!p||!safeId(p.id)||ids.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.holdings))throw Error('พอร์ตไม่มี ID/ชื่อ หรือ ID ซ้ำ');
      ids.add(p.id);const tickers=new Set();
      if(p.cashBufferUSD!==undefined&&!finite(p.cashBufferUSD))throw Error('เงินสดไม่ถูกต้อง');
      for(const h of p.holdings){
        if(!h||!safeId(h.id)||holdingIds.has(h.id)||typeof h.ticker!=='string'||!finite(h.shares)||!finite(h.avgCostUSD)||!finite(h.currentPriceUSD))throw Error('ข้อมูลสินทรัพย์หรือ ID ไม่ถูกต้อง');
        if(!/^[\p{L}\p{N}._^=-]{1,30}$/u.test(h.ticker))throw Error('สัญลักษณ์สินทรัพย์ไม่ถูกต้อง');
        const ticker=h.ticker.toUpperCase();if(tickers.has(ticker))throw Error('สินทรัพย์ซ้ำในพอร์ต');tickers.add(ticker);holdingIds.add(h.id);
      }
    }
    for(const [key,t]of Object.entries(value.tradingData||{}))if(!safeId(key)||!t||!Array.isArray(t.monthlyBalances)||t.monthlyBalances.some(m=>!finite(m.balanceUSD)||!Number.isInteger(m.year)||!Number.isInteger(m.month)||m.month<1||m.month>12))throw Error('ประวัติพอร์ตเทรดไม่ถูกต้อง');
    for(const s of value.quarterlySnapshots||[])if(!s||!finite(s.totalUSD)||!Number.isInteger(s.year)||!/^Q[1-4]$/.test(s.quarter)||!finite(s.exchangeRate)||s.exchangeRate===0||!s.portValuesUSD)throw Error('ประวัติไตรมาสไม่ถูกต้อง');
    for(const f of value.cashFlows||[])if(!f||!['DEPOSIT','WITHDRAW','ADJUSTMENT'].includes(f.type)||!Number.isFinite(Date.parse(f.at))||!Number.isFinite(f.amountUSD)||!Number.isFinite(f.amountTHB))throw Error('เงินเข้าออกไม่ถูกต้อง');
    return normalize(value);
  }
  // Reject stale forms atomically: a trade must never save holdings without its cash leg.
  function commit(current, expectedRevision, next, generation) {
    if (!current || current.generation !== generation || current.revision !== expectedRevision) return undefined;
    return {...current, revision: expectedRevision + 1, data: normalize(next)};
  }
  function period(previous, current, flows = [], currency = 'USD') {
    const factor = s => currency === 'THB' ? s.exchangeRate : 1;
    const start = previous.totalUSD * factor(previous);
    const end = current.totalUSD * factor(current);
    const from = new Date(previous.recordedAt).getTime();
    const to = new Date(current.recordedAt).getTime();
    const relevant = flows.filter(f => new Date(f.at).getTime() > from && new Date(f.at).getTime() <= to);
    let deposits = 0, withdrawals = 0, weightedFlows = 0;
    for (const f of relevant) {
      if (!['DEPOSIT', 'WITHDRAW'].includes(f.type)) continue;
      const amount = currency === 'THB' ? f.amountTHB : f.amountUSD;
      if (!Number.isFinite(amount)) return {start, end, incomplete: true};
      const signed = f.type === 'DEPOSIT' ? amount : -amount;
      if (signed >= 0) deposits += signed; else withdrawals -= signed;
      weightedFlows += signed * Math.max(0, Math.min(1, (to - new Date(f.at).getTime()) / (to - from || 1)));
    }
    const adjustments = relevant.some(f => f.type === 'ADJUSTMENT');
    const profit = end - start - deposits + withdrawals;
    const denominator = start + weightedFlows;
    return {start, end, deposits, withdrawals, profit, incomplete: adjustments,
      returnPct: !adjustments && denominator > 0 ? profit / denominator * 100 : null};
  }
  function projection(snapshots, flows, currency = 'USD', years = 1) {
    const points = snapshots.filter(s => s.recordedAt && Number.isFinite(s.totalUSD)).slice().sort((a,b) => a.recordedAt.localeCompare(b.recordedAt));
    if (points.length < 4) return {available:false, reason:'ต้องมีประวัติอย่างน้อย 4 ไตรมาสที่บันทึกจริง'};
    let growth = 1;
    for (let i=1; i<points.length; i++) {
      const p = period(points[i-1], points[i], flows, currency);
      const priorKey = points[i-1].year * 4 + Number(points[i-1].quarter.slice(1));
      const nextKey = points[i].year * 4 + Number(points[i].quarter.slice(1));
      if (p.incomplete || p.returnPct === null || p.returnPct <= -100 || nextKey-priorKey !== 1) return {available:false, reason:'ประวัติขาดช่วง มีการปรับยอด หรือฐานเงินไม่เพียงพอสำหรับคำนวณ'};
      growth *= 1 + p.returnPct/100;
    }
    const quarterlyRate = Math.pow(growth, 1/(points.length-1))-1;
    const last = points[points.length-1];
    const initial = last.totalUSD * (currency === 'THB' ? last.exchangeRate : 1);
    return {available:true, quarterlyRate, values:Array.from({length:years*4+1},(_,i)=>initial*Math.pow(1+quarterlyRate,i)),
      assumption:'แนวโน้มผลตอบแทนย้อนหลังหลังหักเงินเติม/ถอน (Modified Dietz โดยประมาณ) ไม่สมมติเงินเติมใหม่ ไม่รับประกันผลในอนาคต'};
  }
  function upsertSnapshot(snapshots, snapshot, requestDate, completedAt) {
    const end = quarterEnd(completedAt);
    if (!end || end.date !== requestDate || snapshot.date !== requestDate) return snapshots;
    const existing = snapshots.find(s=>s.year===end.year && s.quarter===end.quarter);
    if (existing && existing.recordedAt >= snapshot.recordedAt) return snapshots;
    return [...snapshots.filter(s=>s.year!==end.year || s.quarter!==end.quarter), clone(snapshot)];
  }
  return {clone, empty, normalize, validateImport, bangkokDate, quarterEnd, commit, period, projection, upsertSnapshot};
});
