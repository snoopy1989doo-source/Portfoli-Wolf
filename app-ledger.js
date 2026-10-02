/* A single read-only activity view for executed trades and cash movements. */
(function(){
  'use strict';
  const proto=PixelStewardApp.prototype;
  const dashboard=proto.renderDashboardView,portfolios=proto.renderPortfoliosView;
  const knownNumber=value=>typeof value==='number'&&Number.isFinite(value);
  Object.assign(proto,{
    transactionLedgerHTML(portfolioId=null,compact=false){
      const rows=PortfolioCore.transactionTimeline(this.dataPayload(),portfolioId);
      const life=PortfolioCore.lifetimePerformance(this.dataPayload(),portfolioId);
      const money=value=>this.formatDual(value).main;
      const signed=value=>`${value>=0?'+':''}${money(value)}`;
      const summary=`<div class="transaction-summary"><div><span>กำไร/ขาดทุนที่ยังถือ</span><strong class="${life.unrealized>=0?'text-emerald':'text-rose'}">${signed(life.unrealized)}</strong></div><div><span>กำไร/ขาดทุนขายแล้ว</span><strong class="${life.realized>=0?'text-emerald':'text-rose'}">${signed(life.realized)}</strong></div><div><span>ปันผลสุทธิ</span><strong>${money(life.dividends)}</strong></div><div><span>ผลรวมจากข้อมูลที่บันทึก</span><strong class="${life.profit>=0?'text-emerald':'text-rose'}">${signed(life.profit)}</strong></div></div>`;
      const line=row=>{
        const date=row.at&&Number.isFinite(Date.parse(row.at))?new Date(row.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ไม่ทราบเวลา';
        const title=row.kind==='trade'?`${row.manualResult?'ผลขายย้อนหลัง':row.type==='BUY'?'ซื้อ':'ขาย'} ${row.ticker||''}`:row.kind==='dividend'?`ปันผล ${row.ticker||''}`:({DEPOSIT:'ฝากเงิน',WITHDRAW:'ถอนเงิน',ADJUSTMENT:'ปรับยอด'}[row.type]||row.type);
        let details='';
        if(row.kind==='trade'){
          details=row.manualResult?`<span>บันทึกผลขายย้อนหลัง · ยอดขาย ${money(row.grossUSD)} · ค่าธรรมเนียม ${money(row.feeUSD)}</span>`:`<span>${row.shares} หุ้น × ${money(row.priceUSD)} · ยอดรายการ ${money(row.grossUSD)} · ค่าธรรมเนียม ${money(row.feeUSD)}</span>`;
          if(knownNumber(row.sharesBefore)&&knownNumber(row.sharesAfter))details+=`<span>หุ้นคงเหลือ ${row.sharesBefore} → ${row.sharesAfter}</span>`;
          if(row.type==='SELL'&&knownNumber(row.realizedPLUSD))details+=`<span class="${row.realizedPLUSD>=0?'text-emerald':'text-rose'}">ต้นทุนที่ขาย ${money(row.costBasisUSD||0)} · กำไร/ขาดทุนจริง ${signed(row.realizedPLUSD)}</span>`;
          if(row.type==='BUY')details+=`<span>จ่ายจริงรวมค่าธรรมเนียม ${money(row.netUSD)}</span>`;
          if(knownNumber(row.portfolioValueBeforeUSD)&&knownNumber(row.portfolioValueAfterUSD))details+=`<span>มูลค่าพอร์ต ณ ราคาที่บันทึก ${money(row.portfolioValueBeforeUSD)} → ${money(row.portfolioValueAfterUSD)}</span>`;
        }else if(row.kind==='dividend'){
          details=`<span>รับสุทธิ ${money(row.amountUSD)}${row.addedToCash?' · เพิ่มเงินสดในพอร์ตแล้ว':''}</span>`;
        }else{
          details=`<span>${row.type==='ADJUSTMENT'?'ผลต่าง':'จำนวน'} ${money(row.amountUSD)}</span>`;
          if(knownNumber(row.cashBeforeUSD)&&knownNumber(row.cashAfterUSD))details+=`<span>เงินสด ${money(row.cashBeforeUSD)} → ${money(row.cashAfterUSD)}</span>`;
        }
        if(row.note)details+=`<span>หมายเหตุ: ${this.escapeHtml(row.note)}</span>`;
        return `<li class="transaction-row" data-ledger-type="${this.escapeHtml(row.type)}" data-ledger-search="${this.escapeHtml((title+' '+row.portfolioName+' '+(row.note||'')).toLowerCase())}"><div class="transaction-row-head"><b>${this.escapeHtml(title)}</b><time>${this.escapeHtml(date)}</time></div><small>${this.escapeHtml(row.portfolioName||'')}</small><div class="transaction-row-detail">${details}</div></li>`;
      };
      const controls=compact?'':`<div class="transaction-controls"><label>ค้นหารายการ<input type="search" class="form-input" data-ledger-query placeholder="หุ้น พอร์ต หรือหมายเหตุ"></label><label>ประเภท<select class="form-select" data-ledger-filter><option value="ALL">ทั้งหมด</option><option value="BUY">ซื้อ</option><option value="SELL">ขาย</option><option value="DEPOSIT">ฝาก</option><option value="WITHDRAW">ถอน</option><option value="DIVIDEND">ปันผล</option><option value="ADJUSTMENT">ปรับยอด</option></select></label></div>`;
      return `<section class="overview-section transaction-ledger ${compact?'transaction-ledger-compact':''}"><div class="section-header"><div><h3>ประวัติธุรกรรม${portfolioId?'ของพอร์ตนี้':''}</h3><p class="market-caption">ซื้อขายและฝากถอนที่บันทึกไว้ · ผลกำไรขายแล้วหักค่าธรรมเนียม · ยอดพอร์ต ณ ราคาที่บันทึก ไม่ใช่กำไรของรายการ</p></div>${compact?'<button class="btn btn-secondary" data-ledger-open>ดูในหน้าพอร์ต</button>':''}</div>${summary}${controls}<ol class="transaction-list">${(compact?rows.slice(0,5):rows).map(line).join('')||'<li class="transaction-empty">ยังไม่มีธุรกรรม</li>'}</ol>${!compact&&rows.length>12?'<button class="btn btn-secondary" data-ledger-more>ดูรายการเพิ่ม</button>':''}</section>`;
    },
    bindLedger(container){
      const section=container.querySelector('.transaction-ledger');if(!section)return;
      section.querySelector('[data-ledger-open]')?.addEventListener('click',()=>this.switchTab('portfolios'));
      const input=section.querySelector('[data-ledger-query]'),filter=section.querySelector('[data-ledger-filter]'),more=section.querySelector('[data-ledger-more]');
      let shown=12;
      const refresh=()=>{let visible=0;const term=(input?.value||'').trim().toLowerCase(),type=filter?.value||'ALL';for(const row of section.querySelectorAll('.transaction-row')){const match=(type==='ALL'||row.dataset.ledgerType===type)&&(!term||row.dataset.ledgerSearch.includes(term));row.hidden=!match||(!term&&type==='ALL'&&visible>=shown);if(match)visible++;}if(more)more.hidden=!!term||type!=='ALL'||visible<=shown;};
      input?.addEventListener('input',refresh);filter?.addEventListener('change',refresh);more?.addEventListener('click',()=>{shown+=20;refresh();});refresh();
    },
    renderDashboardView(container){
      dashboard.call(this,container);
      const title=container.querySelector('.lifetime-result > span');if(title)title.textContent='ผลลงทุนรวมจากข้อมูลที่บันทึก';
      const portSection=container.querySelector('.wolf-portfolio-grid')?.closest('.overview-section');
      if(portSection){portSection.insertAdjacentHTML('beforebegin',this.transactionLedgerHTML(null,true));this.bindLedger(container);}
    },
    renderPortfoliosView(container){
      portfolios.call(this,container);
      const port=this.portfolios.find(p=>p.id===this.selectedPortfolioId)||this.portfolios[0];
      if(!port)return;
      container.insertAdjacentHTML('beforeend',this.transactionLedgerHTML(port.id));this.bindLedger(container);
      container.addEventListener('click',event=>{const button=event.target.closest('[data-ledger-ticker]');if(!button)return;const section=container.querySelector('.transaction-ledger'),input=section?.querySelector('[data-ledger-query]');if(!input)return;input.value=button.dataset.ledgerTicker;input.dispatchEvent(new Event('input',{bubbles:true}));section.scrollIntoView({behavior:'smooth',block:'start'});});
    }
  });
})();
