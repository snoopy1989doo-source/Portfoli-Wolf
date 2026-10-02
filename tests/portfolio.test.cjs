const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const core=require('../portfolio-core.js');
const root=path.join(__dirname,'..');
const copy=core.clone;
const p=(cash=0)=>({id:'p',name:'Test',holdings:[],cashBufferUSD:cash,goalUSD:10000,tier:'Test',category:'Test'});
function runtime(){
  const fields={}; const notices=[];
  const sandbox={PortfolioCore:core,console,Date,crypto:require('node:crypto').webcrypto,
    setTimeout:()=>0,clearTimeout(){},setInterval(){},performance,
    window:{},document:{addEventListener(){},getElementById:id=>fields[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
    localStorage:{getItem:()=>null,setItem(){}},alert:message=>notices.push(message),confirm:()=>true,
    fetch:()=>{throw Error('Network forbidden');}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nthis.App=PixelStewardApp;',sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app-data.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app-features.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app-market.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app-assets.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app-ledger.js'),'utf8'),sandbox);
  const app=Object.assign(Object.create(sandbox.App.prototype),core.empty(),{cloudReady:true,isFirebaseOnline:true,revision:0,generation:'g',charts:{},displayCurrency:'USD'});
  for(const name of ['renderActiveTab','renderSpecCountersBar','setCloudStatus','updateSidebarFxRate'])app[name]=()=>{};
  app.showToast=value=>notices.push(value);
  return {app,fields,notices,sandbox};
}
test('daily movers rank monetary impact, combine tickers and limit each side to five',()=>{
  const holdings=[{ticker:'BIG',shares:100,currentPriceUSD:110,change1dPct:10},{ticker:'SMALL',shares:1,currentPriceUSD:150,change1dPct:50},...Array.from({length:6},(_,i)=>({ticker:'LOSS'+i,shares:10+i,currentPriceUSD:90,change1dPct:-10})),{ticker:'UNKNOWN',shares:100,currentPriceUSD:100},{ticker:'BTC',shares:1,currentPriceUSD:50000,change1dPct:10}];
  const data={...core.empty(),portfolios:[{id:'a',name:'A',holdings},{id:'b',name:'B',holdings:[{ticker:'BIG',shares:10,currentPriceUSD:110,change1dPct:10}]}]};
  const result=core.dailyMovers(data);
  assert.equal(result.winners[0].ticker,'BIG');assert.ok(Math.abs(result.winners[0].profitUSD-1100)<1e-8);
  assert.equal(result.winners[0].portfolios.length,2);assert.equal(result.winners[1].ticker,'SMALL');
  assert.equal(result.losers.length,5);assert.equal(result.losers[0].ticker,'LOSS5');assert.equal(result.missing,1);
  assert.ok(![...result.winners,...result.losers].some(r=>r.ticker==='BTC'||r.ticker==='UNKNOWN'));
});

test('asset entry rejects blanks and invalid numbers without mutating holdings; preserves fractions and metadata',async()=>{
  const {app,fields}=runtime();app.portfolios=[{...p(),holdings:[{id:'h',ticker:'MSFT',name:'Microsoft',shares:1,avgCostUSD:10,currentPriceUSD:12,targetTHB:15000}]}];let saves=0;
  app.saveData=async()=>{saves++;return true;};app.closeModal=()=>{};
  const values={'holding-id':'h','holding-portfolio-id':'p','holding-ticker':'msft','holding-name':'Microsoft','holding-shares':'0.0094640','holding-avg-cost':'479.4208','holding-current-price':'513.851234','holding-1d-change':''};
  for(const [id,value]of Object.entries(values))fields[id]={value};
  const before=copy(app.portfolios);
  for(const id of ['holding-name','holding-shares','holding-avg-cost','holding-current-price']){fields[id].value='';await app.saveHoldingForm();fields[id].value=values[id];assert.equal(saves,0);assert.deepEqual(app.portfolios,before);}
  for(const bad of ['-1','abc','1,200','Infinity','1e9']){fields['holding-shares'].value=bad;await app.saveHoldingForm();assert.equal(saves,0);}
  fields['holding-shares'].value=values['holding-shares'];await app.saveHoldingForm();
  assert.equal(saves,1);const h=app.portfolios[0].holdings[0];assert.equal(h.shares,.009464);assert.equal(h.avgCostUSD,479.4208);assert.equal(h.currentPriceUSD,513.851234);assert.equal(h.targetTHB,15000);assert.equal(h.change1dPct,null);assert.equal(h.ticker,'MSFT');
});

