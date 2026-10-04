/* Free open-web market updates. Quotes and alert delivery never write to Cloud. */
(function(){
  'use strict';
  const proto=PixelStewardApp.prototype,baseSetup=proto.setupOnlineUI,baseAccept=proto.acceptCloud,baseClose=proto.closeModal;
  const key=t=>String(t||'').trim().toUpperCase();
  const excluded=new Set(['BTC','ETH','BNB','SOL','XRP','DOGE','CASH','THB','USD','SSO','KEPT','กอช.']);
  Object.assign(proto,{
    setupOnlineUI(){
      baseSetup.call(this);
      this.marketQuotes={};this.priceAlertStates={};this.priceAlertHistory=[];
      document.addEventListener('visibilitychange',()=>this.ensureMarketStream());
      window.addEventListener('pagehide',()=>this.stopMarketStream());
      window.addEventListener('pageshow',()=>this.ensureMarketStream());
      document.getElementById('btn-save-finnhub-key')?.addEventListener('click',()=>{this.stopMarketStream();this.ensureMarketStream();});
    },
    acceptCloud(value){
      if(this.generation&&this.generation!==value.generation){this.marketQuotes={};this.priceAlertStates={};this.priceAlertHistory=[];}
      baseAccept.call(this,value);
      this.mergeMarketQuotes();this.ensureMarketStream();
      if(!this.saving&&!this.viewDirty&&!document.querySelector('.modal-backdrop.open'))this.renderActiveTab();
    },
    closeModal(id){baseClose.call(this,id);this.mergeMarketQuotes();if(!this.saving&&!this.viewDirty)this.renderActiveTab();},
    marketStreamSymbols(){return [...new Set((this.portfolios||[]).flatMap(p=>(p.holdings||[]).filter(h=>h.assetType!=='manual'&&Number(h.shares)>0).map(h=>key(h.ticker))))].filter(t=>!excluded.has(t)&&!t.endsWith('.BK')).sort().slice(0,50);},
    stopMarketStream(){
      clearTimeout(this.marketReconnect);this.marketReconnect=null;
      if(this.marketSocket){const socket=this.marketSocket;this.marketSocket=null;socket.onclose=null;socket.close();}
      this.marketStreamSignature=null;
    },
    ensureMarketStream(){
      const symbols=this.marketStreamSymbols();
      if(!this.cloudReady||!this.isFirebaseOnline||!this.finnhubApiKey||!symbols.length||typeof WebSocket==='undefined'){
        this.stopMarketStream();this.marketStreamState=this.finnhubApiKey?'พักการรับราคาต่อเนื่อง':'ดึงราคาฟรีเป็นรอบ 60 วินาที · ใส่ Finnhub Key เพื่อรับราคาหุ้น US ต่อเนื่อง';return;
      }
      const signature=this.finnhubApiKey+'|'+symbols.join(',');
      if(this.marketSocket&&this.marketStreamSignature===signature)return;
      this.stopMarketStream();this.marketStreamSignature=signature;
      this.marketStreamState='กำลังเชื่อมต่อราคาหุ้น US ต่อเนื่อง';
      let socket;try{socket=new WebSocket('wss://ws.finnhub.io?token='+encodeURIComponent(this.finnhubApiKey));}catch(_){this.scheduleMarketReconnect();return;}
      this.marketSocket=socket;
      socket.onopen=()=>{if(this.marketSocket!==socket)return;this.marketReconnectDelay=2000;this.marketStreamState='เชื่อมต่อ Finnhub streaming · หุ้น US สูงสุด 50 Ticker · ตลาดอื่นดึงเป็นรอบ';symbols.forEach(symbol=>socket.send(JSON.stringify({type:'subscribe',symbol})));this.refreshMarketView();};
      socket.onmessage=event=>{if(this.marketSocket!==socket)return;try{const message=JSON.parse(event.data);if(message.type==='trade'&&Array.isArray(message.data))this.receiveMarketTrades(message.data);else if(message.type==='error'){this.marketStreamState='บริการ streaming ปฏิเสธคำขอ · ใช้ราคาดึงเป็นรอบ';this.stopMarketStream();this.refreshMarketView();}}catch(_){};};
      socket.onerror=()=>{this.marketStreamState='Streaming ขัดข้อง · ใช้ราคาดึงเป็นรอบ';this.refreshMarketView();};
      socket.onclose=()=>{if(this.marketSocket!==socket)return;this.marketSocket=null;this.marketStreamSignature=null;this.marketStreamState='Streaming หลุด · กำลังเชื่อมต่อใหม่และดึงราคาสำรอง';this.scheduleMarketReconnect();this.refreshMarketView();};
    },
    scheduleMarketReconnect(){
      clearTimeout(this.marketReconnect);const delay=this.marketReconnectDelay||2000;this.marketReconnectDelay=Math.min(delay*2,60000);
      this.marketReconnect=setTimeout(()=>this.ensureMarketStream(),delay);
    },
    receiveMarketTrades(trades){
      const updates={};
      for(const trade of trades){const ticker=key(trade.s),price=Number(trade.p),time=Number(trade.t);if(!Number.isFinite(price)||!(price>0)||!Number.isFinite(time)||time<=0||!this.marketStreamSymbols().includes(ticker))continue;
        const prior=updates[ticker];if(prior&&Date.parse(prior.marketAt)>=time)continue;
        const reference=this.marketQuotes?.[ticker];const freshReference=reference?.previousCloseUSD>0&&Date.now()-Date.parse(reference.referenceAt||0)<90000;
        if(!reference?.regularSession||time<reference.regularSession.start||time>=reference.regularSession.end)continue;
        updates[ticker]={priceUSD:price,change1dPct:freshReference?(price/reference.previousCloseUSD-1)*100:null,previousCloseUSD:reference?.previousCloseUSD,referenceAt:reference?.referenceAt,regularSession:reference?.regularSession||null,source:'Finnhub streaming',marketAt:new Date(time).toISOString()};
      }
      this.applyMarketUpdates(updates);this.refreshMarketView();
    },
    applyMarketUpdates(updates){
      this.marketQuotes||={};const receivedAt=new Date().toISOString();
      for(const [ticker,quote]of Object.entries(updates)){
        if(!Number.isFinite(quote.priceUSD)||!(quote.priceUSD>0))continue;
        const old=this.marketQuotes[ticker];if(old?.marketAt&&quote.marketAt&&Date.parse(old.marketAt)>Date.parse(quote.marketAt)){if(quote.previousCloseUSD>0){old.previousCloseUSD=quote.previousCloseUSD;old.referenceAt=quote.referenceAt;old.change1dPct=(old.priceUSD/quote.previousCloseUSD-1)*100;}continue;}
        this.marketQuotes[ticker]={...quote,receivedAt,...(ticker.endsWith('.BK')?{priceNativeTHB:quote.priceUSD*this.exchangeRate}:{})};this.evaluatePriceAlerts(ticker,this.marketQuotes[ticker]);
      }
      this.mergeMarketQuotes();
    },
    mergeMarketQuotes(){
      // An open edit form keeps its baseline; the latest quotes wait until it closes.
      if(this.saving||this.viewDirty||document.querySelector('.modal-backdrop.open'))return;
      for(const port of this.portfolios||[])for(const h of port.holdings||[]){const q=this.marketQuotes?.[key(h.ticker)];if(!q||h.assetType==='manual')continue;
        h.currentPriceUSD=q.priceUSD;if(h.currency==='THB'){h.currentPriceNative=q.priceNativeTHB??q.priceUSD*this.exchangeRate;h.currentPriceUSD=h.currentPriceNative/this.exchangeRate;}
        h.change1dPct=q.change1dPct;h.priceReceivedAt=q.receivedAt;h.priceMarketAt=q.marketAt||null;h.priceSource=q.source;}
    },
    refreshMarketView(){
      if(this.marketRenderTimer)return;
      this.marketRenderTimer=setTimeout(()=>{this.marketRenderTimer=null;if(!this.saving&&!this.viewDirty&&!document.querySelector('.modal-backdrop.open')){this.mergeMarketQuotes();this.renderSpecCountersBar();this.renderActiveTab();}},250);
    },
    evaluatePriceAlerts(ticker,quote){
      if(!this.cloudReady||!this.isFirebaseOnline)return;
      this.priceAlertStates||={};this.priceAlertHistory||=[];
      for(const port of this.portfolios||[])for(const h of port.holdings||[]){if(key(h.ticker)!==ticker||h.assetType==='manual')continue;
        const rules=[['dipTarget1','เข้าซื้อ ไม้ 1','below'],['dipTarget2','เข้าซื้อ ไม้ 2','below'],['dipTarget3','เข้าซื้อ ไม้ 3','below'],['sellTargetUSD','ขายทำกำไร','above'],['stopLossUSD','ขายจำกัดขาดทุน','below']];
        for(const [field,label,direction]of rules){const target=Number(h[field]||(field==='dipTarget1'?h.dipTargetUSD:0));if(!Number.isFinite(target)||!(target>0))continue;
          const id=[port.id,h.id,field,target].join('|'),hit=direction==='above'?quote.priceUSD>=target:quote.priceUSD<=target;
          const already=this.priceAlertStates[id];this.priceAlertStates[id]=hit;
          if(!hit||already)continue;
          const record={ticker,portfolio:port.name,label,target,price:quote.priceUSD,at:new Date().toISOString(),marketAt:quote.marketAt,source:quote.source};
          this.priceAlertHistory.unshift(record);this.priceAlertHistory=this.priceAlertHistory.slice(0,30);
          this.showToast({title:`${ticker} ถึงจุด${label}`,message:`${port.name} · ราคา $${quote.priceUSD.toFixed(4)} · จุดที่ตั้ง $${target.toFixed(4)} · ${quote.source}`,type:'info',duration:10000});
        }
      }
    },
    marketPanelHTML(){
      const history=this.priceAlertHistory||[];
      return `<section class="market-live-panel"><p role="status">${this.escapeHtml(this.marketStreamState||'ราคาฟรีอัปเดตเป็นรอบ 60 วินาที')}</p><small>กำไร/ขาดทุนคำนวณใหม่เมื่อได้รับราคา · ความหน่วงขึ้นกับแหล่งข้อมูล · Alert ทำงานเมื่อเว็บเปิด · ไม่ส่งคำสั่งซื้อขาย</small><details><summary>แจ้งเตือนราคาในรอบการเปิดเว็บนี้ (${history.length})</summary>${history.length?`<ol class="price-alert-history">${history.map(r=>`<li><b>${this.escapeHtml(r.ticker)} · ${this.escapeHtml(r.label)}</b><span>${this.escapeHtml(r.portfolio)} · $${r.price.toFixed(4)} (ตั้ง $${r.target.toFixed(4)})</span><small>${this.escapeHtml(new Date(r.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))} · ${this.escapeHtml(r.source)}</small></li>`).join('')}</ol>`:'<p>ยังไม่มีราคาแตะจุดที่ตั้งไว้ ตั้งจุดซื้อ/ขายในแบบฟอร์มแก้ไขหุ้นได้</p>'}</details></section>`;
    }
  });
})();
