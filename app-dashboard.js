/* Modern dashboard. All displayed numbers come from the existing portfolio ledger. */
(function(){
  'use strict';
  const proto=PixelStewardApp.prototype,setup=proto.setupOnlineUI,render=proto.renderActiveTab,accept=proto.acceptCloud,sync=proto.syncLiveMarketPrices,tool=proto.renderSimulatorView,growth=proto.renderQuarterlyView;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tone=n=>n>0?'gain':n<0?'loss':'neutral';
  const percent=n=>Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'—';
  const date=at=>new Date(at).toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'});
  const section=(title,subtitle,content,actions='',classes='')=>`<section class="dash-panel ${classes}"><header class="dash-section-head"><div><h2>${title}</h2><small>${subtitle}</small></div>${actions}</header>${content}</section>`;
  Object.assign(proto,{
    setupOnlineUI(){
      setup.call(this);
      const tabs=['dashboard','portfolios','trading','quarterly','dividends','simulator','settings'],names=['Dashboard','Portfolio','Risk','Growth / Quarter','Dividend','Tool','Setting'];
      for(const nav of document.querySelectorAll('.nav-links,.mobile-nav')){
        nav.querySelector('[data-tab="wealth"]')?.remove();
        tabs.forEach((tab,i)=>{const button=nav.querySelector(`[data-tab="${tab}"]`);if(!button)return;button.innerHTML=`<img class="dash-nav-icon" src="assets/ui/nav-${i+1}.jpg" alt=""><span class="nav-label">${names[i]}</span>`;button.title=names[i];button.setAttribute('aria-label',names[i]);nav.append(button);});
      }
      document.body.classList.add('modern-dashboard');
      try{this.moverMode=sessionStorage.getItem('wolf-mover-mode')||'impact';}catch(_){this.moverMode='impact';}
      this.chartMetric='value';this.chartRange='1M';
      setInterval(()=>this.persistDashboardObservation(),60000);
    },
    acceptCloud(value){accept.call(this,value);if(!this.dashboardObservationTimer)this.dashboardObservationTimer=setTimeout(()=>{this.dashboardObservationTimer=null;this.persistDashboardObservation();},5000);},
    async syncLiveMarketPrices(options){const result=await sync.call(this,options);await this.persistDashboardObservation();return result;},
    evaluatePriceAlerts(){
      clearTimeout(this.dashboardAlertTimer);
      this.dashboardAlertTimer=setTimeout(()=>this.persistDashboardObservation(),350);
    },
    async persistDashboardObservation(){
      if(!this.cloudReady||!this.isFirebaseOnline||this.saving||this.viewDirty||this.dashboardSaving||!this.cloudBaseline||document.querySelector('.modal-backdrop.open'))return;
      const now=new Date(),today=PortfolioCore.bangkokDate(now),summary=DashboardCore.summary(this.dataPayload(),this.marketQuotes),baseline=PortfolioCore.clone(this.cloudBaseline.data);
      const history=baseline.dashboardHistory||[],latest=history.find(r=>r.date===today);
      const due=!latest||now-Date.parse(latest.at)>=15*60000;
      const alerts=baseline.priceAlerts||[];let changed=false;const triggered=[];
      // Carry forward targets already entered in the stock forms; stable IDs prevent duplicates.
      for(const p of baseline.portfolios||[])for(const h of p.holdings||[])for(const [field,type] of [['dipTarget1','buy'],['dipTarget2','buy'],['dipTarget3','buy'],['sellTargetUSD','take_profit'],['stopLossUSD','stop_loss']]){
        const target=Number(h[field]||(field==='dipTarget1'?h.dipTargetUSD:0));const id=`legacy:${p.id}:${h.id}:${field}`;
        const existing=alerts.find(a=>a.id===id);
        if(target>0&&!existing){alerts.push({id,ticker:h.ticker.toUpperCase(),portfolioId:p.id,type,targetPrice:target,currency:'USD',isActive:true,triggeredAt:null,createdAt:now.toISOString(),updatedAt:now.toISOString(),legacy:true});changed=true;}
        else if(target>0&&existing&&existing.targetPrice!==target){Object.assign(existing,{targetPrice:target,triggeredAt:null,acknowledgedAt:null,isActive:true,updatedAt:now.toISOString()});changed=true;}
      }
      for(const a of alerts){const q=this.marketQuotes?.[a.ticker];if(a.isActive&&!a.triggeredAt&&q&&DashboardCore.alertHit(a,q.priceUSD)){a.triggeredAt=now.toISOString();a.updatedAt=a.triggeredAt;changed=true;triggered.push(a);}}
      if(!due&&!changed)return;
      if(due){const observation={date:today,at:now.toISOString(),stockValue:summary.stockValue,profit:summary.profit,total:summary.total,exchangeRate:this.exchangeRate,missingQuotes:summary.missing};baseline.dashboardHistory=[...history.filter(r=>r.date!==today),observation];}
      baseline.priceAlerts=alerts;
      // Use the confirmed ledger, never write streaming quotes into holdings.
      this.dashboardSaving=true;this.saving=true;
      const expected=this.revision,generation=this.generation;
      try{const result=await(this.cloudStore||this.dbRef).transaction(current=>PortfolioCore.commit(current,expected,baseline,generation),undefined,false);this.saving=false;const committed=result.snapshot.val(),latestCloud=this.deferredCloud&&this.deferredCloud.revision>committed?.revision?this.deferredCloud:committed;this.deferredCloud=null;if(latestCloud)this.acceptCloud(latestCloud);if(result.committed)for(const a of triggered)this.showToast({title:`${a.ticker} ถึงเป้าหมายแล้ว`,message:`เป้าหมาย ${this.dashMoney(a.targetPrice)} · ดูรายละเอียดใน Price Alerts`,type:'info'});}
      catch(_){this.saving=false;}finally{this.dashboardSaving=false;}
    },
    renderActiveTab(){
      if(this.currentTab!=='quarterly')document.getElementById('app-view-container')?.classList.remove('modern-growth');
      if(['transactions','alerts'].includes(this.currentTab)){
        Object.values(this.charts||{}).forEach(c=>c?.destroy?.());this.charts={};
        const container=document.getElementById('app-view-container');if(!container)return;
        const title=document.getElementById('current-page-title');if(title)title.textContent=this.currentTab==='transactions'?'ประวัติธุรกรรม':'การแจ้งเตือนราคา';
        this.currentTab==='transactions'?this.renderTransactionsPage(container):this.renderAlertsPage(container);return;
      }
      return render.call(this);
    },
    dashMoney(value,signed=false){return `${value<0?'-':signed&&value>0?'+':''}${this.formatDual(Math.abs(value)).main}`;},
    renderSimulatorView(container){
      tool.call(this,container);
      const total=PortfolioCore.wealth(this.dataPayload()).otherAssetsUSD;
      container.insertAdjacentHTML('afterbegin',section('สินทรัพย์อื่น','OTHER ASSETS',`<p>ทองคำ อสังหาริมทรัพย์ เงินฝาก และสินทรัพย์ที่บันทึกเอง</p><strong class="dash-port-value">${this.dashMoney(total)}</strong>`,`<button data-go="wealth">จัดการสินทรัพย์อื่น ↗</button>`,'dash-tool-assets'));
      this.bindModernDashboard(container);
    },
    renderQuarterlyView(container){
      growth.call(this,container);
      container.classList.add('modern-growth');
      const intro=container.querySelector('.benchmark-card');
      if(intro){intro.classList.add('growth-intro');intro.querySelector('h2').textContent='การเติบโตและสรุปรายไตรมาส';}
      container.querySelectorAll('.benchmark-card').forEach(panel=>panel.classList.add('dash-panel'));
      const reports=container.querySelector('.quarter-report')?.closest('section');
      if(reports)reports.classList.add('growth-reports');
      container.insertAdjacentHTML('beforeend',section('ประวัติซื้อขายหุ้น','STOCK TRADE JOURNAL',this.renderTradingHistoryHTML(),'<button data-go="transactions">ดูธุรกรรมทั้งหมด ↗</button>','growth-stock-journal'));
      this.bindModernDashboard(container);
    },
    renderDashboardView(container){
      const data=this.dataPayload(),s=DashboardCore.summary(data,this.marketQuotes),money=n=>this.dashMoney(n),signed=n=>this.dashMoney(n,true);
      const previousMonth=new Date();previousMonth.setDate(0);const month=PortfolioCore.bangkokDate(previousMonth).slice(0,7);
      const prior=(data.dashboardHistory||[]).filter(r=>r.date.startsWith(month)).sort((a,b)=>b.at.localeCompare(a.at))[0];
      const monthly=prior?`<p class="${tone(s.total-prior.total)}">${signed(s.total-prior.total)} · ${percent(prior.total>0?(s.total/prior.total-1)*100:null)} <small>เทียบข้อมูลล่าสุดเดือนก่อน (${date(prior.at)})</small></p>`:'<p class="dash-muted">เริ่มสะสมข้อมูลเพื่อเทียบเดือนก่อน</p>';
      const allocations=[['พอร์ตหุ้น',s.stockValue+s.stockCash,'#22c6ed'],['สินทรัพย์อื่น',s.other,'#f3be55'],['พอร์ตเทรด',s.trading,'#a78bfa']];
      const allocationHTML=allocations.map(([label,value,color])=>`<li><i style="background:${color}"></i><span>${label}<b>${money(value)}</b></span><strong>${s.total>0?(value/s.total*100).toFixed(1):'0.0'}%</strong></li>`).join('');
      const graph=section('Portfolio Value','STOCKS ONLY',`<div class="dash-main-number">${money(s.stockValue)}</div><p class="${tone(s.profit)}">${signed(s.profit)} <small>กำไรรวมจากข้อมูลที่บันทึก · รวมผลขายและปันผลสุทธิ</small></p><div class="dash-segment"><button data-metric="value" class="${this.chartMetric!=='profit'?'selected':''}">มูลค่าหุ้น</button><button data-metric="profit" class="${this.chartMetric==='profit'?'selected':''}">กำไรสะสม</button></div><div class="dash-chart"><canvas id="dash-growth-chart"></canvas><p id="dash-chart-empty" hidden></p></div><div class="dash-ranges">${['1W','1M','3M','1Y','ALL'].map(r=>`<button data-range="${r}" class="${(this.chartRange||'1M')===r?'selected':''}">${r}</button>`).join('')}</div>`,'','dash-value');
      const assets=section('สินทรัพย์ทั้งหมด','TOTAL ASSETS',`<div class="dash-main-number">${money(s.total)}</div>${monthly}<div class="dash-allocation"><div><canvas id="dash-allocation-chart" aria-label="สัดส่วนสินทรัพย์" role="img"></canvas></div><ul>${allocationHTML}</ul></div>`,`<button class="dash-link" data-go="simulator">สินทรัพย์อื่นใน Tool ↗</button>`);
      const cash=s.stockCash;
      const cashCard=section('เงินสดพร้อมใช้','PORTFOLIO CASH',`<div class="dash-main-number">${money(cash)}</div><p class="dash-muted">เงินสดที่บันทึกไว้ในพอร์ตหุ้น สำหรับซื้อสินทรัพย์เพิ่ม</p><div class="dash-cash-ratio"><progress max="100" value="${s.stockValue+cash>0?cash/(s.stockValue+cash)*100:0}"></progress><b>${s.stockValue+cash>0?(cash/(s.stockValue+cash)*100).toFixed(1):'0.0'}%</b></div>`,'','dash-cash-compact');
      const savedScroll=container.querySelector('.dash-carousel')?.scrollLeft||0;
      container.innerHTML=`<div class="dash-layout"><div class="dash-top">${graph}${assets}</div><div class="dash-market-row">${this.modernMoversHTML(s)}${cashCard}</div>${section('พอร์ตของคุณ','YOUR PORTFOLIOS',`<div class="dash-carousel" tabindex="0" aria-label="ปัดเลื่อนพอร์ต">${this.portfolios.map((p,i)=>this.modernPortfolioCard(p,i)).join('')||'<p>เพิ่มพอร์ตเพื่อเริ่มบันทึกการลงทุน</p>'}</div>`,`<div class="dash-actions"><button data-slide="-1" aria-label="พอร์ตก่อนหน้า">←</button><button data-slide="1" aria-label="พอร์ตถัดไป">→</button><button id="btn-add-portfolio-modal" class="btn btn-primary">เพิ่มพอร์ต</button></div>`)}<div class="dash-bottom">${this.alertSummaryHTML()}${this.transactionPreviewHTML()}</div><p class="dash-footnote">${esc(this.marketStatus||'รอข้อมูลราคาล่าสุด')} · Alert ทำงานเมื่อเปิดเว็บ</p></div>`;
      this.bindModernDashboard(container);
      const carousel=container.querySelector('.dash-carousel');if(carousel)carousel.scrollLeft=savedScroll;
      this.drawDashboardCharts(s,allocations);
    },
    modernPortfolioCard(port,index){
      const data=this.dataPayload(),stats=this.calculatePortfolioStats(port),daily=DashboardCore.summary({...data,portfolios:[port]},this.marketQuotes),life=PortfolioCore.lifetimePerformance(data,port.id);
      const cover=typeof port.coverImage==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(port.coverImage)?port.coverImage:null;
      return `<article class="dash-portfolio-card" data-card-id="${esc(port.id)}"><div class="dash-cover">${cover?`<img src="${cover}" alt="รูปปก ${esc(port.name)}">`:'<span class="dash-cover-pattern"></span>'}<button class="dash-cover-edit" data-cover="${esc(port.id)}" aria-label="เปลี่ยนรูปปก ${esc(port.name)}">เปลี่ยนรูป</button></div><div class="dash-portfolio-content"><span class="dash-port-emoji">${esc(port.emoji||'📁')}</span><h3>${esc(port.name)}</h3><small>มูลค่ารวมของพอร์ต</small><strong class="dash-port-value">${this.dashMoney(stats.totalValueUSD)}</strong><div class="dash-port-stats"><div><small>กำไร / ขาดทุนวันนี้${daily.missing?' · ข้อมูลบางส่วน':''}</small><b class="${tone(daily.daily)}">${daily.rows.length?this.dashMoney(daily.daily,true):'—'}</b><span>${percent(daily.dailyPct)}</span></div><div><small>กำไร / ขาดทุนรวม</small><b class="${tone(life.profit)}">${this.dashMoney(life.profit,true)}</b><span class="${tone(life.profit)}">${percent(life.returnPct)}</span></div></div><small>รวมกำไรที่ถือ ผลขาย และปันผลสุทธิ</small>${stats.goalUSD>0?`<div class="dash-goal"><progress max="100" value="${stats.goalProgressPct}" aria-label="ความคืบหน้าเป้าหมาย"></progress><small>${stats.goalProgressPct.toFixed(1)}% · เป้าหมาย ${this.dashMoney(stats.goalUSD)}</small></div>`:''}<div class="dash-card-actions"><button data-order="${esc(port.id)}" data-delta="-1" ${index===0?'disabled':''} aria-label="ย้ายพอร์ตไปก่อนหน้า">←</button><button data-port="${esc(port.id)}">เปิดพอร์ต ↗</button><button data-order="${esc(port.id)}" data-delta="1" ${index===this.portfolios.length-1?'disabled':''} aria-label="ย้ายพอร์ตไปถัดไป">→</button></div></div></article>`;
    },
    modernMoversHTML(s){
      const mode=this.moverMode||'impact',ranks=DashboardCore.rank(s.rows,mode);
      const list=(rows,positive)=>`<div class="dash-rank-column"><h3>${mode==='impact'?(positive?'ทำกำไรให้พอร์ตมากที่สุด':'ขาดทุนต่อพอร์ตมากที่สุด'):(positive?'หุ้นที่ขึ้นแรงที่สุด':'หุ้นที่ลงแรงที่สุด')}</h3>${rows.length?`<ol>${rows.map((r,i)=>`<li><span class="dash-rank">${i+1}</span>${this.renderStockLogoHTML(r.ticker,'#22c6ed',30)}<span class="dash-ticker"><b>${esc(r.ticker)}</b><small>${r.portfolios.length} พอร์ต</small></span><span class="dash-rank-value ${tone(r.profitUSD)}"><b>${mode==='impact'?this.dashMoney(r.profitUSD,true):percent(r.pct)}</b><small>${mode==='impact'?percent(r.pct):this.dashMoney(r.profitUSD,true)}</small></span></li>`).join('')}</ol>`:`<p class="dash-muted">${s.missing&&!s.rows.length?'ยังไม่มีข้อมูลรายวันเพียงพอ':positive?'ยังไม่มีหุ้นที่ปรับขึ้น':'ยังไม่มีหุ้นที่ปรับลง'}</p>`}</div>`;
      const at=s.rows.map(r=>r.at).filter(Boolean).sort()[0];
      return section('การเปลี่ยนแปลงวันนี้','TODAY’S CHANGE',`<div class="dash-daily-total ${tone(s.daily)}">${s.rows.length?this.dashMoney(s.daily,true):'—'} <span>${percent(s.dailyPct)}</span><small>${s.missing?`ข้อมูลบางส่วน · ${s.missing} หุ้นไม่มีราคาครบ`:'จากหุ้นที่ถืออยู่ทั้งหมด'}${at?' · ราคาเก่าสุดในชุด '+esc(new Date(at).toLocaleString('th-TH')):''}</small></div><div class="dash-rank-columns">${list(ranks.winners,true)}${list(ranks.losers,false)}</div>`,`<div class="dash-segment"><button data-mover="impact" class="${mode==='impact'?'selected':''}">ผลต่อพอร์ต</button><button data-mover="percent" class="${mode==='percent'?'selected':''}">% การเปลี่ยนแปลง</button></div>`);
    },
    drawDashboardCharts(s,allocations){
      if(typeof Chart==='undefined')return;
      const rows=DashboardCore.chartRows(this.dashboardHistory||[],this.chartRange||'1M'),empty=document.getElementById('dash-chart-empty');
      if(rows.length<2){empty.hidden=false;empty.textContent=rows.length?'เริ่มบันทึกแล้ว กราฟจะแสดงเมื่อมีอย่างน้อย 2 วัน':'เริ่มเก็บประวัติจากวันนี้หลังเชื่อมต่อ Cloud';}
      const metric=this.chartMetric==='profit'?'profit':'stockValue';
      this.charts.dashGrowth=new Chart(document.getElementById('dash-growth-chart'),{type:'line',data:{labels:rows.map(r=>date(r.at)),datasets:[{label:metric==='profit'?'กำไรสะสม':'มูลค่าหุ้น',data:rows.map(r=>r[metric]*(this.displayCurrency==='THB'?r.exchangeRate:1)),borderColor:'#26c7f4',backgroundColor:'rgba(38,199,244,.12)',fill:true,tension:0,pointRadius:rows.length<3?4:0,spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:6}},y:{ticks:{maxTicksLimit:5}}}}});
      this.charts.dashAllocation=new Chart(document.getElementById('dash-allocation-chart'),{type:'doughnut',data:{labels:allocations.map(r=>r[0]),datasets:[{data:allocations.map(r=>Math.max(0,r[1])),backgroundColor:allocations.map(r=>r[2]),borderWidth:3,borderColor:'#0b192c'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'75%',animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${this.dashMoney(c.raw)}`}}}}});
    },
    bindModernDashboard(container){
      container.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>this.switchTab(b.dataset.go));
      container.querySelectorAll('[data-port]').forEach(b=>b.onclick=()=>{this.selectedPortfolioId=b.dataset.port;this.switchTab('portfolios');});
      container.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>this.movePortfolio(b.dataset.order,Number(b.dataset.delta)));
      container.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>this.openPortfolioCover(b.dataset.cover));
      container.querySelectorAll('[data-slide]').forEach(b=>b.onclick=()=>container.querySelector('.dash-carousel').scrollBy({left:Number(b.dataset.slide)*340,behavior:'smooth'}));
      container.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{this.chartMetric=b.dataset.metric;this.renderActiveTab();});
      container.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{this.chartRange=b.dataset.range;this.renderActiveTab();});
      container.querySelectorAll('[data-mover]').forEach(b=>b.onclick=()=>{this.moverMode=b.dataset.mover;try{sessionStorage.setItem('wolf-mover-mode',this.moverMode);}catch(_){}this.renderActiveTab();});
      container.querySelectorAll('[data-add-alert]').forEach(b=>b.onclick=()=>this.openAlertEditor());
      this.bindTransactionDetails(container);
    },
    dashboardDialog(title,body,onSubmit){
      document.getElementById('dash-dialog')?.remove();
      document.body.insertAdjacentHTML('beforeend',`<div id="dash-dialog" class="modal-backdrop"><section class="modal dash-dialog"><header><h2>${esc(title)}</h2><button type="button" data-dialog-close aria-label="ปิด">×</button></header><form>${body}<p class="dash-form-error" role="alert"></p><footer><button type="button" class="btn btn-secondary" data-dialog-close>ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก</button></footer></form></section></div>`);
      const modal=document.getElementById('dash-dialog');modal.querySelectorAll('[data-dialog-close]').forEach(b=>b.onclick=()=>this.closeModal('dash-dialog'));
      modal.addEventListener('keydown',e=>{if(e.key==='Escape')this.closeModal('dash-dialog');if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input,select,textarea')].filter(n=>!n.disabled&&!n.hidden),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
      modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await onSubmit(new FormData(e.target),modal);}catch(error){modal.querySelector('.dash-form-error').textContent=error.message;}finally{button.disabled=false;}};
      this.openModal('dash-dialog');return modal;
    },
    openPortfolioCover(id){
      const port=this.portfolios.find(p=>p.id===id);if(!port)return;
      let imageData=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(port.coverImage||'')?port.coverImage:null;
      const modal=this.dashboardDialog('รูปปก '+port.name,`<label>เลือกรูป JPEG, PNG หรือ WebP<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label><p>รูปจะถูกย่อให้เหมาะกับการ์ด และบันทึกบน Cloud ของบัญชีคุณ</p><img class="dash-cover-preview" alt="ตัวอย่างรูปปก" ${imageData?`src="${esc(imageData)}"`:'hidden'}><label><input type="checkbox" name="remove"> ใช้พื้นหลังเริ่มต้น</label>`,async(form)=>{const p=this.portfolios.find(p=>p.id===id);if(form.has('remove'))delete p.coverImage;else if(imageData)p.coverImage=imageData;else throw Error('เลือกรูปก่อนบันทึก');if(await this.saveData())this.closeModal('dash-dialog');});
      modal.querySelector('[name="cover"]').onchange=async e=>{
        const file=e.target.files[0];if(!file)return;const error=modal.querySelector('.dash-form-error'),button=modal.querySelector('[type="submit"]');button.disabled=true;
        try{if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('ใช้รูป JPEG/PNG/WebP ขนาดไม่เกิน 10 MB');const url=URL.createObjectURL(file),img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('อ่านรูปไม่ได้'));img.src=url;});const canvas=document.createElement('canvas');canvas.width=800;canvas.height=360;const scale=Math.max(800/img.width,360/img.height);canvas.getContext('2d').drawImage(img,(800-img.width*scale)/2,(360-img.height*scale)/2,img.width*scale,img.height*scale);imageData=canvas.toDataURL('image/jpeg',.78);const preview=modal.querySelector('img');preview.src=imageData;preview.hidden=false;error.textContent='';}finally{URL.revokeObjectURL(url);}}catch(e){error.textContent=e.message;}finally{button.disabled=false;}
      };
    },
    alertSummaryHTML(){return section('การแจ้งเตือนราคา','PRICE ALERTS',this.alertRowsHTML(false),'<div class="dash-actions"><button data-add-alert>+ เพิ่ม Alert</button><button data-go="alerts">ดูทั้งหมด ↗</button></div>');},
    alertRowsHTML(all){
      const alerts=(this.priceAlerts||[]).filter(a=>all||a.isActive||a.triggeredAt&&!a.acknowledgedAt).map(a=>{const price=this.marketQuotes?.[a.ticker]?.priceUSD;return {...a,price,distance:price>0?Math.abs(price-a.targetPrice)/price*100:null};}).sort((a,b)=>Number(!!b.triggeredAt&&!b.acknowledgedAt)-Number(!!a.triggeredAt&&!a.acknowledgedAt)||(a.distance??Infinity)-(b.distance??Infinity));
      const labels={buy:'ซื้อเมื่อถึง',take_profit:'ขายทำกำไร',stop_loss:'ขายจำกัดขาดทุน'};
      return alerts.length?`<div class="dash-alerts">${(all?alerts:alerts.slice(0,4)).map(a=>`<article><div class="dash-alert-title">${this.renderStockLogoHTML(a.ticker,'#22c6ed',30)}<b>${esc(a.ticker)}</b><span>${labels[a.type]}</span>${all?`<button data-edit-alert="${esc(a.id)}">แก้ไข</button>`:''}</div><div class="dash-alert-prices"><span>ปัจจุบัน <b>${a.price>0?this.dashMoney(a.price):'ไม่สามารถดึงราคาได้'}</b></span><span>เป้าหมาย <b>${this.dashMoney(a.targetPrice)}</b></span></div>${a.triggeredAt?`<small class="gain">ถึงเป้าหมายแล้ว · ${esc(date(a.triggeredAt))}</small>`:`<small>${a.distance===null?'รอข้อมูลราคา':`ห่างเป้าหมาย ${a.distance.toFixed(2)}%`}</small>`}${!a.triggeredAt&&a.distance!==null?`<progress max="100" value="${Math.max(0,100-a.distance)}" aria-label="ความใกล้ราคาเป้าหมาย"></progress>`:''}${!a.isActive?'<small>ปิดใช้งานแล้ว</small>':''}${all?`<div class="dash-actions"><button data-alert-action="${esc(a.id)}" data-action="rearm">เปิดใช้อีกครั้ง</button><button data-alert-action="${esc(a.id)}" data-action="dismiss">รับทราบ / ปิด</button><button data-alert-action="${esc(a.id)}" data-action="delete">ลบ</button></div>`:''}</article>`).join('')}</div>`:'<p class="dash-muted">ยังไม่มี Alert ตั้งราคาที่ต้องการเข้าซื้อหรือขายได้</p>';
    },
    renderAlertsPage(container){container.innerHTML=section('การแจ้งเตือนราคา','แจ้งเมื่อเปิดเว็บ · ไม่ส่งคำสั่งซื้อขาย',this.alertRowsHTML(true),'<button class="btn btn-primary" data-add-alert>+ เพิ่ม Alert</button>');this.bindModernDashboard(container);container.querySelectorAll('[data-edit-alert]').forEach(b=>b.onclick=()=>this.openAlertEditor(b.dataset.editAlert));container.querySelectorAll('[data-alert-action]').forEach(b=>b.onclick=async()=>{const a=this.priceAlerts.find(a=>a.id===b.dataset.alertAction);if(!a)return;if(b.dataset.action==='delete'){if(!confirm('ลบ Alert นี้?'))return;this.clearLegacyTarget(a);this.priceAlerts=this.priceAlerts.filter(x=>x.id!==a.id);}else if(b.dataset.action==='rearm'){a.isActive=true;a.triggeredAt=null;a.acknowledgedAt=null;}else{a.isActive=false;a.acknowledgedAt=new Date().toISOString();}if(await this.saveData())this.renderActiveTab();});},
    clearLegacyTarget(alert){
      for(const p of this.portfolios)for(const h of p.holdings)for(const field of ['dipTarget1','dipTarget2','dipTarget3','sellTargetUSD','stopLossUSD'])if(alert.id===`legacy:${p.id}:${h.id}:${field}`){delete h[field];if(field==='dipTarget1')delete h.dipTargetUSD;}
    },
    openAlertEditor(id){
      const a=(this.priceAlerts||[]).find(a=>a.id===id),holdings=this.portfolios.flatMap(p=>p.holdings.filter(DashboardCore.stock).map(h=>({p,h})));
      if(a&&!holdings.some(({p,h})=>p.id===a.portfolioId&&h.ticker.toUpperCase()===a.ticker)){this.showToast({title:'หุ้นนี้ไม่ได้ถืออยู่ในพอร์ตแล้ว',message:'ลบ Alert เดิมหรือเพิ่ม Alert สำหรับหุ้นที่ถืออยู่',type:'info'});return;}
      if(!holdings.length){this.showToast({title:'เพิ่มหุ้นในพอร์ตก่อนตั้ง Alert',type:'info'});return;}
      this.dashboardDialog(a?'แก้ไข Alert':'เพิ่ม Alert',`<label>หุ้นในพอร์ต<select name="holding" required>${holdings.map(({p,h})=>`<option value="${esc(p.id+'|'+h.ticker.toUpperCase())}" ${a?.portfolioId===p.id&&a?.ticker===h.ticker.toUpperCase()?'selected':''}>${esc(h.ticker+' · '+p.name)}</option>`).join('')}</select></label><label>เงื่อนไข<select name="type"><option value="buy" ${a?.type==='buy'?'selected':''}>ซื้อเมื่อราคาลงถึง</option><option value="take_profit" ${a?.type==='take_profit'?'selected':''}>ขายทำกำไรเมื่อราคาขึ้นถึง</option><option value="stop_loss" ${a?.type==='stop_loss'?'selected':''}>ขายจำกัดขาดทุนเมื่อราคาลงถึง</option></select></label><label>ราคาเป้าหมาย (USD)<input name="target" type="number" min="0.00000001" step="any" required value="${a?.targetPrice||''}"></label>`,async form=>{const target=PortfolioCore.inputNumber(form.get('target'),{exclusive:true});if(!Number.isFinite(target))throw Error('ราคาเป้าหมายต้องมากกว่า 0');const [portfolioId,ticker]=form.get('holding').split('|'),now=new Date().toISOString();const item={id:a?.id||crypto.randomUUID(),ticker,portfolioId,type:form.get('type'),targetPrice:target,currency:'USD',isActive:true,triggeredAt:null,createdAt:a?.createdAt||now,updatedAt:now};if(a)this.clearLegacyTarget(a);this.priceAlerts=[...(this.priceAlerts||[]).filter(x=>x.id!==item.id),item];if(await this.saveData())this.closeModal('dash-dialog');});
    },
    dashboardTransactions(){return PortfolioCore.transactionTimeline(this.dataPayload()).map(r=>({...r,portfolioName:r.portfolioId?.startsWith('trading:')?(this.tradingData?.[r.portfolioId.slice(8)]?.name||r.portfolioName):r.portfolioName}));},
    transactionPreviewHTML(){const rows=this.dashboardTransactions().slice(0,5);return section('ประวัติธุรกรรม','TRANSACTIONS',this.compactTransactionsHTML(rows),'<button data-go="transactions">ดูทั้งหมด ↗</button>');},
    compactTransactionsHTML(rows){return rows.length?`<ol class="dash-transactions">${rows.map(r=>`<li><button data-transaction="${esc(r.kind+'|'+r.id)}"><span class="dash-type type-${esc(r.type.toLowerCase())}">${esc(r.type)}</span><span><b>${esc(r.ticker||({DEPOSIT:'ฝากเงิน',WITHDRAW:'ถอนเงิน',ADJUSTMENT:'ปรับยอด'}[r.type])||r.type)}</b><small>${esc(r.portfolioName)} · ${esc(date(r.at))}</small></span><strong>${this.dashMoney(DashboardCore.transactionAmount(r),true)}</strong></button></li>`).join('')}</ol>`:'<p class="dash-muted">ยังไม่มีรายการธุรกรรม</p>';},
    renderTransactionsPage(container){
      const f=this.transactionFilters||{},page=this.transactionPage||0;
      const rows=this.dashboardTransactions().filter(r=>(!f.term||`${r.ticker||''} ${r.portfolioName||''}`.toLowerCase().includes(f.term.toLowerCase()))&&(!f.type||r.type===f.type)&&(!f.port||r.portfolioId===f.port)&&(!f.from||PortfolioCore.bangkokDate(Date.parse(r.at))>=f.from)&&(!f.to||PortfolioCore.bangkokDate(Date.parse(r.at))<=f.to));if(f.sort==='asc')rows.reverse();
      const controls=`<div class="dash-filters"><label>ค้นหา<input data-tf="term" value="${esc(f.term||'')}" placeholder="Ticker / ชื่อพอร์ต"></label><label>ประเภท<select data-tf="type"><option value="">ทั้งหมด</option>${['BUY','SELL','DIVIDEND','DEPOSIT','WITHDRAW','ADJUSTMENT'].map(t=>`<option ${f.type===t?'selected':''}>${t}</option>`).join('')}</select></label><label>พอร์ต<select data-tf="port"><option value="">ทั้งหมด</option>${[...this.portfolios,...Object.entries(this.tradingData||{}).map(([id,t])=>({id:'trading:'+id,name:t.name||id}))].map(p=>`<option value="${esc(p.id)}" ${f.port===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>ตั้งแต่<input type="date" data-tf="from" value="${esc(f.from||'')}"></label><label>ถึง<input type="date" data-tf="to" value="${esc(f.to||'')}"></label><label>เรียง<select data-tf="sort"><option value="desc">ใหม่ก่อน</option><option value="asc" ${f.sort==='asc'?'selected':''}>เก่าก่อน</option></select></label></div>`;
      container.innerHTML=section('ประวัติธุรกรรม',`${rows.length} รายการ · แสดงเป็น ${this.displayCurrency}`,controls+this.compactTransactionsHTML(rows.slice(page*20,page*20+20))+`<div class="dash-pagination"><button data-page="${page-1}" ${page===0?'disabled':''}>ก่อนหน้า</button><span>หน้า ${page+1} / ${Math.max(1,Math.ceil(rows.length/20))}</span><button data-page="${page+1}" ${(page+1)*20>=rows.length?'disabled':''}>ถัดไป</button></div>`);
      container.querySelectorAll('[data-tf]').forEach(input=>input.onchange=()=>{this.transactionFilters={...this.transactionFilters,[input.dataset.tf]:input.value};this.transactionPage=0;this.renderActiveTab();});container.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{this.transactionPage=Number(b.dataset.page);this.renderActiveTab();});this.bindTransactionDetails(container);
    },
    bindTransactionDetails(container){container.querySelectorAll('[data-transaction]').forEach(b=>b.onclick=()=>{const row=this.dashboardTransactions().find(r=>r.kind+'|'+r.id===b.dataset.transaction);if(!row)return;const labels={shares:'จำนวนหุ้น',priceUSD:'ราคาต่อหุ้น USD',feeUSD:'ค่าธรรมเนียม USD',costBasisUSD:'ต้นทุนส่วนที่ขาย USD',realizedPLUSD:'กำไรขายแล้ว USD',cashBeforeUSD:'เงินสดก่อน USD',cashAfterUSD:'เงินสดหลัง USD'};const body=`<p>${esc(row.type+' '+(row.ticker||''))} · ${esc(row.portfolioName)} · ${esc(date(row.at))}</p><strong>${this.dashMoney(DashboardCore.transactionAmount(row),true)}</strong><dl>${Object.entries(labels).filter(([k])=>typeof row[k]==='number').map(([k,v])=>`<dt>${v}</dt><dd>${row[k].toLocaleString('en-US',{maximumFractionDigits:8})}</dd>`).join('')}</dl><p>${esc(row.note||'')}</p>`;const modal=this.dashboardDialog('รายละเอียดธุรกรรม',body,async()=>{});modal.querySelector('footer').innerHTML='<button type="button" class="btn" data-done>ปิด</button>';modal.querySelector('[data-done]').onclick=()=>this.closeModal('dash-dialog');});}
  });
})();