test('trade validation rejects impossible dates, missing execution data, negative fees and oversized sale before mutation',async()=>{
  const {app,fields,sandbox}=runtime();app.portfolios=[{...p(100),holdings:[{id:'h',ticker:'TEST',name:'Test asset',shares:1,avgCostUSD:10,currentPriceUSD:20}]}];
  let saves=0;app.saveData=async()=>{saves++;return true;};sandbox.document.querySelector=()=>({value:'SELL'});
  const values={'trade-stock-select':'p:::h','trade-shares':'.5','trade-price':'20','trade-executed-date':'2026-01-01','trade-executed-time':'12:30:15','trade-commission-usd':'0','trade-fee-usd':'0'};
  for(const [id,value]of Object.entries(values))fields[id]={value};fields['trade-use-cash-buffer']={checked:true};
  const before=copy(app.dataPayload());
  for(const [id,bad]of [['trade-executed-date','2026-02-30'],['trade-executed-date',''],['trade-executed-time','24:01'],['trade-executed-date','2099-01-01'],['trade-shares','2'],['trade-shares',''],['trade-price','20xyz'],['trade-commission-usd','-1'],['trade-commission-usd','11']]){fields[id].value=bad;await app.executeTrade();fields[id].value=values[id];assert.equal(saves,0);assert.deepEqual(app.dataPayload(),before);}
  app.closeModal=()=>{};await app.executeTrade();assert.equal(saves,1);assert.equal(app.tradingHistory[0].date,'2026-01-01T05:30:15.000Z');assert.equal(app.tradingHistory[0].assetName,'Test asset');
});

