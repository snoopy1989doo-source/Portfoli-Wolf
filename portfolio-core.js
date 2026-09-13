/* Shared calculations. No browser, network, or storage side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PortfolioCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const empty = () => ({ portfolios: [], tradingData: {}, quarterlySnapshots: [],
    dividends: [], achievements: [], tradingHistory: [], cashFlows: [], wealthAssets: [],
    liabilities: [], benchmarkCache: {}, exchangeRate: 32.83 });
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
    if (value.benchmarkCache && typeof value.benchmarkCache === 'object' && !Array.isArray(value.benchmarkCache)) data.benchmarkCache = clone(value.benchmarkCache);
    if (Number.isFinite(value.exchangeRate) && value.exchangeRate > 0) data.exchangeRate = value.exchangeRate;
    data.portfolios = data.portfolios.filter(p => p && typeof p.id === 'string').map(p => ({...p,
      holdings: Array.isArray(p.holdings) ? p.holdings : []}));
    return data;
  }
  function validateImport(value) {
    if(!value || !Array.isArray(value.portfolios))throw Error('ต้องมีรายการ portfolios');
    for(const key of ['portfolios','dividends','quarterlySnapshots','achievements','tradingHistory','cashFlows','wealthAssets','liabilities'])if(value[key]!==undefined&&!Array.isArray(value[key]))throw Error('รูปแบบ '+key+' ไม่ถูกต้อง');
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
    for(const a of value.wealthAssets||[])if(!a||!safeId(a.id)||typeof a.name!=='string'||!['USD','THB'].includes(a.currency)||!finite(a.value)||!finite(a.cost||0)||!Number.isFinite(Date.parse(a.valuedAt)))throw Error('สินทรัพย์ความมั่งคั่งไม่ถูกต้อง');
    for(const l of value.liabilities||[]){
      if(!l||!safeId(l.id)||typeof l.name!=='string'||!['USD','THB'].includes(l.currency)||!finite(l.balance)||!finite(l.monthlyPayment||0)||l.payments!==undefined&&!Array.isArray(l.payments))throw Error('หนี้สินไม่ถูกต้อง');
      for(const p of l.payments||[])if(!p||!safeId(p.id)||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!finite(p.principal)||p.principal===0||!finite(p.interest||0)||!finite(p.balanceBefore)||!finite(p.balanceAfter))throw Error('ประวัติชำระหนี้ไม่ถูกต้อง');
    }
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
    return {start, end, deposits, withdrawals, profit, denominator, incomplete: adjustments,
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
  const clamp = n => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const asUSD = (value,currency,rate) => (Number(value)||0)/(currency==='THB'?(rate||1):1);
  function holdingValues(h,rate){
    const shares=Number(h?.shares)||0;
    const cost=h?.currency==='THB'&&Number.isFinite(Number(h.avgCostNative))?Number(h.avgCostNative)/(rate||1):Number(h?.avgCostUSD)||0;
    const price=h?.currency==='THB'&&Number.isFinite(Number(h.currentPriceNative))?Number(h.currentPriceNative)/(rate||1):Number(h?.currentPriceUSD)||0;
    return {cost:shares*cost,value:shares*price};
  }
  function portfolioValue(data,portfolioId=null){
    const rate=data.exchangeRate||1;
    let total=0;
    for(const p of data.portfolios||[]){
      if(portfolioId&&p.id!==portfolioId)continue;
      total+=Number(p.cashBufferUSD)||0;
      for(const h of p.holdings||[])total+=holdingValues(h,rate).value;
    }
    if(!portfolioId)for(const t of Object.values(data.tradingData||{})){
      const rows=(t.monthlyBalances||[]).slice().sort((a,b)=>b.year*12+b.month-a.year*12-a.month);
      total+=Number(rows[0]?.balanceUSD)||0;
    }
    return total;
  }
  function lifetimePerformance(data,portfolioId=null){
    const rate=data.exchangeRate||1;
    let unrealized=0,currentCost=0;
    for(const p of data.portfolios||[]){
      if(portfolioId&&p.id!==portfolioId)continue;
      for(const h of p.holdings||[]){const v=holdingValues(h,rate);currentCost+=v.cost;unrealized+=v.value-v.cost;}
    }
    const trades=(data.tradingHistory||[]).filter(t=>(!portfolioId||t.portfolioId===portfolioId)&&t.type==='SELL');
    const realized=trades.reduce((sum,t)=>sum+(Number(t.realizedPLUSD)||0),0);
    const soldCost=trades.reduce((sum,t)=>sum+Math.max(0,(Number(t.totalUSD)||0)-(Number(t.realizedPLUSD)||0)),0);
    const dividends=(data.dividends||[]).filter(d=>!portfolioId||d.portfolioId===portfolioId).reduce((sum,d)=>sum+(Number(d.netUSD)||0),0);
    const fees=(data.tradingHistory||[]).filter(t=>!portfolioId||t.portfolioId===portfolioId).reduce((sum,t)=>sum+(Number(t.feeUSD)||0),0);
    // Trade results are stored net of their fee (and buy fees are included in cost basis).
    // Keep fees as an informational breakdown without deducting them twice.
    const profit=unrealized+realized+dividends;
    const measuredCapital=currentCost+soldCost;
    return {unrealized,realized,dividends,fees,profit,measuredCapital,returnPct:measuredCapital>0?profit/measuredCapital*100:null,
      complete:trades.every(t=>Number.isFinite(Number(t.realizedPLUSD)))};
  }
  function wealth(data){
    const rate=data.exchangeRate||1;
    const investmentsUSD=portfolioValue(data);
    const otherAssetsUSD=(data.wealthAssets||[]).reduce((s,a)=>s+asUSD(a.value,a.currency,rate),0);
    const liabilitiesUSD=(data.liabilities||[]).reduce((s,l)=>s+asUSD(l.balance,l.currency,rate),0);
    return {investmentsUSD,otherAssetsUSD,assetsUSD:investmentsUSD+otherAssetsUSD,liabilitiesUSD,
      netWorthUSD:investmentsUSD+otherAssetsUSD-liabilitiesUSD};
  }
  function portfolioHealth(data){
    const rate=data.exchangeRate||1,positions=[];
    for(const p of data.portfolios||[])for(const h of p.holdings||[]){const v=holdingValues(h,rate).value;if(v>0)positions.push({h,value:v});}
    const invested=positions.reduce((s,x)=>s+x.value,0);
    if(!invested)return {score:0,diversification:0,concentration:0,dataQuality:0,goalProgress:0};
    const weights=positions.map(x=>x.value/invested),hhi=weights.reduce((s,w)=>s+w*w,0),maxWeight=Math.max(...weights);
    const diversification=clamp((1-hhi)/.8*100),concentration=clamp((1-maxWeight)/.75*100);
    const now=Date.now();
    const dataQuality=positions.reduce((s,x)=>{const at=Date.parse(x.h.priceMarketAt||x.h.priceReceivedAt||'');return s+(Number.isFinite(at)&&now-at<8*86400000?100:(x.value>0?55:0));},0)/positions.length;
    let goalTotal=0,goalValue=0;
    for(const p of data.portfolios||[]){const goal=p.goalCurrency==='THB'?asUSD(p.goalTHB,'THB',rate):Number(p.goalUSD)||0;if(goal>0){goalTotal+=goal;goalValue+=Math.min(goal,portfolioValue(data,p.id));}}
    const goalProgress=goalTotal>0?clamp(goalValue/goalTotal*100):50;
    return {score:Math.round(diversification*.35+concentration*.25+dataQuality*.2+goalProgress*.2),diversification,concentration,dataQuality,goalProgress};
  }
  function wealthStrength(data){
    const rate=data.exchangeRate||1,w=wealth(data),assets=w.assetsUSD,liabilities=w.liabilitiesUSD;
    const debt=assets>0?clamp(100-liabilities/assets*150):(liabilities?0:50);
    const liquid=portfolioValue({...data,portfolios:(data.portfolios||[]).map(p=>({...p,holdings:[]})),tradingData:{}})+(data.wealthAssets||[]).filter(a=>['cash','deposit'].includes(a.type)).reduce((s,a)=>s+asUSD(a.value,a.currency,rate),0);
    const monthlyDebt=(data.liabilities||[]).reduce((s,l)=>s+asUSD(l.monthlyPayment,l.currency,rate),0);
    const liquidity=monthlyDebt>0?clamp(liquid/(monthlyDebt*6)*100):(liabilities?60:100);
    const netWorth=assets>0?clamp(w.netWorthUSD/assets*125):(liabilities?0:50);
    const classes=new Set((data.wealthAssets||[]).filter(a=>a.value>0).map(a=>a.type));if(w.investmentsUSD>0)classes.add('investment');
    const allocation=clamp(classes.size/4*100);
    const snapshots=(data.quarterlySnapshots||[]).filter(s=>Number.isFinite(s.totalUSD)).sort((a,b)=>String(a.recordedAt).localeCompare(String(b.recordedAt)));
    const trend=snapshots.length>1&&snapshots[0].totalUSD>0?clamp(50+(snapshots[snapshots.length-1].totalUSD/snapshots[0].totalUSD-1)*100):50;
    return {score:Math.round(debt*.3+liquidity*.25+netWorth*.25+allocation*.1+trend*.1),debt,liquidity,netWorth,allocation,trend,...w};
  }
  return {clone, empty, normalize, validateImport, bangkokDate, quarterEnd, commit, period, projection, upsertSnapshot,
    holdingValues, portfolioValue, lifetimePerformance, wealth, portfolioHealth, wealthStrength};
});
