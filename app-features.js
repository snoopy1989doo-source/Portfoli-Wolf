/* Interaction features that build on the online data layer. */
(function () {
  'use strict';
  if(typeof Chart!=='undefined'){
    Chart.defaults.color='#aab6c7';
    Chart.defaults.font.family="'Kanit', system-ui, sans-serif";
    Chart.defaults.font.size=13;
    Chart.defaults.borderColor='rgba(148,163,184,.12)';
    Chart.defaults.plugins.legend.labels.usePointStyle=true;
    Chart.defaults.plugins.legend.labels.padding=20;
    Chart.defaults.plugins.tooltip.backgroundColor='#172233';
    Chart.defaults.plugins.tooltip.padding=12;
    Chart.defaults.elements.line.borderWidth=2;
    Chart.defaults.elements.point.radius=3;
    Chart.defaults.elements.point.hoverRadius=5;
  }
  const proto=PixelStewardApp.prototype;
  const baseSetup=proto.setupOnlineUI;
  const baseOpenModal=proto.openModal;
  const baseOpenDividend=proto.openDividendModal;
  const baseRenderTrading=proto.renderTradingView;

  const normalizeTicker=value=>String(value||'').trim().toUpperCase().replace(/\.BK$/,'');

  Object.assign(proto, {
    openModal(id) {
      if(id==='modal-trade'){
        const now=new Date(),date=document.getElementById('trade-executed-date'),time=document.getElementById('trade-executed-time');
        if(date)date.value=PortfolioCore.bangkokDate();
        if(time)time.value=now.toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});
        for(const key of ['trade-commission-usd','trade-vat-usd','trade-exchange-fee-usd','trade-taf-fee-usd','trade-fee-usd']){const input=document.getElementById(key);if(input)input.value='0';}
      }
      return baseOpenModal.call(this,id);
    },
    setupOnlineUI() {
      baseSetup.call(this);
      document.getElementById('online-status')?.remove();

      const dividendSelect=document.getElementById('dividend-portfolio-id');
      const dividendGroup=dividendSelect?.closest('.form-group');
      if(dividendSelect&&dividendGroup){
        dividendSelect.required=false;
        dividendGroup.id='dividend-portfolio-group';
        dividendGroup.hidden=true;
        dividendGroup.insertAdjacentHTML('beforebegin','<div id="dividend-ticker-resolution" class="ticker-resolution" role="status">พิมพ์ Ticker เพื่อค้นหาพอร์ตอัตโนมัติ</div>');
        document.getElementById('dividend-ticker')?.addEventListener('input',()=>this.updateDividendPortfolioResolution());
      }

      const fee=document.getElementById('trade-fee-usd');
      if(fee){
        const group=fee.closest('.form-group');
        group.className='form-group trade-fees-panel';
        group.innerHTML='<details><summary>ค่าธรรมเนียมและภาษี (ถ้ามี)</summary><input type="hidden" id="trade-fee-usd" value="0"><div class="form-row"><label class="form-group flex-1">Commission (USD)<input id="trade-commission-usd" type="number" min="0" step="any" value="0" class="form-input font-mono"></label><label class="form-group flex-1">VAT (USD)<input id="trade-vat-usd" type="number" min="0" step="any" value="0" class="form-input font-mono"></label></div><div class="form-row"><label class="form-group flex-1">Exchange fee (USD)<input id="trade-exchange-fee-usd" type="number" min="0" step="any" value="0" class="form-input font-mono"></label><label class="form-group flex-1">TAF fee (USD)<input id="trade-taf-fee-usd" type="number" min="0" step="any" value="0" class="form-input font-mono"></label></div></details>';
        const psychology=document.getElementById('trade-psychology-tags')?.closest('.form-group');
        psychology?.insertAdjacentHTML('beforebegin','<div class="trade-execution-panel"><div class="form-row"><label class="form-group flex-1">วันที่ทำรายการ<input id="trade-executed-date" type="date" class="form-input" required></label><label class="form-group flex-1">เวลา<input id="trade-executed-time" type="time" class="form-input" required></label><label class="form-group flex-1">ประเภทคำสั่ง<select id="trade-order-type" class="form-select"><option value="MARKET">Market</option><option value="LIMIT">Limit</option><option value="OTHER">อื่น ๆ</option></select></label></div></div>');
        document.getElementById('trade-total-thb')?.closest('.calc-row')?.insertAdjacentHTML('afterend','<div class="calc-row"><span>ค่าธรรมเนียมรวม:</span><strong class="font-mono" id="trade-total-fees">$0.00</strong></div><div class="calc-row"><span>ยอดจ่าย/รับสุทธิ:</span><strong class="font-mono" id="trade-net-proceeds">$0.00</strong></div>');
        for(const id of ['trade-commission-usd','trade-vat-usd','trade-exchange-fee-usd','trade-taf-fee-usd'])document.getElementById(id)?.addEventListener('input',()=>{
          const total=['trade-commission-usd','trade-vat-usd','trade-exchange-fee-usd','trade-taf-fee-usd'].reduce((sum,key)=>sum+Math.max(0,Number(document.getElementById(key)?.value)||0),0);
          document.getElementById('trade-fee-usd').value=String(total);
          this.updateTradeCalculations();
        });
      }

      if(!document.getElementById('modal-debt-payment')){
        document.getElementById('toast-container')?.insertAdjacentHTML('beforebegin',`<div class="modal-backdrop" id="modal-debt-payment" inert aria-hidden="true"><div class="modal-card debt-payment-modal"><div class="modal-header"><div><span class="modal-eyebrow">LIABILITY PAYMENT</span><h3 id="debt-payment-title">บันทึกการชำระหนี้</h3></div><button class="btn-close-modal" data-close="modal-debt-payment">&times;</button></div><form id="form-debt-payment" class="modal-body"><input id="debt-payment-id" type="hidden"><input id="debt-payment-record-id" type="hidden"><div id="debt-payment-summary" class="debt-payment-summary"></div><div class="form-row"><label class="form-group flex-1">วันที่ชำระ<input id="debt-payment-date" type="date" class="form-input" required></label><label class="form-group flex-1">เงินต้นที่ลดลง<input id="debt-payment-principal" type="number" min="0.000001" step="any" class="form-input" required></label></div><div class="form-row"><label class="form-group flex-1">ดอกเบี้ย/ค่าธรรมเนียม<input id="debt-payment-interest" type="number" min="0" step="any" value="0" class="form-input"></label><label class="form-group flex-1">หมายเหตุ<input id="debt-payment-note" class="form-input" maxlength="120"></label></div><div class="modal-footer"><button type="button" id="btn-delete-debt-payment" class="btn btn-danger hidden">ลบรายการนี้</button><button type="button" class="btn btn-secondary" data-close="modal-debt-payment">ยกเลิก</button><button type="submit" id="btn-save-debt-payment" class="btn btn-primary">บันทึกการชำระ</button></div></form></div></div>`);
        const modal=document.getElementById('modal-debt-payment');
        modal.addEventListener('click',event=>{if(event.target===modal)this.closeModal(modal.id);});
        modal.querySelector('[data-close]')?.addEventListener('click',()=>this.closeModal(modal.id));
        document.getElementById('form-debt-payment')?.addEventListener('submit',event=>{event.preventDefault();this.saveDebtPayment();});
        document.getElementById('btn-delete-debt-payment')?.addEventListener('click',()=>this.deleteDebtPayment());
      }
    },

    findDividendHoldingMatches(ticker) {
      const target=normalizeTicker(ticker);
      if(!target)return [];
      const matches=[];
      for(const portfolio of this.portfolios||[])for(const holding of portfolio.holdings||[])if(normalizeTicker(holding.ticker)===target)matches.push({portfolio,holding});
      return matches;
    },
    updateDividendPortfolioResolution() {
      const ticker=document.getElementById('dividend-ticker')?.value;
      const matches=this.findDividendHoldingMatches(ticker);
      const group=document.getElementById('dividend-portfolio-group'),select=document.getElementById('dividend-portfolio-id'),status=document.getElementById('dividend-ticker-resolution');
      if(!status||!select)return matches;
      if(!ticker?.trim()){group.hidden=true;status.className='ticker-resolution';status.textContent='พิมพ์ Ticker เพื่อค้นหาพอร์ตอัตโนมัติ';return matches;}
      if(!matches.length){group.hidden=true;select.value='';status.className='ticker-resolution error';status.textContent='ไม่พบหุ้นนี้ในพอร์ตที่บันทึกไว้';return matches;}
      select.innerHTML=matches.map(({portfolio})=>`<option value="${portfolio.id}">${portfolio.emoji||'📁'} ${this.escapeHtml(portfolio.name)}</option>`).join('');
      if(matches.length===1){group.hidden=true;select.value=matches[0].portfolio.id;status.className='ticker-resolution success';status.textContent=`พบใน ${matches[0].portfolio.emoji||'📁'} ${matches[0].portfolio.name}`;}
      else {group.hidden=false;status.className='ticker-resolution warning';status.textContent=`พบ ${matches.length} พอร์ต กรุณาเลือกพอร์ตของรายการนี้`;}
      return matches;
    },
    openDividendModal() {
      baseOpenDividend.call(this);
      this.updateDividendPortfolioResolution();
    },
    async saveDividendForm() {
      const date=document.getElementById('dividend-date').value;
      const typed=document.getElementById('dividend-ticker').value;
      const matches=this.updateDividendPortfolioResolution();
      if(!matches.length)return alert('ไม่พบ Ticker นี้ในสินทรัพย์ที่ถืออยู่ กรุณาตรวจชื่อหุ้นก่อนบันทึก');
      const selectedId=matches.length===1?matches[0].portfolio.id:document.getElementById('dividend-portfolio-id').value;
      const match=matches.find(row=>row.portfolio.id===selectedId);
      if(!match)return alert('กรุณาเลือกพอร์ตที่ได้รับปันผล');
      const ticker=String(match.holding.ticker).toUpperCase(),grossUSD=Number(document.getElementById('dividend-gross-usd').value),taxUSD=Number(document.getElementById('dividend-tax-usd').value||0),netUSD=grossUSD-taxUSD;
      const addToCash=document.getElementById('dividend-add-to-cash-buffer').checked,notes=document.getElementById('dividend-notes').value.trim();
      if(!date||date>PortfolioCore.bangkokDate()||![grossUSD,taxUSD].every(Number.isFinite)||grossUSD<0||taxUSD<0||taxUSD>grossUSD)return alert('ตรวจวันที่ จำนวนเงิน และภาษีให้ถูกต้อง');
      this.dividends.unshift({id:crypto.randomUUID(),date,ticker,portfolioId:match.portfolio.id,grossUSD,taxUSD,netUSD,addedToCash:addToCash,notes});
      if(addToCash)match.portfolio.cashBufferUSD=(Number(match.portfolio.cashBufferUSD)||0)+netUSD;
      if(!await this.saveData())return;
      this.closeModal('modal-dividend');this.renderActiveTab();this.showToast({title:'บันทึกเงินปันผลบน Cloud แล้ว',message:`${ticker} สุทธิ ${this.formatUSD(netUSD)}`,type:'success'});
    },

    dashboardPortfolioCard(port,index) {
      const stats=this.calculatePortfolioStats(port),value=this.formatDual(stats.totalValueUSD),goal=this.getPortfolioGoalUSD(port),pct=goal>0?Math.max(0,Math.min(100,stats.totalValueUSD/goal*100)):null,positive=stats.totalPLUSD>=0;
      const progressLabel=pct==null?'ยังไม่ได้ตั้งเป้าหมาย':pct>=100?'ถึงเป้าหมายแล้ว':`${pct.toFixed(1)}% ของเป้าหมาย`;
      return `<article class="wolf-portfolio-card" data-portfolio-card="${port.id}" draggable="true" style="--port-color:${port.color||'#18d391'}"><div class="portfolio-order-tools"><button type="button" class="drag-handle" title="ลากเพื่อเรียงพอร์ต" aria-label="ลาก ${this.escapeHtml(port.name)} เพื่อเรียงพอร์ต">⠿</button><button type="button" data-move-portfolio="up" data-portfolio-id="${port.id}" aria-label="เลื่อนพอร์ตขึ้น" ${index===0?'disabled':''}>↑</button><button type="button" data-move-portfolio="down" data-portfolio-id="${port.id}" aria-label="เลื่อนพอร์ตลง" ${index===this.portfolios.length-1?'disabled':''}>↓</button></div><button type="button" class="portfolio-card-main" data-overview-port="${port.id}"><span class="wolf-port-emoji">${port.emoji||'📁'}</span><span class="wolf-port-copy"><b>${this.escapeHtml(port.name)}</b><strong>${value.main}</strong><small class="${stats.avg1dChangePct>=0?'text-emerald':'text-rose'}">วันนี้ ${this.formatPercent(stats.avg1dChangePct)}</small><small class="${positive?'text-emerald':'text-rose'}">สินทรัพย์ที่ถือ ${this.formatPercent(stats.totalPLPct)} · ${this.formatDual(stats.totalPLUSD).main}</small><span class="portfolio-progress-head"><small>${progressLabel}</small>${pct==null?'':`<b>${Math.round(pct)}%</b>`}</span><span class="portfolio-progress-bar" role="progressbar" aria-label="ความคืบหน้าเป้าหมายพอร์ต ${this.escapeHtml(port.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct??0)}"><span style="width:${pct??0}%"></span></span></span></button></article>`;
    },
    renderDashboardView(container) {
      const data=this.dataPayload(),grand=this.calculateGrandTotalStats(),dual=this.formatDual(grand.grandTotalUSD),life=PortfolioCore.lifetimePerformance(data);
      const cards=this.portfolios.map((p,i)=>this.dashboardPortfolioCard(p,i)).join('');
      container.innerHTML=`<section class="dime-hero-banner"><div class="dime-hero-label">มูลค่าพอร์ตลงทุน</div><div class="dime-main-value">${dual.main}</div><div class="dime-sub-value">${dual.sub}</div><p class="market-caption">${this.escapeHtml(this.marketStatus||'ใช้ราคาที่บันทึกไว้ กำลังรอข้อมูลจากบริการราคา')}</p></section><section class="lifetime-result ${life.profit>=0?'positive':'negative'}"><span>ตั้งแต่เริ่มลงทุนมา คุณ${life.profit>=0?'กำไร':'ขาดทุน'}จริง</span><strong>${this.formatDual(Math.abs(life.profit)).main}</strong><div><small>ยังไม่ขาย ${this.formatDual(life.unrealized).main}</small><small>ขายแล้ว ${this.formatDual(life.realized).main}</small><small>ปันผล ${this.formatDual(life.dividends).main}</small><small>ค่าธรรมเนียม ${this.formatDual(life.fees).main}</small></div></section><div class="overview-metrics"><section><span>สินทรัพย์ที่บันทึกทั้งหมด</span><strong>${this.formatDual(PortfolioCore.wealth(data).assetsUSD).main}</strong><small>รวมพอร์ตลงทุน พอร์ตเทรด และสินทรัพย์อื่น</small></section><section><span>เงินสดในพอร์ต</span><strong>${this.formatDual(grand.totalCashBufferUSD).main}</strong><small>${this.portfolios.length} พอร์ต · ${this.portfolios.reduce((n,p)=>n+(p.holdings||[]).length,0)} หุ้น</small></section></div>${this.marketPanelHTML?.()||''}${this.dailyMoversHTML()}<section class="overview-section"><div class="section-header"><div><h3>พอร์ตของคุณ</h3><p class="market-caption">ลากการ์ดหรือใช้ปุ่ม ↑ ↓ เพื่อจัดลำดับ ลำดับนี้ใช้ในหน้าแยกพอร์ตด้วย</p></div><button id="btn-add-portfolio-modal" class="btn btn-primary">เพิ่มพอร์ต</button></div><div class="wolf-portfolio-grid">${cards||'<p>เริ่มจากเพิ่มพอร์ต แล้วกรอกสินทรัพย์ที่ถืออยู่จริง</p>'}</div></section>`;
      this.bindDashboardFeatureEvents(container);
    },
    dailyMoversHTML() {
      const ranks=PortfolioCore.dailyMovers(this.dataPayload());
      const list=(rows,positive)=>rows.length?`<ol class="daily-mover-list">${rows.map(row=>`<li><div><b>${this.escapeHtml(row.ticker)}</b><small>${row.portfolios.map(p=>this.escapeHtml(p.name)).join(' · ')}</small><small>${row.marketAt?'เวลาราคา '+this.escapeHtml(new Date(row.marketAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})):'ไม่มีเวลาราคายืนยัน'}</small></div><strong class="${positive?'text-emerald':'text-rose'}">${positive?'+':''}${this.formatDual(row.profitUSD).main}</strong></li>`).join('')}</ol>`:`<p class="market-caption">ยังไม่มีหุ้นที่${positive?'ทำเงิน':'เสียเงิน'}ในข้อมูล 1D ล่าสุด</p>`;
      return `<section class="overview-section daily-movers"><div class="section-header"><div><h3>หุ้นที่มีผลต่อพอร์ตวันนี้</h3><p class="market-caption">จำนวนหุ้นที่ถือ × ส่วนต่างราคาจากปิดวันก่อน รวม Ticker เดียวกันทุกพอร์ต · ใช้ข้อมูล 1D ล่าสุดที่ได้รับ${ranks.missing?` · ${ranks.missing} รายการยังไม่มีข้อมูลรายวัน`:''}</p></div></div><div class="daily-mover-columns"><article><h4 class="text-emerald">ทำเงินมากที่สุด 5 อันดับ</h4>${list(ranks.winners,true)}</article><article><h4 class="text-rose">เสียเงินมากที่สุด 5 อันดับ</h4>${list(ranks.losers,false)}</article></div></section>`;
    },
    bindDashboardFeatureEvents(container) {
      container.querySelectorAll('[data-overview-port]').forEach(button=>button.addEventListener('click',()=>{this.selectedPortfolioId=button.dataset.overviewPort;this.switchTab('portfolios');}));
      container.querySelectorAll('[data-move-portfolio]').forEach(button=>button.addEventListener('click',()=>this.movePortfolio(button.dataset.portfolioId,button.dataset.movePortfolio==='up'?-1:1)));
      let dragged=null;
      container.querySelectorAll('[data-portfolio-card]').forEach(card=>{
        card.addEventListener('dragstart',()=>{dragged=card.dataset.portfolioCard;card.classList.add('dragging');});
        card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragged=null;});
        card.addEventListener('dragover',event=>event.preventDefault());
        card.addEventListener('drop',event=>{event.preventDefault();if(dragged&&dragged!==card.dataset.portfolioCard)this.placePortfolioBefore(dragged,card.dataset.portfolioCard);});
      });
    },
    async movePortfolio(id,delta) {
      const index=this.portfolios.findIndex(p=>p.id===id),target=index+delta;if(index<0||target<0||target>=this.portfolios.length)return;
      [this.portfolios[index],this.portfolios[target]]=[this.portfolios[target],this.portfolios[index]];
      if(await this.saveData())this.renderActiveTab();
    },
    async placePortfolioBefore(sourceId,targetId) {
      const source=this.portfolios.findIndex(p=>p.id===sourceId),target=this.portfolios.findIndex(p=>p.id===targetId);if(source<0||target<0)return;
      const [item]=this.portfolios.splice(source,1);this.portfolios.splice(source<target?target-1:target,0,item);
      if(await this.saveData())this.renderActiveTab();
    },

    renderWealthView(container) {
      const summary=PortfolioCore.wealth(this.dataPayload()),money=value=>this.formatDual(value).main,assetTypes={cash:'เงินสด / เงินฝาก',metal:'ทอง เงิน อัญมณี',realestate:'อสังหาริมทรัพย์',bond:'ตราสารหนี้ / หุ้นกู้',other:'สินทรัพย์อื่น'};
      const assets=(this.wealthAssets||[]).map(a=>`<button class="wealth-row" data-edit-wealth="asset:${a.id}"><span><b>${this.escapeHtml(a.name)}</b><small>${assetTypes[a.type]||'สินทรัพย์'} · ประเมิน ${this.escapeHtml(a.valuedAt||'')}</small></span><strong>${money((Number(a.value)||0)/(a.currency==='THB'?this.exchangeRate:1))}</strong></button>`).join('');
      const ports=this.portfolios.map(p=>`<option value="${p.id}">${p.emoji||'📁'} ${this.escapeHtml(p.name)}</option>`).join('');
      container.innerHTML=`<section class="wealth-hero"><span>สินทรัพย์ที่บันทึกทั้งหมด</span><strong>${money(summary.assetsUSD)}</strong><small>รวมพอร์ตลงทุน พอร์ตเทรด และสินทรัพย์อื่น</small></section><div class="asset-register"><section class="overview-section"><div class="section-header"><h2>สินทรัพย์อื่น</h2><button class="btn btn-primary" data-add-wealth="asset">เพิ่มสินทรัพย์</button></div>${assets||'<p>เพิ่มเงินฝาก ทอง อัญมณี อสังหาริมทรัพย์ หรือตราสารหนี้</p>'}</section></div><section class="overview-section"><h2>บันทึกผลขายย้อนหลัง</h2><p>ใช้สำหรับ Cut Loss หรือกำไรที่เกิดก่อนเริ่มใช้แอป เพื่อให้ผลตั้งแต่เริ่มลงทุนไม่ลืมรายการเก่า</p><form id="form-manual-result" class="manual-result-grid"><label>พอร์ต<select id="manual-result-port" class="form-select" required>${ports}</select></label><label>หุ้น<input id="manual-result-ticker" class="form-input" required maxlength="30"></label><label>วันที่ขาย<input id="manual-result-date" type="date" class="form-input" required max="${PortfolioCore.bangkokDate()}"></label><label>ต้นทุนหุ้นส่วนที่ขาย (USD)<input id="manual-result-cost" type="number" min="0" step="any" class="form-input" required></label><label>กำไร/ขาดทุนสุทธิ (USD)<input id="manual-result-profit" type="number" step="any" class="form-input" required></label><label>ค่าธรรมเนียมที่รวมในผลสุทธิ (USD)<input id="manual-result-fee" type="number" min="0" step="any" value="0" class="form-input"></label><button class="btn btn-primary" type="submit">บันทึกผลขาย</button></form></section>`;
      container.querySelectorAll('[data-add-wealth]').forEach(button=>button.addEventListener('click',()=>this.openWealthEntry(button.dataset.addWealth)));
      container.querySelectorAll('[data-edit-wealth]').forEach(button=>button.addEventListener('click',()=>{const [kind,id]=button.dataset.editWealth.split(':');this.openWealthEntry(kind,id);}));
      container.querySelectorAll('[data-pay-debt]').forEach(button=>button.addEventListener('click',()=>this.openDebtPayment(button.dataset.payDebt)));
      container.querySelectorAll('[data-edit-debt-payment]').forEach(button=>button.addEventListener('click',()=>this.openDebtPayment(button.dataset.debtId,button.dataset.editDebtPayment)));
      container.querySelectorAll('[data-delete-debt-payment]').forEach(button=>button.addEventListener('click',()=>this.deleteDebtPayment(button.dataset.debtId,button.dataset.deleteDebtPayment)));
      container.querySelector('#form-manual-result')?.addEventListener('submit',event=>{event.preventDefault();this.saveManualResult();});
    },
    debtRowHTML(debt,isPaid,money) {
      const payments=Array.isArray(debt.payments)?debt.payments:[];
      return `<article class="wealth-row debt debt-record"><button type="button" data-edit-wealth="liability:${debt.id}"><span><b>${this.escapeHtml(debt.name)}</b><small>${isPaid?`ชำระหมด ${this.escapeHtml(debt.paidAt||'')}`:`${this.escapeHtml(debt.type||'หนี้สิน')} · บันทึกชำระ ${payments.length} ครั้ง`}</small></span><strong>${money((Number(debt.balance)||0)/(debt.currency==='THB'?this.exchangeRate:1))}</strong></button>${!isPaid?`<button type="button" class="btn btn-sm btn-primary" data-pay-debt="${debt.id}">ชำระหนี้</button>`:''}${payments.length?`<details><summary>ประวัติการชำระ</summary><div class="debt-history">${payments.slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||b.id).localeCompare(String(a.createdAt||a.id))).map(p=>`<div class="debt-history-item"><span>${this.escapeHtml(p.date)}${p.note?' · '+this.escapeHtml(p.note):''}</span><strong>เงินต้น ${Number(p.principal).toLocaleString()} ${debt.currency}${Number(p.interest)>0?` · ดอกเบี้ย/ค่าธรรมเนียม ${Number(p.interest).toLocaleString()}`:''}</strong><small>ยอดหลังชำระ ${Number(p.balanceAfter).toLocaleString()} ${debt.currency}</small><span class="debt-history-actions"><button type="button" data-edit-debt-payment="${p.id}" data-debt-id="${debt.id}">แก้ไข</button><button type="button" class="danger" data-delete-debt-payment="${p.id}" data-debt-id="${debt.id}">ลบ</button></span></div>`).join('')}</div></details>`:''}</article>`;
    },
    debtOpeningBalance(debt) {
      const saved=Number(debt.openingBalance);if(Number.isFinite(saved)&&saved>=0)return saved;
      return (Number(debt.balance)||0)+(debt.payments||[]).reduce((sum,payment)=>sum+(Number(payment.principal)||0),0);
    },
    rebuildDebtLedger(debt,payments,openingBalance=this.debtOpeningBalance(debt)) {
      let balance=Number(openingBalance);if(!Number.isFinite(balance)||balance<0)return null;
      const rows=PortfolioCore.clone(payments||[]).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||a.id).localeCompare(String(b.createdAt||b.id)));
      for(const payment of rows){const principal=Number(payment.principal),interest=Math.max(0,Number(payment.interest)||0);if(!Number.isFinite(principal)||principal<=0||principal>balance+1e-9)return null;payment.principal=principal;payment.interest=interest;payment.total=principal+interest;payment.balanceBefore=balance;balance=Math.max(0,balance-principal);payment.balanceAfter=balance;}
      return {payments:rows,openingBalance:Number(openingBalance),balance,status:balance===0?'paid':'active',paidAt:balance===0?(rows.slice().reverse().find(payment=>payment.balanceAfter===0)?.date||PortfolioCore.bangkokDate()):null};
    },
    applyDebtLedger(debt,ledger) {
      Object.assign(debt,ledger,{updatedAt:new Date().toISOString()});return debt;
    },
    openDebtPayment(id,paymentId='') {
      const debt=this.liabilities.find(row=>row.id===id),payment=(debt?.payments||[]).find(row=>row.id===paymentId);if(!debt||(!payment&&Number(debt.balance)<=0))return;
      document.getElementById('form-debt-payment').reset();document.getElementById('debt-payment-id').value=id;document.getElementById('debt-payment-record-id').value=paymentId;document.getElementById('debt-payment-date').value=payment?.date||PortfolioCore.bangkokDate();document.getElementById('debt-payment-principal').value=payment?.principal??'';document.getElementById('debt-payment-interest').value=payment?.interest??'0';document.getElementById('debt-payment-note').value=payment?.note||'';document.getElementById('debt-payment-title').textContent=payment?'แก้ไขประวัติการชำระหนี้':'บันทึกการชำระหนี้';document.getElementById('btn-save-debt-payment').textContent=payment?'บันทึกการแก้ไข':'บันทึกการชำระ';document.getElementById('btn-delete-debt-payment').classList.toggle('hidden',!payment);document.getElementById('debt-payment-summary').innerHTML=`<b>${this.escapeHtml(debt.name)}</b><span>ยอดตั้งต้น ${this.debtOpeningBalance(debt).toLocaleString()} · คงเหลือ ${Number(debt.balance).toLocaleString()} ${debt.currency}</span>`;this.openModal('modal-debt-payment');
    },
    async saveDebtPayment() {
      const id=document.getElementById('debt-payment-id').value,debt=this.liabilities.find(row=>row.id===id);if(!debt)return;
      const paymentId=document.getElementById('debt-payment-record-id').value,date=document.getElementById('debt-payment-date').value,principal=Number(document.getElementById('debt-payment-principal').value),interest=Math.max(0,Number(document.getElementById('debt-payment-interest').value)||0),note=document.getElementById('debt-payment-note').value.trim();
      if(!date||date>PortfolioCore.bangkokDate()||!Number.isFinite(principal)||principal<=0)return alert('ตรวจวันที่และเงินต้นให้ถูกต้อง');
      const existing=(debt.payments||[]).find(row=>row.id===paymentId),record={...existing,id:paymentId||crypto.randomUUID(),date,principal,interest,total:principal+interest,note,createdAt:existing?.createdAt||new Date().toISOString()};
      const rows=[...(debt.payments||[]).filter(row=>row.id!==paymentId),record],ledger=this.rebuildDebtLedger(debt,rows);if(!ledger)return alert('เงินต้นรวมมากกว่ายอดหนี้ตั้งต้น กรุณาตรวจรายการชำระ');
      this.applyDebtLedger(debt,ledger);if(!await this.saveData())return;this.closeModal('modal-debt-payment');this.renderActiveTab();this.showToast({title:paymentId?'แก้ไขประวัติชำระหนี้แล้ว':ledger.balance===0?'ชำระหนี้หมดแล้ว':'บันทึกการชำระหนี้แล้ว',message:`ยอดคงเหลือ ${ledger.balance.toLocaleString()} ${debt.currency}`,type:'success'});
    },
    async deleteDebtPayment(debtId='',paymentId='') {
      debtId=debtId||document.getElementById('debt-payment-id')?.value;paymentId=paymentId||document.getElementById('debt-payment-record-id')?.value;const debt=this.liabilities.find(row=>row.id===debtId),payment=(debt?.payments||[]).find(row=>row.id===paymentId);if(!debt||!payment||!confirm(`ลบรายการชำระวันที่ ${payment.date} จำนวนเงินต้น ${Number(payment.principal).toLocaleString()} ${debt.currency} ใช่หรือไม่?`))return;
      const ledger=this.rebuildDebtLedger(debt,(debt.payments||[]).filter(row=>row.id!==paymentId));if(!ledger)return alert('คำนวณยอดหนี้ใหม่ไม่สำเร็จ');this.applyDebtLedger(debt,ledger);if(!await this.saveData())return;this.closeModal('modal-debt-payment');this.renderActiveTab();this.showToast({title:'ลบประวัติชำระหนี้แล้ว',message:`ยอดคงเหลือ ${ledger.balance.toLocaleString()} ${debt.currency}`,type:'success'});
    },

    renderTradingView(container) {
      baseRenderTrading.call(this,container);
      this.bindTradingOrder(container);
    },
    bindTradingOrder(container) {
      container.querySelectorAll('[data-move-trading]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();this.moveTradingPortfolio(button.dataset.tradingKey,button.dataset.moveTrading==='up'?-1:1);}));
      let dragged=null;
      container.querySelectorAll('[data-trading-card]').forEach(card=>{card.addEventListener('dragstart',()=>{dragged=card.dataset.tradingCard;card.classList.add('dragging');});card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragged=null;});card.addEventListener('dragover',event=>event.preventDefault());card.addEventListener('drop',event=>{event.preventDefault();if(dragged&&dragged!==card.dataset.tradingCard)this.placeTradingBefore(dragged,card.dataset.tradingCard);});});
    },
    orderedTradingKeys() { return this.getOrderedTradingEntries().map(([key])=>key); },
    async persistTradingOrder(keys) { keys.forEach((key,index)=>{if(this.tradingData[key])this.tradingData[key].order=index+1;});if(await this.saveData())this.renderActiveTab(); },
    moveTradingPortfolio(id,delta) {const keys=this.orderedTradingKeys(),index=keys.indexOf(id),target=index+delta;if(index<0||target<0||target>=keys.length)return;[keys[index],keys[target]]=[keys[target],keys[index]];return this.persistTradingOrder(keys);},
    placeTradingBefore(sourceId,targetId) {const keys=this.orderedTradingKeys(),source=keys.indexOf(sourceId),target=keys.indexOf(targetId);if(source<0||target<0)return;const [key]=keys.splice(source,1);keys.splice(source<target?target-1:target,0,key);return this.persistTradingOrder(keys);},
    initTradingChart() {
      if(typeof Chart==='undefined')return;const canvas=document.getElementById('chart-trading-equity');if(!canvas)return;this.charts.trading?.destroy?.();
      const entries=this.getOrderedTradingEntries(),monthSet=new Set();for(const [,item]of entries)for(const row of item.monthlyBalances||[])monthSet.add(`${row.year}-${String(row.month).padStart(2,'0')}`);for(const flow of this.cashFlows||[])if(String(flow.portfolioId||'').startsWith('trading:')&&flow.date)monthSet.add(flow.date.slice(0,7));const labels=[...monthSet].sort();if(!labels.length)return;
      const colors=['#38bdf8','#f43f5e','#a855f7','#10b981','#f59e0b','#ec4899'];const datasets=[];
      entries.forEach(([key,item],index)=>{const map=Object.fromEntries((item.monthlyBalances||[]).map(row=>[`${row.year}-${String(row.month).padStart(2,'0')}`,Number(row.balanceUSD)||0]));datasets.push({type:'line',label:item.name,data:labels.map(label=>map[label]??null),borderColor:item.color||colors[index%colors.length],backgroundColor:(item.color||colors[index%colors.length])+'18',tension:.25,spanGaps:true,yAxisID:'yCash'});});
      const deposits=labels.map(label=>(this.cashFlows||[]).filter(f=>String(f.portfolioId||'').startsWith('trading:')&&f.type==='DEPOSIT'&&String(f.date||'').startsWith(label)).reduce((s,f)=>s+(Number(f.amountUSD)||0),0));
      const withdrawals=labels.map(label=>(this.cashFlows||[]).filter(f=>String(f.portfolioId||'').startsWith('trading:')&&f.type==='WITHDRAW'&&String(f.date||'').startsWith(label)).reduce((s,f)=>s+(Number(f.amountUSD)||0),0));
      const totals=labels.map(label=>entries.reduce((sum,[,item])=>{const rows=(item.monthlyBalances||[]).filter(row=>`${row.year}-${String(row.month).padStart(2,'0')}`<=label).sort((a,b)=>a.year*12+a.month-b.year*12-b.month);return sum+(Number(rows.at(-1)?.balanceUSD)||0);},0));let growth=1;const returns=totals.map((value,index)=>{if(!index||totals[index-1]<=0)return null;const denominator=totals[index-1]+.5*(deposits[index]-withdrawals[index]);if(denominator<=0)return null;growth*=1+(value-totals[index-1]-deposits[index]+withdrawals[index])/denominator;return (growth-1)*100;});
      datasets.push({type:'bar',label:'เงินเติม',data:deposits,backgroundColor:'rgba(16,185,129,.45)',yAxisID:'yCash'},{type:'bar',label:'เงินถอน',data:withdrawals.map(v=>-v),backgroundColor:'rgba(244,63,94,.45)',yAxisID:'yCash'},{type:'line',label:'ผลตอบแทนสะสมหลังตัดเงินเข้าออก',data:returns,borderColor:'#fbbf24',borderWidth:3,tension:.2,spanGaps:true,yAxisID:'yPercent'});
      this.charts.trading=new Chart(canvas,{data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{yCash:{type:'linear',position:'left',ticks:{callback:value=>'$'+value}},yPercent:{type:'linear',position:'right',grid:{drawOnChartArea:false},ticks:{callback:value=>value+'%'}}}}});
    }
  });
})();