test('asset ledger presents cost, market value, allocation including cash, profit and escaped asset names in both layouts',()=>{
  const {app}=runtime();app.renderStockLogoHTML=()=>'';const port={...p(100),holdings:[{id:'h',ticker:'TEST',name:'<script>unsafe</script>',shares:2,avgCostUSD:40,currentPriceUSD:50,change1dPct:null}]};
  for(const layout of ['compact','full']){app.holdingsViewLayout=layout;const html=app.renderHoldingsLayoutHTML(port,port.holdings,app.calculatePortfolioStats(port));
    assert.ok(html.includes('$80.00'));assert.ok(html.includes('$100.00'));assert.ok(html.includes('50.00% ของพอร์ต'));assert.ok(html.includes('+25.00%'));assert.ok(html.includes('$20.00'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));}
});
test('daily movers use native THB quotes and reject invalid daily percentages',()=>{
  const data={...core.empty(),exchangeRate:32,portfolios:[{id:'p',name:'P',holdings:[{ticker:'PTT.BK',currency:'THB',shares:100,currentPriceNative:35.2,currentPriceUSD:99,change1dPct:10},{ticker:'BAD',shares:1,currentPriceUSD:50,change1dPct:-100}]}]};
  const result=core.dailyMovers(data);assert.ok(Math.abs(result.winners[0].profitUSD-10)<1e-8);assert.equal(result.missing,1);
});
test('Bangkok boundaries and exact quarter end days',()=>{
  assert.equal(core.bangkokDate('2026-09-30T16:59:59Z'),'2026-09-30');
  assert.equal(core.quarterEnd('2026-09-30T17:00:00Z'),null);
  assert.equal(core.quarterEnd('2026-09-30T16:00:00Z').quarter,'Q3');
  assert.equal(core.quarterEnd('2026-09-09T00:00:00Z'),null);
});
test('price alerts trigger once on entry, rearm on exit and never write Cloud',()=>{
  const {app,notices,sandbox}=runtime();app.dbRef={transaction:()=>{throw Error('Quote wrote Cloud');}};
  sandbox.document.visibilityState='hidden'; // An open background tab may still receive prices.
  app.portfolios=[{...p(),holdings:[{id:'h',ticker:'MSFT',shares:2,currentPriceUSD:100,dipTarget1:90,sellTargetUSD:110,stopLossUSD:80}]}];
  const update=price=>app.applyMarketUpdates({MSFT:{priceUSD:price,change1dPct:0,source:'Test'}});
  update(90);update(89);assert.equal(notices.length,1);assert.equal(app.priceAlertHistory.length,1);
  update(100);update(90);assert.equal(notices.length,2);
  update(110);assert.ok(notices.at(-1).title.includes('ขายทำกำไร'));
  update(79);assert.ok(notices.at(-1).title.includes('ขายจำกัดขาดทุน'));
  assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,79);
});
test('stream trades use fresh previous close and reject older price updates',()=>{
  const {app}=runtime();app.portfolios=[{...p(),holdings:[{id:'h',ticker:'MSFT',shares:1,currentPriceUSD:100,change1dPct:0}]}];
  const now=Date.now();app.applyMarketUpdates({MSFT:{priceUSD:100,change1dPct:0,previousCloseUSD:100,referenceAt:new Date(now).toISOString(),marketAt:new Date(now-5000).toISOString(),source:'Test'}});
  app.receiveMarketTrades([{s:'MSFT',p:110,t:now},{s:'MSFT',p:105,t:now-1000}]);
  assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,110);assert.ok(Math.abs(app.portfolios[0].holdings[0].change1dPct-10)<1e-8);
  app.applyMarketUpdates({MSFT:{priceUSD:80,marketAt:new Date(now-2000).toISOString(),source:'Old'}});
  assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,110);
  app.marketQuotes.MSFT.referenceAt=new Date(now-100000).toISOString();app.receiveMarketTrades([{s:'MSFT',p:120,t:now+1}]);
  assert.equal(app.portfolios[0].holdings[0].change1dPct,null);
});
test('live quotes do not replace an open form baseline and native THB remains fixed',()=>{
  const {app}=runtime();app.portfolios=[{...p(),holdings:[{id:'h',ticker:'PTT.BK',shares:100,currency:'THB',currentPriceNative:320,currentPriceUSD:10}]}];app.exchangeRate=32;app.viewDirty=true;
  app.applyMarketUpdates({'PTT.BK':{priceUSD:11,change1dPct:10,source:'Test'}});
  assert.equal(app.portfolios[0].holdings[0].currentPriceNative,320);
  app.viewDirty=false;app.exchangeRate=33;app.mergeMarketQuotes();assert.equal(app.portfolios[0].holdings[0].currentPriceNative,352);
});
test('stream subscribes only to held US tickers and closes at disconnect',()=>{
  const {app,sandbox}=runtime();let socket;
  sandbox.WebSocket=class{constructor(url){this.url=url;this.messages=[];socket=this;}send(data){this.messages.push(JSON.parse(data));}close(){this.closed=true;}};
  app.finnhubApiKey='test-key';app.portfolios=[{...p(),holdings:[{id:'h',ticker:'MSFT',shares:1},{id:'b',ticker:'PTT.BK',shares:1},{id:'c',ticker:'BTC',shares:1}]}];
  app.ensureMarketStream();socket.onopen();assert.deepEqual(JSON.parse(JSON.stringify(socket.messages)),[{type:'subscribe',symbol:'MSFT'}]);
  socket.onmessage({data:JSON.stringify({type:'trade',data:[{s:'MSFT',p:123,t:Date.now()}]})});assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,123);
  app.stopMarketStream();assert.equal(socket.closed,true);assert.equal(app.marketSocket,null);
});
test('last successful same-day visit replaces one snapshot, older and next-day do not',()=>{
  const s={year:2026,quarter:'Q3',date:'2026-09-30',recordedAt:'2026-09-30T10:00:00Z',totalUSD:100};
  let rows=core.upsertSnapshot([],s,s.date,s.recordedAt);
  rows=core.upsertSnapshot(rows,{...s,recordedAt:'2026-09-30T16:00:00Z',totalUSD:150},s.date,'2026-09-30T16:00:00Z');
  assert.equal(rows.length,1);assert.equal(rows[0].totalUSD,150);
  assert.equal(core.upsertSnapshot(rows,s,s.date,s.recordedAt)[0].totalUSD,150);
  assert.equal(core.upsertSnapshot(rows,{...s,totalUSD:999},s.date,'2026-09-30T17:01:00Z')[0].totalUSD,150);
});
test('transaction rejects old revision and pre-reset generation without overwriting',()=>{
  const state={revision:2,generation:'new',data:{...core.empty(),portfolios:[p(10000)]}};
  assert.equal(core.commit(state,1,{...core.empty(),portfolios:[p(15000)]},'new'),undefined);
  assert.equal(core.commit(state,2,core.empty(),'old'),undefined);
  assert.equal(state.data.portfolios[0].cashBufferUSD,10000);
  assert.equal(core.commit(state,2,core.empty(),'new').revision,3);
});
test('empty cloud lists stay empty; PEP and custom targets survive normalization',()=>{
  assert.deepEqual(core.normalize({}).portfolios,[]);
  const state=core.normalize({portfolios:[{...p(),holdings:[{id:'h',ticker:'PEP',shares:10,targetTHB:15000}]}]});
  assert.equal(state.portfolios[0].holdings[0].shares,10);
  assert.equal(state.portfolios[0].holdings[0].targetTHB,15000);
});
test('cash additions are not counted as profit; dated denominator accounts for time held',()=>{
  const from={totalUSD:100,exchangeRate:30,recordedAt:'2026-01-01T00:00:00Z'};
  const to={totalUSD:160,exchangeRate:30,recordedAt:'2026-01-11T00:00:00Z'};
  const flows=[{type:'DEPOSIT',amountUSD:50,amountTHB:1500,at:'2026-01-06T00:00:00Z'}];
  const result=core.period(from,to,flows);
  assert.equal(result.profit,10);assert.equal(result.returnPct,8);
  assert.equal(core.period(from,to,flows,'THB').profit,300);
});
test('withdrawals add back to profit; adjustments suppress misleading return',()=>{
  const from={totalUSD:100,exchangeRate:30,recordedAt:'2026-01-01T00:00:00Z'};
  const to={totalUSD:80,exchangeRate:30,recordedAt:'2026-01-11T00:00:00Z'};
  const flows=[{type:'WITHDRAW',amountUSD:30,amountTHB:900,at:'2026-01-06T00:00:00Z'}];
  assert.equal(core.period(from,to,flows).profit,10);
  assert.equal(core.period(from,to,[...flows,{type:'ADJUSTMENT',at:'2026-01-07T00:00:00Z'}]).returnPct,null);
});
test('forecast needs consecutive real history and does not invent contributions',()=>{
  assert.equal(core.projection([],[]).available,false);
  const points=Array.from({length:4},(_,i)=>({year:2025,quarter:'Q'+(i+1),totalUSD:100*Math.pow(1.1,i),exchangeRate:30,recordedAt:`2025-${String((i+1)*3).padStart(2,'0')}-28T12:00:00Z`}));
  const result=core.projection(points,[]);
  assert.equal(result.available,true);assert.ok(Math.abs(result.quarterlyRate-.1)<1e-10);
  assert.equal(result.values.length,5);
  points[2].quarter='Q4';assert.equal(core.projection(points,[]).available,false);
});
test('manual Sync Market refreshes prices, reports success and does not write holdings outside quarter-end',async()=>{
  const {app,notices}=runtime();let writes=0;
  app.portfolios=[{...p(15000),holdings:[{id:'h',ticker:'MSFT',shares:1,currentPriceUSD:100}]}];
  app.dbRef={transaction:()=>{writes++;throw Error('Unexpected write');}};
  app.fetchLiveExchangeRate=async()=>33;
  app.fetchCryptoPrices=async()=>{};app.fetchThaiStockPrices=async()=>{};
  app.fetchBatchStockPrices=async(t,u)=>u.MSFT={priceUSD:120,change1dPct:1};
  app.recordQuarterAfterRefresh=async()=>{};
  await app.syncLiveMarketPrices({manual:true});
  assert.equal(writes,0);assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,120);
  assert.equal(notices.at(-1).title,'Sync Market สำเร็จ');
});
test('cloud update clears absent dividends and trading history rather than keeping old copies',()=>{
  const {app}=runtime();app.dividends=[{id:'old'}];app.tradingHistory=[{id:'old'}];
  app.acceptCloud({revision:1,generation:'g',data:{portfolios:[]}});
  assert.equal(app.dividends.length,0);assert.equal(app.portfolios.length,0);assert.equal(app.tradingHistory.length,0);
});
test('save keeps trade history and shows conflict instead of stale overwrite',async()=>{
  const {app}=runtime();let cloud={revision:0,generation:'g',schemaVersion:4,data:core.empty()};
  app.dbRef={transaction:async fn=>{const value=fn(copy(cloud));if(value)cloud=value;return {committed:!!value,snapshot:{val:()=>copy(cloud)}};}};
  app.tradingHistory=[{id:'trade'}];assert.equal(await app.saveData(),true);
  assert.equal(cloud.data.tradingHistory[0].id,'trade');
  cloud.revision++;cloud.data.portfolios=[p(10000)];
  app.portfolios=[p(15000)];assert.equal(await app.saveData(),false);
  assert.equal(cloud.data.portfolios[0].cashBufferUSD,10000);
});
test('Thai native valuation is unchanged by FX; exported markdown preserves precision and years',()=>{
  const {app}=runtime();app.exchangeRate=33;
  assert.equal(app.calculateHoldingStats({currency:'THB',shares:1,avgCostNative:300,currentPriceNative:320}).marketValueTHB,320);
  app.portfolios=[{...p(),name:'A|B',holdings:[{ticker:'MSFT',shares:.0036587,avgCostUSD:428.356,currentPriceUSD:493.95}]}];
  app.quarterlySnapshots=[{year:2025,quarter:'Q1',date:'2025-03-31',recordedAt:'2025-03-31T12:00:00Z',totalUSD:1111,exchangeRate:30,portValuesUSD:{p:1111}},{year:2026,quarter:'Q1',date:'2026-03-31',recordedAt:'2026-03-31T12:00:00Z',totalUSD:2222,exchangeRate:30,portValuesUSD:{p:2222}}];
  const md=app.generateObsidianMarkdown();
  for(const value of ['0.0036587','428.356','Q1/2025','Q1/2026','A\\|B'])assert.ok(md.includes(value));
  assert.ok(!md.includes('- #'));
});

