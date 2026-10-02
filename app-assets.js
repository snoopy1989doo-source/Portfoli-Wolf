/* Asset entry and presentation. Current balances and executed trades remain separate. */
(function(){
  'use strict';
  const proto=PixelStewardApp.prototype,setup=proto.setupOnlineUI,openHolding=proto.openHoldingModal,openModal=proto.openModal;
  Object.assign(proto,{
    setupOnlineUI(){
      setup.call(this);
      for(const formId of ['form-holding','form-trade']){
        const form=document.getElementById(formId);if(!form)continue;
        form.noValidate=true;
        form.insertAdjacentHTML('afterbegin',`<p id="${formId}-error" class="entry-error" role="alert" hidden></p>`);
        form.addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');document.getElementById(formId+'-error').hidden=true;if(formId==='form-holding')this.updateHoldingEntryPreview();});
        form.querySelectorAll('input[type="number"]').forEach(input=>input.inputMode='decimal');
      }
      document.getElementById('form-holding')?.querySelector('.modal-footer')?.insertAdjacentHTML('beforebegin','<section id="holding-entry-preview" class="entry-preview" aria-live="polite"></section>');
      const time=document.getElementById('trade-executed-time');if(time)time.step='1';
      const execution=document.querySelector('.trade-execution-panel'),summary=document.getElementById('trade-holding-summary');if(execution&&summary)summary.after(execution);
    },
    entryError(formId,inputId,message){
      const box=document.getElementById(formId+'-error'),input=document.getElementById(inputId);
      if(box){box.textContent=message;box.hidden=false;}else this.showToast({title:message,type:'error'});
      input?.setAttribute?.('aria-invalid','true');input?.focus?.();return false;
    },
    openModal(id){
      openModal.call(this,id);
      const formId=id==='modal-holding'?'form-holding':id==='modal-trade'?'form-trade':null;
      if(formId){const form=document.getElementById(formId);form?.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));const error=document.getElementById(formId+'-error');if(error)error.hidden=true;}
      if(id==='modal-trade'){const date=document.getElementById('trade-executed-date');if(date)date.max=PortfolioCore.bangkokDate();this.updateTradeCalculations();}
    },
    openHoldingModal(id,portId){
      openHolding.call(this,id,portId);
      this.updateHoldingEntryPreview();
    },
    updateHoldingEntryPreview(){
      const read=id=>PortfolioCore.inputNumber(document.getElementById(id)?.value),shares=read('holding-shares'),cost=read('holding-avg-cost'),price=read('holding-current-price');
      const box=document.getElementById('holding-entry-preview');if(!box)return;
      if(![shares,cost,price,shares*cost,shares*price].every(Number.isFinite)){box.textContent='กรอกจำนวนหุ้น ต้นทุนต่อหุ้น และราคา เพื่อดูยอดก่อนบันทึก';return;}
      const profit=shares*(price-cost),pct=shares*cost>0?profit/(shares*cost)*100:null;
      box.innerHTML=`<div><span>ต้นทุนรวม</span><strong>${this.formatUSD(shares*cost)}</strong></div><div><span>มูลค่าปัจจุบัน</span><strong>${this.formatUSD(shares*price)}</strong></div><div><span>กำไร/ขาดทุนที่ยังไม่ขาย</span><strong class="${profit>=0?'text-emerald':'text-rose'}">${this.formatUSD(profit)} · ${pct===null?'ไม่มีฐานต้นทุน':pct.toFixed(2)+'%'}</strong></div>`;
    },
    renderHoldingsLayoutHTML(port,holdings,stats){
      if(!holdings.length)return '<div class="asset-empty"><h3>ยังไม่มีสินทรัพย์ในพอร์ตนี้</h3><p>เพิ่มยอดหุ้นที่ถืออยู่ หรือเริ่มบันทึกรายการซื้อ</p></div>';
      const full=this.holdingsViewLayout==='full';
      return `<p class="asset-allocation-note">สัดส่วน = มูลค่าสินทรัพย์ ÷ มูลค่าพอร์ตนี้รวมเงินสด · กำไร/ขาดทุนด้านล่างเป็นของหุ้นที่ยังถืออยู่</p><div class="asset-ledger ${full?'asset-ledger-full':''}">${holdings.map(h=>{
        const s=this.calculateHoldingStats(h),positive=s.unrealizedPLUSD>=0,allocation=stats.totalValueUSD>0?s.marketValueUSD/stats.totalValueUSD*100:0;
        const money=this.formatDual(s.marketValueUSD),cost=this.formatDual(s.totalCostUSD),profit=this.formatDual(s.unrealizedPLUSD);
        const pct=s.totalCostUSD>0?`${positive?'+':''}${s.unrealizedPLPct.toFixed(2)}%`:'ไม่มีฐานต้นทุน';
        const daily=Number.isFinite(h.change1dPct)?`${h.change1dPct>=0?'+':''}${h.change1dPct.toFixed(2)}%`:'ไม่มีข้อมูล';
        const targets=[['ซื้อไม้ 1',h.dipTarget1||h.dipTargetUSD],['ซื้อไม้ 2',h.dipTarget2],['ซื้อไม้ 3',h.dipTarget3],['ขายทำกำไร',h.sellTargetUSD],['ขายจำกัดขาดทุน',h.stopLossUSD]].filter(([,value])=>Number.isFinite(value)&&value>0).map(([label,value])=>`${label} $${value}`).join(' · ');
        const goal=Number(h.targetTHB)>0?`<p class="market-caption">เป้าหมายสินทรัพย์ ${this.formatTHB(h.targetTHB)} · ${(s.marketValueTHB/h.targetTHB*100).toFixed(1)}%</p>`:'';
        return `<article class="asset-row holding-compact-item ${full?'expanded':''}" data-holding-id="${h.id}"><div class="asset-row-main">
          <div class="asset-identity">${this.renderStockLogoHTML(h.ticker,port.color||'#10b981',40)}<div><strong>${this.escapeHtml(h.ticker)}</strong><span>${this.escapeHtml(h.name||h.ticker)}</span><small>${allocation.toFixed(2)}% ของพอร์ต</small></div></div>
          <div class="asset-figure"><span>ต้นทุนรวม</span><strong>${cost.main}</strong><small>${cost.sub}</small></div>
          <div class="asset-figure"><span>มูลค่าปัจจุบัน</span><strong>${money.main}</strong><small>${money.sub}</small></div>
          <div class="asset-figure ${positive?'text-emerald':'text-rose'}"><span>กำไร/ขาดทุน</span><strong>${pct}</strong><small>${profit.main}</small></div>
          <div class="asset-actions"><button type="button" class="btn btn-sm btn-secondary" data-trade-holding="${h.id}" data-port-id="${port.id}">ซื้อ / ขาย</button><button type="button" class="btn btn-sm btn-secondary btn-compact-expand" aria-label="รายละเอียด ${this.escapeHtml(h.ticker)}"><span class="expand-icon">▼</span></button></div>
        </div><div class="holding-compact-drawer asset-row-details"><div class="asset-detail-grid">
          <div><span>จำนวนหุ้นคงเหลือ</span><strong>${s.shares.toLocaleString('en-US',{maximumFractionDigits:10})}</strong></div>
          <div><span>ต้นทุนต่อหุ้น (USD)</span><strong>${s.avgCost.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:8})}</strong></div>
          <div><span>ราคา (USD)</span><strong>${s.currentPrice.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8})}</strong></div>
          <div><span>เปลี่ยนแปลง 1 วัน</span><strong class="${h.change1dPct>=0?'text-emerald':'text-rose'}">${daily}</strong></div>
        </div>${targets?`<p class="market-caption">Alert: ${this.escapeHtml(targets)}</p>`:''}${goal}<div class="asset-detail-footer"><small>${h.priceMarketAt?'เวลาราคา '+this.escapeHtml(new Date(h.priceMarketAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})):'ราคาที่บันทึกไว้ · ยังไม่มีเวลาตลาดยืนยัน'}</small><div class="asset-actions"><button class="btn btn-sm btn-secondary" data-ledger-ticker="${this.escapeHtml(h.ticker)}">ประวัติ ${this.escapeHtml(h.ticker)}</button><button class="btn btn-sm btn-secondary" data-edit-holding="${h.id}" data-port-id="${port.id}">แก้ไขยอดถือครอง</button></div></div></div></article>`;
      }).join('')}</div>`;
    }
  });
})();
