// Audit only: execute unmodified app methods with synthetic data and no network.
// Passing checks CONFIRM existing defects; they are not regression tests for fixes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
const NativeDate = Date;
class AuditDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-09-09T06:00:00+07:00'])); }
  static now() { return new NativeDate('2026-09-09T06:00:00+07:00').getTime(); }
}
const fields = {};
const storage = new Map();
const sandbox = {
  Date: AuditDate, console, setTimeout, clearTimeout, performance,
  document: { addEventListener() {}, getElementById: id => fields[id] || null },
  window: {},
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
  alert(message) { throw new Error('Unexpected alert: ' + message); },
  fetch() { throw new Error('NETWORK FORBIDDEN IN AUDIT'); },
  Chart: function(ctx, config) { this.config = config; }
};
vm.createContext(sandbox);
vm.runInContext(source + '\nthis.AuditApp = PixelStewardApp;', sandbox);
const proto = sandbox.AuditApp.prototype;
const copy = value => JSON.parse(JSON.stringify(value));
function holding(extra = {}) {
  return { id:'h-test', ticker:'MSFT', name:'Synthetic', shares:1,
    avgCostUSD:100, currentPriceUSD:100, change1dPct:0, ...extra };
}
function portfolio(extra = {}) {
  return { id:'audit', name:'Synthetic portfolio', tier:'Test', category:'Test',
    goalUSD:10000, cashBufferUSD:0, holdings:[], ...extra };
}
function app(extra = {}) {
  const a = Object.create(proto);
  Object.assign(a, { portfolios:[portfolio()], tradingData:{}, quarterlySnapshots:[],
    dividends:[], achievements:[], exchangeRate:32.83, displayCurrency:'USD',
    charts:{}, isFirebaseOnline:false, dbRef:null, ...extra });
  for (const key of ['renderActiveTab','setCloudStatus','updateSidebarFxRate',
    'renderSpecCountersBar','checkAllDipPriceAlerts','closeModal',
    'checkSingleHoldingDipAlert','showToast']) a[key] = () => {};
  return a;
}
const results = [];
async function check(id, title, fn) {
  for (const key of Object.keys(fields)) delete fields[key];
  try { const evidence = await fn(); results.push({id, confirmed:true, title, evidence}); }
  catch (error) { results.push({id, confirmed:false, title, error:error.stack}); }
}
(async () => {
  await check('R01','An automatic refresh with no prices can overwrite a newer edit', async () => {
    let cloud;
    const dbRef = { set: p => { cloud=copy(p); return Promise.resolve(); } };
    const fresh = app({isFirebaseOnline:true, dbRef,
      portfolios:[portfolio({cashBufferUSD:10000})]});
    const stale = app({isFirebaseOnline:true, dbRef,
      portfolios:[portfolio({cashBufferUSD:15000})]});
    fresh.saveData();
    assert.equal(cloud.portfolios[0].cashBufferUSD,10000);
    stale.fetchLiveExchangeRate = async () => stale.exchangeRate;
    await stale.syncLiveMarketPrices();
    assert.equal(cloud.portfolios[0].cashBufferUSD,15000);
    return {corrected:10000, afterStaleRefresh:cloud.portfolios[0].cashBufferUSD};
  });
  await check('R02','An older incoming lastUpdated is accepted', () => {
    const a = app({portfolios:[portfolio({cashBufferUSD:10000})]});
    a.handleCloudSync({portfolios:[portfolio({cashBufferUSD:15000})],lastUpdated:'2020-01-01'});
    assert.equal(a.portfolios.find(p=>p.id==='audit').cashBufferUSD,15000);
    return 'No incoming revision/timestamp guard';
  });
  await check('R03','Missing cloud collections retain deleted local records', () => {
    const a = app({dividends:[{id:'deleted'}], quarterlySnapshots:[{id:'deleted-quarter'}]});
    a.handleCloudSync({exchangeRate:33});
    assert.equal(a.dividends.length,1); assert.equal(a.quarterlySnapshots.length,1);
    return {dividends:a.dividends, snapshots:a.quarterlySnapshots};
  });
  await check('R04','An explicitly empty portfolio list is repopulated with defaults', () => {
    const a = app(); const actual = a.enrichPortfoliosWithIPS([]);
    assert.ok(actual.length>0); assert.ok(actual.some(p=>(p.holdings||[]).length));
    return {defaultPortfolios:actual.length};
  });
  await check('R05','Nonzero PEP is removed during enrichment', () => {
    const a = app(); const actual = a.enrichPortfoliosWithIPS([portfolio({id:'us_dividend',holdings:[holding({ticker:'PEP',shares:10})]})]);
    assert.equal(actual.find(p=>p.id==='us_dividend').holdings.length,0);
    return 'PEP shares=10 disappears';
  });
  await check('R06','Trade history is excluded from saved data', () => {
    const a=app({tradingHistory:[{id:'trade-test'}]}); a.saveData();
    const saved=JSON.parse(storage.get('pixel_steward_data_v2'));
    assert.equal(saved.tradingHistory,undefined);
    return Object.keys(saved);
  });
  await check('R07','Editing a holding drops its target amount', () => {
    const a=app({portfolios:[portfolio({holdings:[holding({targetTHB:15000})]})]});
    Object.entries({'holding-portfolio-id':'audit','holding-id':'h-test',
      'holding-ticker':'MSFT','holding-name':'Synthetic','holding-shares':'1',
      'holding-avg-cost':'100','holding-current-price':'100','holding-1d-change':'0'})
      .forEach(([id,value])=>fields[id]={value});
    a.saveHoldingForm(); assert.equal(a.portfolios[0].holdings[0].targetTHB,undefined);
    return 'targetTHB=15000 -> missing';
  });
  await check('R08','September startup backdates current values into March and June', () => {
    const a=app({portfolios:[portfolio({cashBufferUSD:10000})]});
    a.checkAndAutoRecordQuarterlySnapshots();
    assert.deepEqual(copy(a.quarterlySnapshots.map(s=>[s.date,s.totalUSD])),
      [['2026-03-31',10000],['2026-06-30',10000]]);
    return copy(a.quarterlySnapshots.map(s=>({date:s.date,totalUSD:s.totalUSD})));
  });
  await check('R09','Markdown chooses the first quarter match from the wrong year', () => {
    const a=app({quarterlySnapshots:[
      {year:2025,quarter:'Q1',portValuesUSD:{audit:1111}},
      {year:2026,quarter:'Q1',portValuesUSD:{audit:2222}}]});
    const md=a.generateObsidianMarkdown();
    const section=md.split('## 📊 3.')[1].split('## 📅 4.')[0];
    assert.ok(section.includes('2026')); assert.ok(section.includes('1,111.00'));
    assert.ok(!section.includes('2,222.00'));
    return section.trim();
  });
  await check('R10','Benchmark draws fixed index data and invented portfolio path', () => {
    fields['chart-benchmark-comparison']={getContext:()=>({})};
    const a=app(); a.initBenchmarkChart(20);
    const data=copy(a.charts.benchmark.config.data.datasets.map(d=>d.data));
    assert.deepEqual(data,[[0,5,11,17,20],[0,2.8,5.4,7.6,9.8],[0,0.8,-1.2,1.5,3.2]]);
    return data;
  });
  await check('R11','A Thai quote uses FX captured before the FX update', async () => {
    const a=app({exchangeRate:32}); const updates={}; let deliver;
    a.fetchViaFastProxies=()=>new Promise(resolve=>deliver=resolve);
    const pending=a.fetchThaiStockPrices(['TEST.BK'],updates);
    a.exchangeRate=33;
    deliver({chart:{result:[{meta:{regularMarketPrice:320,previousClose:320}}]}});
    await pending;
    const displayedTHB=updates['TEST.BK'].priceUSD*a.exchangeRate;
    assert.equal(displayedTHB,330);
    return {actualTHB:320,displayedTHB};
  });
  await check('R12','Share renderer calls a nonexistent calculation method', () => {
    assert.ok(source.includes('this.calculatePortfolioTotal(p)'));
    assert.equal(typeof proto.calculatePortfolioTotal,'undefined');
    return 'calculatePortfolioTotal is undefined';
  });
  await check('R13','Current-value weighted daily change differs from aggregate return', () => {
    const a=app(); const p=portfolio({holdings:[
      holding({shares:1,currentPriceUSD:200,change1dPct:100}),
      holding({id:'h-other',shares:1,currentPriceUSD:100,change1dPct:0})]});
    const shown=a.calculatePortfolioStats(p).avg1dChangePct;
    assert.ok(Math.abs(shown-66.66666666666667)<1e-8);
    return {priorTotal:200,currentTotal:300,truePct:50,shownPct:shown};
  });
  const report={auditedCommit:'ed93106bc3023a9b67ae3246013b754b18d3f284',
    syntheticOnly:true,networkUsed:false,checks:results};
  fs.writeFileSync(path.join(__dirname,'reproduction-results.json'),JSON.stringify(report,null,2)+'\n');
  for(const r of results) console.log(`${r.confirmed?'CONFIRMED':'NOT CONFIRMED'} ${r.id}: ${r.title}`);
  const failures=results.filter(r=>!r.confirmed);
  if(failures.length) {console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
  console.log(`${results.length-failures.length}/${results.length} defect reproductions confirmed. No Firebase/network used.`);
})();
