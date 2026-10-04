/* Dashboard calculations: no browser or persistence side effects. */
(function(root,factory){const api=factory(typeof module==='object'?require('./portfolio-core.js'):root.PortfolioCore);if(typeof module==='object')module.exports=api;else root.DashboardCore=api;})(globalThis,function(core){
  'use strict';
  const excluded=new Set(['BTC','ETH','BNB','SOL','XRP','DOGE','CASH','USD','THB','SSO','KEPT','กอช.']);
  const stock=h=>h.assetType!=='manual'&&!excluded.has(String(h.ticker).toUpperCase())&&Number(h.shares)>0;
  function summary(data,quotes={}){
    const stocks={...data,portfolios:data.portfolios.map(p=>({...p,holdings:p.holdings.filter(stock)}))};
    const groups=new Map();let stockValue=0,stockCash=0,missing=0;
    for(const p of stocks.portfolios){stockCash+=Number(p.cashBufferUSD)||0;for(const h of p.holdings){
      const ticker=h.ticker.trim().toUpperCase(),v=core.holdingValues(h,data.exchangeRate);stockValue+=v.value;
      if(!groups.has(ticker))groups.set(ticker,{ticker,shares:0,portfolios:[],candidates:[]});
      const g=groups.get(ticker);g.shares+=Number(h.shares);if(!g.portfolios.includes(p.id))g.portfolios.push(p.id);g.candidates.push(h);
    }}
    const rows=[];
    for(const g of groups.values()){
      const h=g.candidates.sort((a,b)=>(Date.parse(b.priceMarketAt||b.priceReceivedAt)||0)-(Date.parse(a.priceMarketAt||a.priceReceivedAt)||0))[0];
      const q=quotes[g.ticker],price=q?.priceUSD??core.holdingValues(h,data.exchangeRate).value/Number(h.shares);
      const pct=q?q.change1dPct:h.change1dPct;
      const previous=Number.isFinite(pct)&&pct>-100?(q?.previousCloseUSD??price/(1+pct/100)):null;
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(previous)||previous<=0){missing++;continue;}
      const priorValue=g.shares*previous,profitUSD=g.shares*(price-previous);
      rows.push({ticker:g.ticker,name:h.name||g.ticker,portfolios:g.portfolios,price,previous,priorValue,profitUSD,pct:(price/previous-1)*100,at:q?.marketAt||h.priceMarketAt||null});
    }
    const prior=rows.reduce((s,r)=>s+r.priorValue,0),daily=rows.reduce((s,r)=>s+r.profitUSD,0);
    const trading=Object.values(data.tradingData||{}).reduce((sum,t)=>sum+(Number([...t.monthlyBalances||[]].sort((a,b)=>b.year*12+b.month-a.year*12-a.month)[0]?.balanceUSD)||0),0);
    const total=core.wealth(data).assetsUSD,other=total-stockValue-stockCash-trading;
    const otherCash=(data.wealthAssets||[]).filter(a=>a.type==='cash').reduce((s,a)=>s+Number(a.value)/(a.currency==='THB'?data.exchangeRate:1),0);
    return {stockValue,stockCash,trading,other,total,otherCash,rows,missing,daily,dailyPct:prior?daily/prior*100:null,profit:core.lifetimePerformance(stocks).profit};
  }
  function rank(rows,mode='impact'){const metric=mode==='percent'?'pct':'profitUSD';return {winners:rows.filter(r=>r[metric]>1e-9).sort((a,b)=>b[metric]-a[metric]||a.ticker.localeCompare(b.ticker)).slice(0,5),losers:rows.filter(r=>r[metric]<-1e-9).sort((a,b)=>a[metric]-b[metric]||a.ticker.localeCompare(b.ticker)).slice(0,5)};}
  function transactionAmount(row){if(row.kind==='trade')return (row.type==='BUY'?-1:1)*row.netUSD;return row.amountUSD;}
  function alertHit(alert,price){return Number.isFinite(price)&&price>0&&(alert.type==='buy'||alert.type==='stop_loss'?price<=alert.targetPrice:price>=alert.targetPrice);}
  function chartRows(history,range,now=Date.now()){const days={ '1W':7,'1M':30,'3M':90,'1Y':365 };const start=now-(days[range]||36500)*86400000;return history.filter(r=>Date.parse(r.at)>=start&&Date.parse(r.at)<=now).sort((a,b)=>a.at.localeCompare(b.at));}
  return {summary,rank,stock,transactionAmount,alertHit,chartRows};
});