test('daily totals use prior values and include idle cash',()=>{
  const {app}=runtime();const port={...p(100),holdings:[{shares:1,avgCostUSD:100,currentPriceUSD:200,change1dPct:100},{shares:1,avgCostUSD:100,currentPriceUSD:100,change1dPct:0}]};
  app.portfolios=[port];assert.ok(Math.abs(app.calculatePortfolioStats(port).avg1dChangePct-100/3)<1e-10);
  assert.ok(Math.abs(app.calculateGrandTotalStats().avg1dChangePct-100/3)<1e-10);
});
test('cash form keeps transaction FX, rejects overdraft and records its date',async()=>{
  const {app,fields,sandbox}=runtime();app.portfolios=[p(100)];let action='DEPOSIT';let saves=0;
  sandbox.document.querySelector=()=>({value:action});app.closeModal=()=>{};app.saveData=async()=>{saves++;return true;};
  for(const [id,value]of Object.entries({'cash-buffer-port-id':'p','cash-amount-usd':'50','cash-flow-date':'2026-01-02','cash-flow-fx':'32','cash-note':'A|B'}))fields[id]={value};
  app.saveCashBufferForm();await Promise.resolve();assert.equal(app.portfolios[0].cashBufferUSD,150);assert.equal(app.cashFlows[0].amountTHB,1600);assert.equal(app.cashFlows[0].date,'2026-01-02');
  action='WITHDRAW';fields['cash-amount-usd'].value='151';app.saveCashBufferForm();assert.equal(saves,1);assert.equal(app.portfolios[0].cashBufferUSD,150);
});
test('trade has both asset and cash legs, saves realized profit and never changes quote',async()=>{
  const {app,fields,sandbox}=runtime();app.portfolios=[{...p(100),holdings:[{id:'h',ticker:'MSFT',shares:2,avgCostUSD:20,currentPriceUSD:25}]}];let action='BUY';
  sandbox.document.querySelector=()=>({value:action});app.closeModal=()=>{};app.saveData=async()=>true;
  for(const [id,value]of Object.entries({'trade-stock-select':'p:::h','trade-shares':'1','trade-price':'30','trade-fee-usd':'1','trade-selected-tag':'test','trade-custom-note':''}))fields[id]={value};
  fields['trade-executed-date']={value:'2026-01-02'};fields['trade-executed-time']={value:'12:00'};
  fields['trade-use-cash-buffer']={checked:true};await app.executeTrade();assert.equal(app.portfolios[0].cashBufferUSD,69);assert.equal(app.portfolios[0].holdings[0].currentPriceUSD,25);
  action='SELL';await app.executeTrade();assert.equal(app.portfolios[0].cashBufferUSD,98);assert.ok(Math.abs(app.tradingHistory[0].realizedPLUSD-16/3)<1e-10);assert.equal(app.tradingHistory[0].feeUSD,1);
  assert.equal(app.tradingHistory[0].costBasisUSD,71/3);assert.equal(app.tradingHistory[0].sharesBefore,3);assert.equal(app.tradingHistory[0].sharesAfter,2);
  assert.equal(app.tradingHistory[0].cashBeforeUSD,69);assert.equal(app.tradingHistory[0].cashAfterUSD,98);
  action='BUY';fields['trade-use-cash-buffer'].checked=false;await app.executeTrade();assert.equal(app.cashFlows[0].type,'DEPOSIT');assert.equal(app.cashFlows[0].amountUSD,31);
  assert.equal(app.cashFlows[0].linkedTradeId,app.tradingHistory[0].id);
  assert.equal(core.transactionTimeline(app.dataPayload(),'p').filter(row=>row.kind==='cash').length,0);
});
test('unified transaction history keeps manual funding, trades and realized returns without duplicate trade funding',()=>{
  const data={...core.empty(),portfolios:[{...p(60),holdings:[{id:'h',ticker:'ABC',shares:1,avgCostUSD:80,currentPriceUSD:90}]}],
    tradingHistory:[{id:'sale',date:'2026-09-11T05:00:00Z',type:'SELL',ticker:'ABC',portfolioId:'p',shares:1,priceUSD:50,totalUSD:50,feeUSD:2,netUSD:48,costBasisUSD:100,realizedPLUSD:-52}],
    cashFlows:[{id:'fund',at:'2026-09-01T05:00:00Z',type:'DEPOSIT',portfolioId:'p',amountUSD:100,balanceBeforeUSD:0,balanceAfterUSD:100},{id:'trade-fund',at:'2026-09-11T05:00:00Z',type:'WITHDRAW',portfolioId:'p',amountUSD:48,linkedTradeId:'sale'}],
    dividends:[{portfolioId:'p',date:'2026-09-05',netUSD:5}]};
  const timeline=core.transactionTimeline(data,'p');assert.equal(timeline.length,3);assert.equal(timeline[0].type,'SELL');assert.equal(timeline[1].type,'DIVIDEND');assert.equal(timeline[2].type,'DEPOSIT');
  assert.equal(timeline[0].costBasisUSD,100);assert.equal(timeline[0].realizedPLUSD,-52);
  const result=core.lifetimePerformance(data,'p');assert.equal(result.unrealized,10);assert.equal(result.realized,-52);assert.equal(result.profit,-37);assert.equal(result.measuredCapital,180);
  const {app}=runtime();Object.assign(app,data);const html=app.transactionLedgerHTML('p');assert.ok(html.includes('กำไร/ขาดทุนจริง'));assert.ok(html.includes('ต้นทุนที่ขาย'));assert.ok(html.includes('เงินสด'));assert.ok(!html.includes('trade-fund'));
});
test('failed dividend save does not close form or announce success',async()=>{
  const {app,fields,notices}=runtime();app.portfolios=[{...p(0),holdings:[{id:'h',ticker:'MSFT',shares:1,avgCostUSD:1,currentPriceUSD:1}]}];let closed=false;app.closeModal=()=>closed=true;app.saveData=async()=>false;
  for(const [id,value]of Object.entries({'dividend-date':'2026-01-01','dividend-ticker':'MSFT','dividend-portfolio-id':'p','dividend-gross-usd':'10','dividend-tax-usd':'1','dividend-notes':''}))fields[id]={value};
  fields['dividend-add-to-cash-buffer']={checked:true};await app.saveDividendForm();assert.equal(closed,false);assert.equal(notices.length,0);assert.equal(app.dividends[0].addedToCash,true);
});
test('invalid and duplicate import data is rejected before touching current data',()=>{
  const {app}=runtime();app.portfolios=[p(100)];
  assert.throws(()=>app.handleCloudSync({portfolios:[p(),p()]}));assert.equal(app.portfolios[0].cashBufferUSD,100);
  assert.throws(()=>core.validateImport({portfolios:[{...p(),holdings:[{id:'h',ticker:'X',shares:-1,avgCostUSD:1,currentPriceUSD:1}]}]}));
  assert.deepEqual(core.validateImport(core.empty()),core.empty());
});
test('deleting a funded holding marks the affected period as an adjustment',()=>{
  const {app}=runtime();const before={...core.empty(),portfolios:[{...p(),holdings:[{id:'h',shares:10,avgCostUSD:2}]}]};
  app.cloudBaseline={data:before};const next={...core.empty(),portfolios:[p()],quarterlySnapshots:[{year:2026,quarter:'Q1'}]};app.flagUnexplainedChanges(next);assert.equal(next.cashFlows[0].type,'ADJUSTMENT');
});
test('quarter snapshot includes trading portfolios and immutable holding details',()=>{
  const {app}=runtime();app.portfolios=[p(100)];app.tradingData={a:{name:'Trading',monthlyBalances:[{year:2026,month:2,balanceUSD:50},{year:2026,month:1,balanceUSD:999}]}};
  const s=app.createCurrentPortfolioSnapshot(2026,'Q1','2026-03-31');assert.equal(s.totalUSD,150);assert.equal(s.portValuesUSD['trading:a'],50);app.portfolios[0].cashBufferUSD=0;assert.equal(s.holdings[0].cashBufferUSD,100);
});
test('THB portfolio goals remain fixed in baht and convert to USD for calculations',()=>{
  const {app}=runtime();app.exchangeRate=32;
  const port={...p(),goalCurrency:'THB',goalTHB:3200,goalUSD:999};
  assert.equal(app.getPortfolioGoalUSD(port),100);
  assert.equal(app.calculatePortfolioStats(port).goalUSD,100);
  app.exchangeRate=40;
  assert.equal(app.getPortfolioGoalUSD(port),80);
});
test('lifetime result keeps an old cut loss after rebuy and includes dividends',()=>{
  const data={...core.empty(),portfolios:[{...p(),holdings:[{id:'h2',ticker:'MSFT',shares:1,avgCostUSD:90,currentPriceUSD:100}]}],
    tradingHistory:[{id:'old-sale',type:'SELL',portfolioId:'p',totalUSD:60,realizedPLUSD:-40,feeUSD:1}],dividends:[{portfolioId:'p',netUSD:5}]};
  const result=core.lifetimePerformance(data);
  assert.equal(result.unrealized,10);assert.equal(result.realized,-40);assert.equal(result.dividends,5);assert.equal(result.profit,-25);
});
test('wealth subtracts liabilities and both gauges always stay in range',()=>{
  const data={...core.empty(),exchangeRate:40,portfolios:[p(100)],wealthAssets:[{id:'gold',type:'metal',name:'Gold',currency:'THB',value:4000,cost:3000,valuedAt:'2026-09-12'}],liabilities:[{id:'loan',type:'loan',name:'Loan',currency:'USD',balance:50,monthlyPayment:5}]};
  const result=core.wealth(data);assert.equal(result.assetsUSD,200);assert.equal(result.liabilitiesUSD,50);assert.equal(result.netWorthUSD,150);
  for(const score of [core.wealthStrength(data).score,core.portfolioHealth(data).score])assert.ok(score>=0&&score<=100);
});
test('benchmark cache survives cloud normalization',()=>{
  const cache={updatedAt:'2026-09-12T00:00:00Z',points:{'2026-03-31':{SPY:{total:100,price:99}}}};
  assert.deepEqual(core.normalize({benchmarkCache:cache}).benchmarkCache,cache);
});
test('authenticated form can recover the cloud baseline without reloading the page',async()=>{
  const {app}=runtime();
  const cloud={schemaVersion:4,revision:7,generation:'current',data:{...core.empty(),portfolios:[p(250)]}};
  app.cloudReady=false;app.isFirebaseOnline=true;app.authUser={uid:'owner'};
  app.dbRef={once:async()=>({val:()=>copy(cloud)})};
  assert.equal(await app.recoverCloudReady(),true);
  assert.equal(app.cloudReady,true);assert.equal(app.revision,7);assert.equal(app.portfolios[0].cashBufferUSD,250);
});
test('cloud selects an existing first portfolio when the previous id no longer exists',()=>{
  const {app}=runtime();app.selectedPortfolioId='deleted';
  app.acceptCloud({schemaVersion:4,revision:1,generation:'g',data:{...core.empty(),portfolios:[{...p(),id:'first'}]}});
  assert.equal(app.selectedPortfolioId,'first');
});
test('queued form submit retries automatically after cloud readiness recovers',async()=>{
  const {app,sandbox}=runtime();let submitted=0;
  const form={requestSubmit:()=>submitted++};
  app.pendingCloudForms=new WeakSet();app.recoverCloudReady=async()=>true;
  sandbox.document.contains=value=>value===form;sandbox.setTimeout=callback=>callback();
  app.retryFormWhenCloudReady(form);
  await Promise.resolve();await Promise.resolve();
  assert.equal(submitted,1);
});
test('JSON backup round trip preserves every persisted collection',()=>{
  const {app}=runtime();
  const source={...core.empty(),portfolios:[p(12)],tradingData:{risk:{name:'Risk',monthlyBalances:[{year:2026,month:9,balanceUSD:9}]}},tradingHistory:[{id:'t',type:'SELL',realizedPLUSD:-2}],dividends:[{id:'d',ticker:'MSFT',netUSD:1}],cashFlows:[{id:'f',type:'DEPOSIT',amountUSD:3,amountTHB:99,at:'2026-09-01T12:00:00Z'}],wealthAssets:[{id:'a',name:'Gold',currency:'USD',value:4,valuedAt:'2026-09-01'}],liabilities:[{id:'l',name:'Loan',currency:'USD',balance:5}],quarterlySnapshots:[{year:2026,quarter:'Q3',date:'2026-09-30',recordedAt:'2026-09-30T12:00:00Z',totalUSD:12,exchangeRate:33,portValuesUSD:{p:12}}],achievements:[{id:'x'}],benchmarkCache:{updatedAt:'2026-09-12T00:00:00Z',points:{}}};
  Object.assign(app,source);
  const restored=core.validateImport(JSON.parse(JSON.stringify(app.dataPayload())));
  assert.deepEqual(restored,core.normalize(source));
});
test('dividend ticker matching ignores case and .BK suffix',()=>{
  const {app}=runtime();app.portfolios=[{...p(),id:'thai',holdings:[{id:'h',ticker:'PTT.BK',shares:1,avgCostUSD:1,currentPriceUSD:1}]}];
  assert.equal(app.findDividendHoldingMatches('ptt').length,1);assert.equal(app.findDividendHoldingMatches('PTT.BK')[0].portfolio.id,'thai');
});
test('dashboard uses a goal progress bar and omits the retired allocation mosaic',()=>{
  const {app}=runtime();
  app.portfolios=[{...p(500),goalUSD:1000,name:'Goal portfolio'}];
  const card=app.dashboardPortfolioCard(app.portfolios[0],0);
  assert.ok(card.includes('class="portfolio-progress-bar"'));
  assert.ok(card.includes('width:50%'));
  assert.ok(card.includes('50.0% ของเป้าหมาย'));
  assert.ok(!card.includes('เหลืออีก'));
  assert.ok(!card.includes('wolf-port-ring'));
  const container={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  app.renderDashboardView(container);
  assert.ok(!container.innerHTML.includes('dashboard-heatmap-container'));
});
test('investment scope removes health and debt UI while retaining legacy backup data',()=>{
  const {app}=runtime();
  app.liabilities=[{id:'legacy',name:'Old debt',currency:'THB',balance:100000,payments:[]}];
  const before=JSON.stringify(app.dataPayload());
  const container={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  app.renderDashboardView(container);
  assert.ok(!container.innerHTML.includes('wolf-gauge'));
  assert.ok(!container.innerHTML.includes('สุขภาพ'));
  assert.ok(!container.innerHTML.includes('ความมั่งคั่งสุทธิ'));
  app.renderWealthView(container);
  assert.ok(container.innerHTML.includes('สินทรัพย์ที่บันทึกทั้งหมด'));
  assert.ok(!container.innerHTML.includes('data-pay-debt'));
  assert.ok(!container.innerHTML.includes('data-add-wealth="liability"'));
  assert.ok(!container.innerHTML.includes('Old debt'));
  assert.equal(JSON.stringify(app.dataPayload()),before);
});
test('debt payment preserves history, reduces principal only and archives at zero',async()=>{
  const {app,fields}=runtime();app.liabilities=[{id:'loan',name:'Loan',type:'loan',currency:'THB',balance:100,monthlyPayment:10,payments:[]}];app.saveData=async()=>true;app.closeModal=()=>{};app.renderActiveTab=()=>{};
  for(const [id,value]of Object.entries({'debt-payment-id':'loan','debt-payment-record-id':'','debt-payment-date':'2026-09-13','debt-payment-principal':'100','debt-payment-interest':'7','debt-payment-note':'final'}))fields[id]={value};
  await app.saveDebtPayment();const debt=app.liabilities[0];assert.equal(debt.balance,0);assert.equal(debt.status,'paid');assert.equal(debt.payments[0].total,107);assert.equal(debt.payments[0].balanceAfter,0);
});
test('editing and deleting an old debt payment rebuilds every later balance',async()=>{
  const {app,fields}=runtime();app.saveData=async()=>true;app.closeModal=()=>{};app.renderActiveTab=()=>{};
  app.liabilities=[{id:'loan',name:'Loan',type:'loan',currency:'THB',openingBalance:100,balance:50,status:'active',monthlyPayment:10,payments:[
    {id:'first',date:'2026-08-01',principal:30,interest:3,total:33,balanceBefore:100,balanceAfter:70,note:'first'},
    {id:'second',date:'2026-09-01',principal:20,interest:2,total:22,balanceBefore:70,balanceAfter:50,note:'second'}
  ]}];
  for(const [id,value]of Object.entries({'debt-payment-id':'loan','debt-payment-record-id':'first','debt-payment-date':'2026-08-01','debt-payment-principal':'40','debt-payment-interest':'4','debt-payment-note':'corrected'}))fields[id]={value};
  await app.saveDebtPayment();let debt=app.liabilities[0];assert.equal(debt.balance,40);assert.equal(debt.payments[0].balanceAfter,60);assert.equal(debt.payments[1].balanceBefore,60);assert.equal(debt.payments[1].balanceAfter,40);
  await app.deleteDebtPayment('loan','second');debt=app.liabilities[0];assert.equal(debt.balance,60);assert.equal(debt.payments.length,1);assert.equal(debt.payments[0].balanceAfter,60);assert.equal(debt.status,'active');
});
test('portfolio and risk investment order changes are persisted in data order fields',async()=>{
  const {app}=runtime();app.portfolios=[{...p(),id:'a'},{...p(),id:'b'}];app.tradingData={x:{name:'X',order:1,monthlyBalances:[]},y:{name:'Y',order:2,monthlyBalances:[]}};app.saveData=async()=>true;app.renderActiveTab=()=>{};
  await app.movePortfolio('b',-1);assert.deepEqual(app.portfolios.map(row=>row.id),['b','a']);
  await app.moveTradingPortfolio('y',-1);assert.equal(app.tradingData.y.order,1);assert.equal(app.tradingData.x.order,2);
});
