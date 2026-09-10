/* Data and growth views for the online-only application. */
const originalHoldingModal = PixelStewardApp.prototype.openHoldingModal;
const originalCashModal = PixelStewardApp.prototype.openCashBufferModal;
Object.assign(PixelStewardApp.prototype, {
  async init() {
    this.loadLocalData();
    this.loadPrivacyPreference();
    this.loadSidebarPreference();
    this.setupEventListeners();
    this.setupModals();
    this.setupOnlineUI();
    this.renderActiveTab();
    this.initFirebase();
    if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations=>registrations.filter(r=>r.scope===new URL('./',location.href).href).forEach(r=>r.update())).catch(()=>{});
    setInterval(() => {
      if (document.visibilityState === 'visible' && this.cloudReady && this.isFirebaseOnline) this.syncLiveMarketPrices();
    }, 60000);
  },
  loadLocalData() {
    Object.assign(this, PortfolioCore.empty());
    this.cloudReady = false;
    this.saving = false;
    this.revision = 0;
    this.generation = null;
    this.updateSidebarFxRate();
  },
  enrichPortfoliosWithIPS(ports) {
    return PortfolioCore.normalize({portfolios:ports}).portfolios;
  },
  initFirebase() {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') { this.setCloudStatus('offline', 'โหลด Firebase Authentication ไม่สำเร็จ'); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      this.auth=firebase.auth();
      this.db=firebase.database();
      this.auth.useDeviceLanguage();
      this.auth.onAuthStateChanged(user=>this.connectAuthenticatedCloud(user));
      this.auth.getRedirectResult().catch(error=>this.handleAuthError(error));
    } catch(error) { this.handleAuthError(error); }
  },
  disconnectCloud() {
    this.connectionRef?.off();
    this.dbRef?.off();
    this.connectionRef=null;this.dbRef=null;this.cloudStore=null;
    this.cloudReady=false;this.isFirebaseOnline=false;
  },
  connectAuthenticatedCloud(user) {
    const previousUid=this.authUser?.uid||null;
    this.disconnectCloud();
    this.authUser=user||null;
    if(!user || (previousUid && previousUid!==user.uid)){
      Object.assign(this,PortfolioCore.empty());
      this.cloudBaseline=null;this.revision=0;this.generation=null;
      this.formRevision=null;this.viewDirty=false;
      this.updateSidebarFxRate();
    }
    this.updateAuthUI();
    if(!user){
      this.setCloudStatus('offline','กรุณาเข้าสู่ระบบ Google ก่อนบันทึก');
      this.renderActiveTab();
      return;
    }
    const path=`users/${user.uid}/pixel_steward_v4`;
    this.dbRef=this.db.ref(path);
    const authenticatedRequest=OnlineCloudStore.authenticatedRequest(()=>this.auth.currentUser?.getIdToken());
    this.cloudStore=new OnlineCloudStore(`${firebaseConfig.databaseURL}/${path}.json`,authenticatedRequest);
    this.connectionRef=this.db.ref('.info/connected');
    this.connectionRef.on('value',snap=>{
      this.isFirebaseOnline=snap.val()===true && !!this.auth.currentUser;
      this.setCloudStatus(this.isFirebaseOnline?'online':'offline',this.isFirebaseOnline?`เชื่อมต่อแล้ว • ${user.email||'บัญชี Google'}`:'ไม่มีการเชื่อมต่อ — ยังบันทึกไม่ได้');
      if(this.isFirebaseOnline&&this.cloudReady)this.syncLiveMarketPrices();
    });
    this.dbRef.on('value', snap => {
      const value = snap.val();
      if (!value) {
        if (this.initializingCloud) return;
        this.initializingCloud = true;
        this.cloudStore.transaction(current => current ? undefined : {schemaVersion:4, revision:0, generation:crypto.randomUUID(), data:PortfolioCore.empty()}, undefined, false)
          .catch(() => this.setCloudStatus('offline', 'ไม่มีสิทธิ์สร้างข้อมูล'))
          .finally(() => {this.initializingCloud=false;});
        return;
      }
      if (value.schemaVersion !== 4) { this.cloudReady=false; this.setCloudStatus('offline','รูปแบบฐานข้อมูลไม่รองรับ'); return; }
      if (this.saving) { this.deferredCloud=value; return; }
      const first = !this.cloudReady;
      this.acceptCloud(value);
      if (first) this.syncLiveMarketPrices();
    }, error => { this.cloudReady=false; this.setCloudStatus('offline',error?.code==='PERMISSION_DENIED'?'Rules ยังไม่อนุญาตบัญชีนี้':'ไม่มีสิทธิ์อ่านฐานข้อมูล'); });
  },
  async signInWithGoogle() {
    if(!this.auth)return;
    this.setCloudStatus('syncing','กำลังเปิด Google Sign-In');
    try { await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch(error){
      if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(error.code))return this.auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
      this.handleAuthError(error);
    }
  },
  async signOutGoogle() { await this.auth?.signOut(); },
  handleAuthError(error) {
    const unauthorized=error?.code==='auth/unauthorized-domain';
    this.setCloudStatus('offline',unauthorized?'เพิ่มโดเมน GitHub Pages ใน Firebase Authorized domains':'Google Sign-In ไม่สำเร็จ');
    this.showToast?.({title:'เข้าสู่ระบบไม่สำเร็จ',message:unauthorized?'เพิ่ม snoopy1989doo-source.github.io ใน Authentication > Settings > Authorized domains':(error?.message||'ลองใหม่อีกครั้ง'),type:'error'});
  },
  updateAuthUI() {
    const button=document.getElementById('btn-auth-action');
    if(button){button.hidden=!!this.authUser;button.style.display=this.authUser?'none':'';button.textContent='เข้าสู่ระบบ Google';}
    if(this.currentTab==='settings'&&document.getElementById('app-view-container'))this.renderSettingsView(document.getElementById('app-view-container'));
  },
  acceptCloud(value) {
    Object.assign(this, PortfolioCore.normalize(value.data));
    this.revision=value.revision;
    this.generation=value.generation;
    this.cloudReady=true;
    this.cloudBaseline=PortfolioCore.clone(value);
    this.updateSidebarFxRate();
    if (!this.viewDirty && !document.querySelector('.modal-backdrop.open')) this.renderActiveTab();
    else this.setCloudStatus('online','ข้อมูลใหม่พร้อมแล้ว — ฟอร์มเดิมยังไม่บันทึก');
  },
  dataPayload() {
    return PortfolioCore.normalize(Object.fromEntries(Object.keys(PortfolioCore.empty()).map(key=>[key,this[key]])));
  },
  async saveData(options={}) {
    if (!this.cloudReady || !this.isFirebaseOnline || this.saving || !this.dbRef) {
      if (this.cloudBaseline) Object.assign(this,PortfolioCore.normalize(this.cloudBaseline.data));
      this.showSaveGate(this.saving?'กำลังบันทึกรายการก่อนหน้า':(this.authUser?'รอข้อมูลล่าสุดจาก Cloud ก่อนบันทึก':'เข้าสู่ระบบ Google ก่อนบันทึก'));
      return false;
    }
    const next=this.dataPayload();
    this.flagUnexplainedChanges(next);
    // An edit form must not silently apply calculations based on a stale balance.
    const expected=this.formRevision ?? this.revision;
    const generation=this.generation;
    this.saving=true;this.setSavingUI(true);
    this.setCloudStatus('syncing','กำลังบันทึก');
    try {
      const result=await (this.cloudStore||this.dbRef).transaction(current=>PortfolioCore.commit(current,expected,next,generation),undefined,false,options.deadline);
      this.saving=false;this.setSavingUI(false);
      this.formRevision=null;
      this.viewDirty=false;
      const committedValue=result.snapshot.val();
      const current=this.deferredCloud && (!committedValue || this.deferredCloud.generation!==committedValue.generation || this.deferredCloud.revision>committedValue.revision) ? this.deferredCloud : committedValue;
      this.deferredCloud=null;
      if (current) this.acceptCloud(current);
      if (!result.committed) {
        this.showToast({title:'ข้อมูลถูกแก้จากอีกอุปกรณ์แล้ว',message:'โหลดข้อมูลล่าสุดแล้ว กรุณาเปิดรายการและแก้ใหม่ เพื่อไม่ให้ยอดเก่าทับยอดใหม่',type:'error'});
        return false;
      }
      this.setCloudStatus('online','บันทึกบน Cloud แล้ว');
      if(!options.snapshot) setTimeout(()=>this.recordQuarterAfterRefresh(PortfolioCore.bangkokDate()),0);
      return true;
    } catch (error) {
      this.saving=false;this.setSavingUI(false);
      this.formRevision=null;
      if (this.cloudBaseline) Object.assign(this,PortfolioCore.normalize(this.cloudBaseline.data));
      this.cloudReady=false;
      this.showToast({title:'ยังยืนยันผลบันทึกไม่ได้',message:'โหลดหน้าใหม่เพื่อตรวจยอดล่าสุดก่อนลองซ้ำ ระบบจะไม่ส่งรายการนี้เองเมื่อกลับมาออนไลน์',type:'error'});
      return false;
    }
  },
  handleCloudSync(data) {
    // Used for explicit import only; realtime reads are handled by acceptCloud.
    const validated=PortfolioCore.validateImport(data);
    Object.assign(this,validated);
    return this.saveData();
  },
  pushDataToCloud() { return this.saveData(); },
  flagUnexplainedChanges(next) {
    const before=this.cloudBaseline?.data;
    if(!before || !next.quarterlySnapshots.length)return;
    const newFlows=next.cashFlows.filter(f=>!(before.cashFlows||[]).some(old=>old.id===f.id));
    const newTrades=next.tradingHistory.filter(t=>!(before.tradingHistory||[]).some(old=>old.id===t.id));
    const changedDividends=JSON.stringify(next.dividends)!==JSON.stringify(before.dividends||[]);
    const shape=p=>JSON.stringify({cash:p?.cashBufferUSD||0,holdings:(p?.holdings||[]).map(h=>[h.id,h.shares,h.avgCostNative??h.avgCostUSD]).sort()});
    const ids=new Set([...(before.portfolios||[]).map(p=>p.id),...next.portfolios.map(p=>p.id)]);
    for(const id of ids){
      if(shape(before.portfolios?.find(p=>p.id===id))===shape(next.portfolios.find(p=>p.id===id)))continue;
      if(newFlows.some(f=>f.portfolioId===id)||newTrades.some(t=>t.portfolioId===id)||changedDividends)continue;
      next.cashFlows.push({id:crypto.randomUUID(),type:'ADJUSTMENT',portfolioId:id,date:PortfolioCore.bangkokDate(),at:new Date().toISOString(),amountUSD:0,amountTHB:0,note:'แก้หรือลบยอดถือครองโดยไม่มีรายการเงินเข้าออก'});
    }
    for(const id of new Set([...Object.keys(before.tradingData||{}),...Object.keys(next.tradingData)])){
      if(!!before.tradingData?.[id]===!!next.tradingData[id])continue;
      next.cashFlows.push({id:crypto.randomUUID(),type:'ADJUSTMENT',portfolioId:'trading:'+id,date:PortfolioCore.bangkokDate(),at:new Date().toISOString(),amountUSD:0,amountTHB:0,note:'เพิ่มหรือลบพอร์ตเทรด'});
    }
  },
  setCloudStatus(status,text) {
    for(const id of ['cloud-status-text','online-status']){const el=document.getElementById(id);if(el){el.textContent=text;el.dataset.status=status;}}
  },
  setSavingUI(active){document.querySelectorAll('.modal-backdrop.open button[type="submit"]').forEach(button=>{button.disabled=active;button.dataset.originalText||=button.textContent;if(active)button.textContent='กำลังบันทึก…';else button.textContent=button.dataset.originalText;});},
  showSaveGate(message){const now=Date.now();if(now-(this.lastSaveGateAt||0)<1800)return;this.lastSaveGateAt=now;this.showToast({title:message,type:'error'});},
  getPortfolioGoalUSD(port){return port?.goalCurrency==='THB'&&Number(port.goalTHB)>=0?Number(port.goalTHB)/(this.exchangeRate||1):Math.max(0,Number(port?.goalUSD)||0);},
  setupOnlineUI() {
    const authButton=document.createElement('button');authButton.id='btn-auth-action';authButton.className='btn btn-primary auth-action';authButton.textContent='เข้าสู่ระบบ Google';authButton.addEventListener('click',()=>this.signInWithGoogle());
    const status=document.createElement('div');status.id='online-status';status.setAttribute('role','status');status.textContent='กำลังตรวจบัญชี Google';document.querySelector('.header-right')?.append(status,authButton);
    document.querySelectorAll('.modal-backdrop').forEach(modal=>{modal.inert=true; modal.setAttribute('aria-hidden','true');});
    document.addEventListener('input',event=>{
      if (event.target.closest('#app-view-container') && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) {
        if (!this.viewDirty) this.formRevision=this.revision;
        this.viewDirty=true;
      }
    });
    document.addEventListener('submit',event=>{
      if (!this.cloudReady || !this.isFirebaseOnline || this.saving) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.showSaveGate(this.saving?'กำลังบันทึกรายการก่อนหน้า':'เข้าสู่ระบบและรอข้อมูลล่าสุดก่อนบันทึก');
      }
    },true);
    document.addEventListener('click',event=>{
      if(this.saving && event.target.closest('button')){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    document.addEventListener('click',event=>{const b=event.target.closest('[data-trading-cash]');if(b)this.openCashBufferModal('trading:'+b.dataset.tradingCash);});
    document.addEventListener('keydown',event=>{
      const modal=document.querySelector('.modal-backdrop.open');
      if (!modal) return;
      if(event.key==='Escape') this.closeModal(modal.id);
      if(event.key==='Tab') {
        const elements=[...modal.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled && el.getClientRects().length);
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal)this.closeModal(modal.id);}));
    const date=document.createElement('input');
    date.type='date'; date.id='cash-flow-date'; date.className='form-input'; date.required=true;
    const label=document.createElement('label'); label.htmlFor=date.id; label.textContent='วันที่เงินเข้า/ออก';
    document.getElementById('form-cash-buffer')?.prepend(label,date);
    const cashForm=document.getElementById('form-cash-buffer');
    cashForm?.insertAdjacentHTML('afterbegin','<label for="cash-flow-fx">อัตรา THB/USD ของรายการ (แก้ตามอัตราที่ใช้จริง)</label><input id="cash-flow-fx" type="number" min="0.000001" step="any" class="form-input" required>');
    cashForm?.addEventListener('input',e=>{const rate=Number(document.getElementById('cash-flow-fx').value);if(!(rate>0))return;const usd=document.getElementById('cash-amount-usd'),thb=document.getElementById('cash-amount-thb');if(e.target===thb)usd.value=thb.value===''?'':String(Number(thb.value)/rate);else if(e.target===usd||e.target.id==='cash-flow-fx')thb.value=usd.value===''?'':String(Number(usd.value)*rate);});
    // Heatmap stays inside Overview; AI export lives inside Settings to keep mobile navigation compact.
    document.querySelectorAll('[data-tab="quarterly"]').forEach(button=>{const span=button.querySelector('span:last-child');if(span)span.textContent='การเติบโต';});
    const form=document.getElementById('form-holding');
    if(form){const group=document.createElement('div');group.innerHTML='<label for="holding-currency">สกุลเงินต้นทุนและราคาที่กรอก</label><select id="holding-currency" class="form-select"><option value="USD">USD — ดอลลาร์</option><option value="THB">THB — บาท</option></select><p>เงินฝาก: กรอกจำนวน 1 และใส่ยอดเงินในช่องราคา • หุ้นไทยใช้สัญลักษณ์ลงท้าย .BK</p>';form.prepend(group);}
    if(form){const group=document.createElement('div');group.innerHTML='<label for="holding-asset-type">ประเภทสินทรัพย์</label><select id="holding-asset-type" class="form-select"><option value="market">หุ้น / คริปโต — ดึงราคาจากบริการ</option><option value="manual">เงินฝาก / สินทรัพย์อื่น — กรอกยอดเอง</option></select><label for="holding-dividend-yield">อัตราปันผลคาดการณ์ต่อปี (%) ถ้าทราบ</label><input id="holding-dividend-yield" class="form-input" type="number" min="0" step="any" placeholder="ไม่ระบุ = ไม่คาดการณ์ปันผล">';form.prepend(group);}
    document.querySelectorAll('label[for="holding-avg-cost"],label[for="holding-current-price"]').forEach(el=>el.textContent=el.htmlFor==='holding-avg-cost'?'ต้นทุนเฉลี่ยต่อหน่วย (สกุลเงินที่เลือก)':'ราคาปัจจุบันต่อหน่วย (สกุลเงินที่เลือก)');
    document.getElementById('modal-trading-history')?.addEventListener('click',event=>{const b=event.target.closest('[data-delete-trading-month]');if(b)this.deleteTradingHistoryEntry(b.dataset.tradingKey,Number(b.dataset.deleteTradingMonth));});
  },
  openModal(id) {
    const modal=document.getElementById(id); if(!modal)return;
    this.returnFocus=document.activeElement; this.formRevision=this.revision;
    modal.inert=false;modal.setAttribute('aria-hidden','false');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.classList.add('open');
    modal.querySelector('input:not([type="hidden"]),select,button')?.focus();
    if(id==='modal-cash-buffer'){document.getElementById('cash-flow-date').value=PortfolioCore.bangkokDate();document.getElementById('cash-flow-fx').value=this.exchangeRate;}
  },
  closeModal(id) {
    const modal=document.getElementById(id);if(!modal)return;
    modal.classList.remove('open');modal.inert=true;modal.setAttribute('aria-hidden','true');this.returnFocus?.focus();
    if(!this.saving){this.formRevision=null;if(this.cloudBaseline){Object.assign(this,PortfolioCore.normalize(this.cloudBaseline.data));this.renderActiveTab();}}
  },
  openHoldingModal(id,portId) {
    originalHoldingModal.call(this,id,portId);
    const h=this.portfolios.find(p=>p.id===portId)?.holdings?.find(h=>h.id===id);
    document.getElementById('holding-currency').value=h?.currency||'USD';
    document.getElementById('holding-asset-type').value=h?.assetType||'market';
    document.getElementById('holding-dividend-yield').value=h?.dividendYield??'';
    if(h?.currency==='THB'){
      document.getElementById('holding-avg-cost').value=h.avgCostNative??h.avgCostUSD*this.exchangeRate;
      document.getElementById('holding-current-price').value=h.currentPriceNative??h.currentPriceUSD*this.exchangeRate;
    }
  },
  saveHoldingForm() {
    const get=id=>document.getElementById(id)?.value;
    const port=this.portfolios.find(p=>p.id===get('holding-portfolio-id'));if(!port)return;
    const id=get('holding-id');const ticker=(get('holding-ticker')||'').trim().toUpperCase();
    const shares=Number(get('holding-shares')),cost=Number(get('holding-avg-cost')),price=Number(get('holding-current-price'));
    if(!/^[\p{L}\p{N}._^=-]{1,30}$/u.test(ticker) || ![shares,cost,price].every(n=>Number.isFinite(n)&&n>=0)){alert('กรอกสัญลักษณ์ จำนวน ต้นทุนและราคาเป็นตัวเลขตั้งแต่ศูนย์');return;}
    if(port.holdings.some(h=>h.ticker.toUpperCase()===ticker&&h.id!==id)){alert('มีสินทรัพย์นี้ในพอร์ตแล้ว กรุณาแก้รายการเดิม');return;}
    const original=this.portfolios.flatMap(p=>p.holdings||[]).find(h=>h.id===id);
    const currency=get('holding-currency')||'USD';const rate=currency==='THB'?this.exchangeRate:1;
    const h={...original,id:id||crypto.randomUUID(),ticker,name:get('holding-name')||ticker,shares,currency,
      avgCostNative:cost,currentPriceNative:price,avgCostUSD:cost/rate,currentPriceUSD:price/rate,change1dPct:Number(get('holding-1d-change'))||0,
      assetType:get('holding-asset-type')||'market',dividendYield:Math.max(0,Number(get('holding-dividend-yield'))||0),priceSource:'กรอกเอง',priceReceivedAt:new Date().toISOString(),priceMarketAt:null};
    for(let i=1;i<=3;i++)h['dipTarget'+i]=Number(get('holding-dip-target-'+i))||null;
    h.dipTargetUSD=h.dipTarget1;
    this.portfolios.forEach(p=>p.holdings=(p.holdings||[]).filter(x=>x.id!==h.id));port.holdings.push(h);
    // Holdings are a current-state correction, not an inferred deposit or profit.
    if(this.quarterlySnapshots.length)this.cashFlows.push({id:crypto.randomUUID(),portfolioId:port.id,type:'ADJUSTMENT',date:PortfolioCore.bangkokDate(),at:new Date().toISOString(),amountUSD:0,amountTHB:0,note:'แก้ holdings ปัจจุบัน: '+ticker});
    this.saveData().then(ok=>{if(ok){this.closeModal('modal-holding');this.renderActiveTab();}});
  },
  calculateHoldingStats(h) {
    const shares=Number(h.shares)||0;
    const native=h.currency==='THB';
    const avgCost=native&&Number.isFinite(h.avgCostNative)?h.avgCostNative/this.exchangeRate:Number(h.avgCostUSD)||0;
    const currentPrice=native&&Number.isFinite(h.currentPriceNative)?h.currentPriceNative/this.exchangeRate:Number(h.currentPriceUSD)||0;
    const totalCostUSD=shares*avgCost,marketValueUSD=shares*currentPrice;
    return {shares,avgCost,currentPrice,change1d:Number(h.change1dPct)||0,totalCostUSD,marketValueUSD,
      unrealizedPLUSD:marketValueUSD-totalCostUSD,unrealizedPLPct:totalCostUSD>0?(marketValueUSD-totalCostUSD)/totalCostUSD*100:0,
      marketValueTHB:marketValueUSD*this.exchangeRate,unrealizedPLTHB:(marketValueUSD-totalCostUSD)*this.exchangeRate};
  },
  async fetchViaFastProxies(url) {
    for(const endpoint of [url,`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`]) {
      try{const response=await this.fetchWithTimeout(endpoint,4500);if(response.ok)return await response.json();}catch(error){}
    }
    return null;
  },
  async fetchBatchStockPrices(tickers,updates) {
    for(const ticker of tickers){
      if(this.finnhubApiKey && Date.now()>=(this.finnhubBackoffUntil||0)){
        const wait=Math.max(0,1200-(Date.now()-(this.lastFinnhubRequest||0)));if(wait)await new Promise(r=>setTimeout(r,wait));
        this.lastFinnhubRequest=Date.now();
        try{const r=await this.fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(this.finnhubApiKey)}`,4500);
          if(r.status===429)this.finnhubBackoffUntil=Date.now()+60000;
          if(r.ok){const d=await r.json();if(d.c>0){updates[ticker]={priceUSD:d.c,change1dPct:d.dp||0,source:'Finnhub',marketAt:d.t?new Date(d.t*1000).toISOString():null};}}
        }catch(error){}
      }
      const data=await this.fetchViaFastProxies(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`);
      const result=data?.chart?.result?.[0];const meta=result?.meta;
      const closes=result?.indicators?.quote?.[0]?.close||[];
      let last=closes.length-1;while(last>=0 && !(closes[last]>0))last--;
      const time=last>=0?result.timestamp?.[last]:meta?.regularMarketTime;
      const price=last>=0?closes[last]:meta?.regularMarketPrice;
      if(price>0 && (!updates[ticker] || time*1000>Date.parse(updates[ticker].marketAt||0)))updates[ticker]={priceUSD:price,change1dPct:meta?.chartPreviousClose>0?(price/meta.chartPreviousClose-1)*100:0,source:'Yahoo 1m (รวมช่วงนอกเวลาหากมีข้อมูล)',marketAt:time?new Date(time*1000).toISOString():null};
    }
  },
  checkAndAutoRecordQuarterlySnapshots() { /* Called only after a completed market refresh below. */ },
  createCurrentPortfolioSnapshot(year,quarter,dateStr,notes='') {
    const portValuesUSD={};const portNames={};
    this.portfolios.forEach(p=>{portValuesUSD[p.id]=this.calculatePortfolioStats(p).totalValueUSD;portNames[p.id]=p.name;});
    const {balances,totalTradingUSD}=this.getTradingLatestBalances();
    for(const [id,balance] of Object.entries(balances)){portValuesUSD['trading:'+id]=balance;portNames['trading:'+id]=this.tradingData[id].name;}
    return {year,quarter,date:dateStr,recordedAt:new Date().toISOString(),exchangeRate:this.exchangeRate,
      portValuesUSD,portNames,totalUSD:this.portfolios.reduce((sum,p)=>sum+this.calculatePortfolioStats(p).totalValueUSD,0)+totalTradingUSD,
      holdings:PortfolioCore.clone(this.portfolios),cashFlows:PortfolioCore.clone(this.cashFlows||[]),notes};
  },
  async recordQuarterAfterRefresh(requestDate) {
    const end=PortfolioCore.quarterEnd();
    if(!end || end.date!==requestDate || !this.cloudReady || !this.isFirebaseOnline || this.saving || this.viewDirty || document.querySelector('.modal-backdrop.open'))return;
    const snapshot=this.createCurrentPortfolioSnapshot(end.year,end.quarter,end.date,'บันทึกจากการเข้าเว็บวันสิ้นไตรมาส');
    this.quarterlySnapshots=PortfolioCore.upsertSnapshot(this.quarterlySnapshots,snapshot,requestDate,Date.now());
    await this.saveData({snapshot:true,deadline:new Date(requestDate+'T23:59:59.999+07:00').getTime()});
  },
  async takeQuarterlySnapshot() {
    if(!PortfolioCore.quarterEnd()){this.showToast({title:'บันทึกได้เฉพาะวันสิ้นไตรมาส',message:'31 มี.ค. / 30 มิ.ย. / 30 ก.ย. / 31 ธ.ค. ตามเวลาไทย',type:'info'});return;}
    await this.syncLiveMarketPrices();
  },
  resetCurrentYearQuarterlySnapshots() {this.showToast({title:'เก็บประวัติจริงไว้เพื่อเทียบการเติบโต',type:'info'});},
  async syncLiveMarketPrices() {
    if(!this.cloudReady || !this.isFirebaseOnline || this.marketSyncing || this.saving || this.viewDirty || document.querySelector('.modal-backdrop.open'))return;
    this.marketSyncing=true;
    const requestDate=PortfolioCore.bangkokDate(); const revision=this.revision;
    const tickers=[...new Set(this.portfolios.flatMap(p=>(p.holdings||[]).filter(h=>h.assetType!=='manual').map(h=>h.ticker?.trim().toUpperCase())).filter(Boolean))];
    const ignored=['SSO','กอช.','KEPT','CASH','THB','USD'];
    const crypto=tickers.filter(t=>['BTC','ETH','BNB','SOL','XRP','DOGE'].includes(t));
    const thai=tickers.filter(t=>t.endsWith('.BK'));
    const us=tickers.filter(t=>!crypto.includes(t)&&!thai.includes(t)&&!ignored.includes(t));
    const updates={};
    try {
      await this.fetchLiveExchangeRate(); // Resolve FX before converting THB quotes.
      await Promise.allSettled([this.fetchCryptoPrices(crypto,updates),this.fetchThaiStockPrices(thai,updates),this.fetchBatchStockPrices(us,updates)]);
      if(revision!==this.revision || this.viewDirty || this.saving || document.querySelector('.modal-backdrop.open'))return;
      const receivedAt=new Date().toISOString();
      for(const p of this.portfolios)for(const h of p.holdings||[]){const u=updates[h.ticker?.trim().toUpperCase()];if(u && h.assetType!=='manual'){h.currentPriceUSD=u.priceUSD;if(h.currency==='THB')h.currentPriceNative=u.priceUSD*this.exchangeRate;h.change1dPct=u.change1dPct;h.priceReceivedAt=receivedAt;h.priceMarketAt=u.marketAt||null;h.priceSource=u.source|| (h.ticker.endsWith('.BK')?'Yahoo SET (ล่าช้า)':'Crypto API');}}
      this.marketStatus=`รับราคา ${Object.keys(updates).length}/${us.length+thai.length+crypto.length} ตัว • ${new Date().toLocaleTimeString('th-TH')} (เวลารับข้อมูล ไม่ใช่เวลาซื้อขาย)`;
      // Market refresh NEVER writes holdings to the shared database.
      this.updateSidebarFxRate();this.renderSpecCountersBar();this.renderActiveTab();
      await this.recordQuarterAfterRefresh(requestDate);
    } finally {this.marketSyncing=false;}
  },
  renderQuarterlyView(container) {
    const currency=this.displayCurrency;
    const money=value=>currency==='THB'?this.formatTHB(value):this.formatUSD(value);
    const snapshots=this.quarterlySnapshots.filter(s=>s.recordedAt).slice().sort((a,b)=>(a.year*4+Number(a.quarter.slice(1)))-(b.year*4+Number(b.quarter.slice(1))));
    const projection=PortfolioCore.projection(snapshots,this.cashFlows,currency);
    const rows=snapshots.map((s,i)=>{
      const result=i?PortfolioCore.period(snapshots[i-1],s,this.cashFlows,currency):null;
      return `<tr><td>${s.quarter}/${s.year}<br><small>${this.escapeHtml(s.date)}</small></td><td>${money(s.totalUSD*(currency==='THB'?s.exchangeRate:1))}</td><td>${result?money(result.deposits||0):'—'}</td><td>${result?money(result.withdrawals||0):'—'}</td><td>${result&&!result.incomplete?money(result.profit):'ยังคำนวณไม่ได้'}</td><td>${result?.returnPct!=null?result.returnPct.toFixed(2)+'%':'—'}</td></tr>`;
    }).join('');
    container.innerHTML=`<section class="benchmark-card"><h2>การเติบโตของพอร์ต</h2><p>เทียบกับประวัติของคุณเอง • ${currency}</p><p>เข้าเว็บวันสิ้นไตรมาสเพื่อบันทึกยอดอัตโนมัติ ครั้งล่าสุดที่สำเร็จของวันจะเป็นยอดที่เก็บไว้</p><p>31 มีนาคม · 30 มิถุนายน · 30 กันยายน · 31 ธันวาคม (เวลาไทย)</p><p>${this.escapeHtml(this.marketStatus||'กำลังรอราคา')}</p><button class="btn btn-primary" id="btn-take-quarter-snapshot">รีเฟรชและบันทึกวันสิ้นไตรมาส</button></section>
    <section class="benchmark-card"><h3>มูลค่าที่บันทึกจริง</h3><div style="height:300px"><canvas id="chart-growth-actual"></canvas></div>${!snapshots.length?'<p>ยังไม่มีประวัติสิ้นไตรมาส จะไม่สร้างข้อมูลย้อนหลังแทนให้</p>':''}</section>
    <section class="benchmark-card"><h3>แนวโน้มจากประวัติพอร์ต • 1 ปีข้างหน้า</h3><p>${this.escapeHtml(projection.available?projection.assumption:projection.reason)}</p>${projection.available?'<div style="height:260px"><canvas id="chart-growth-forecast"></canvas></div>':''}</section>
    <div class="div-table-wrap"><table class="custom-table"><thead><tr><th>ไตรมาส</th><th>มูลค่า</th><th>เงินเติม</th><th>เงินถอน</th><th>กำไรหลังหักเงินเข้าออก</th><th>ผลตอบแทนประมาณ</th></tr></thead><tbody>${rows||'<tr><td colspan="6">ยังไม่มีข้อมูล</td></tr>'}</tbody></table></div><p>ผลตอบแทนใช้ Modified Dietz ตามวันที่เงินเข้าออก ไม่ใช่การนำส่วนต่างมูลค่ามานับเป็นกำไรทั้งหมด</p>`;
    if(typeof Chart==='undefined')return;
    const make=(id,labels,data,dashed)=>new Chart(document.getElementById(id),{type:'line',data:{labels,datasets:[{label:currency,data,borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.1)',borderDash:dashed?[6,6]:[],tension:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:false}}}});
    if(snapshots.length)this.charts.growth=make('chart-growth-actual',snapshots.map(s=>`${s.quarter}/${s.year}`),snapshots.map(s=>s.totalUSD*(currency==='THB'?s.exchangeRate:1)),false);
    if(projection.available)this.charts.forecast=make('chart-growth-forecast',['ฐานล่าสุด','+3 เดือน','+6 เดือน','+9 เดือน','+12 เดือน'],projection.values,true);
  },
  initBenchmarkChart() {},
  renderDashboardView(container) {
    const grand=this.calculateGrandTotalStats(),dual=this.formatDual(grand.grandTotalUSD);
    const cards=this.portfolios.map(p=>{const s=this.calculatePortfolioStats(p),value=this.formatDual(s.totalValueUSD);return `<button class="overview-portfolio" data-overview-port="${p.id}"><span>${this.escapeHtml(p.name)}</span><strong>${value.main}</strong><small>${value.sub} · ${s.assetCount} สินทรัพย์</small><small>เงินสด ${this.formatDual(s.cashBufferUSD).main}</small></button>`;}).join('');
    container.innerHTML=`<section class="dime-hero-banner"><div class="dime-hero-label">มูลค่าสินทรัพย์รวม</div><div class="dime-main-value">${dual.main}</div><div class="dime-sub-value">${dual.sub}</div><p class="market-caption">${this.escapeHtml(this.marketStatus||'ใช้ราคาที่บันทึกไว้ กำลังรอข้อมูลจากบริการราคา')}</p></section>
    <div class="overview-metrics"><section><span>กำไรสินทรัพย์ที่ยังไม่ขาย</span><strong class="${grand.totalPLUSD>=0?'text-emerald':'text-rose'}">${this.formatDual(grand.totalPLUSD).main}</strong><small>ไม่รวมต้นทุนค่าเงินย้อนหลัง</small></section><section><span>เงินสดในพอร์ต</span><strong>${this.formatDual(grand.totalCashBufferUSD).main}</strong><small>${this.portfolios.length} พอร์ต · ${this.portfolios.reduce((n,p)=>n+(p.holdings||[]).length,0)} สินทรัพย์</small></section></div>
    <section id="dashboard-heatmap-container" class="overview-section"><div class="section-header"><h3>Heatmap สินทรัพย์</h3></div><p class="market-caption">สีแสดงกำไร/ขาดทุนจากต้นทุน · แถบแสดงสัดส่วนของสินทรัพย์ที่ถือ (ไม่รวมเงินสดและพอร์ตเทรด) · แตะเพื่อดูหรือแก้รายละเอียด</p><div class="heatmap-grid" id="heatmap-tiles-grid">${this.renderHeatmapTilesHTML()}</div></section>
    <section class="overview-section"><div class="section-header"><h3>พอร์ตของคุณ</h3><button id="btn-add-portfolio-modal" class="btn btn-primary">เพิ่มพอร์ต</button></div><div class="overview-portfolios">${cards||'<p>เริ่มจากเพิ่มพอร์ต แล้วกรอกสินทรัพย์ที่ถืออยู่จริง</p>'}</div></section>`;
    this.rebindHeatmapTileEvents(container);
    container.querySelectorAll('[data-overview-port]').forEach(b=>b.addEventListener('click',()=>{this.selectedPortfolioId=b.dataset.overviewPort;this.switchTab('portfolios');}));
  },
  openCashBufferModal(id) {
    if(!id.startsWith('trading:'))return originalCashModal.call(this,id);
    const item=this.tradingData[id.slice(8)];if(!item)return;
    document.getElementById('form-cash-buffer').reset();
    document.getElementById('cash-buffer-port-id').value=id;
    document.getElementById('cash-buffer-port-name').textContent=item.name;
    const value=this.getTradingLatestBalances().balances[id.slice(8)]||0;
    document.getElementById('cash-current-usd').textContent=this.formatUSD(value);
    document.getElementById('cash-current-thb').textContent=this.formatTHB(value*this.exchangeRate);
    this.openModal('modal-cash-buffer');
  },
  saveCashBufferForm() {
    const id=document.getElementById('cash-buffer-port-id').value;
    const trading=id.startsWith('trading:')?this.tradingData[id.slice(8)]:null;
    const p=this.portfolios.find(p=>p.id===id);if(!p&&!trading)return;
    const type=document.querySelector('input[name="cash-action"]:checked').value;
    const amount=Number(document.getElementById('cash-amount-usd').value);
    const date=document.getElementById('cash-flow-date').value;
    const rate=Number(document.getElementById('cash-flow-fx').value);
    if(!Number.isFinite(rate)||rate<=0){alert('ระบุอัตราแลกเปลี่ยนของรายการ');return;}
    if(!date || date>PortfolioCore.bangkokDate() || !Number.isFinite(amount) || amount<0 || (type!=='SET'&&amount===0)){alert('ระบุวันที่ไม่เกินวันนี้และจำนวนเงินให้ถูกต้อง');return;}
    const prior=trading?this.getTradingLatestBalances().balances[id.slice(8)]||0:Number(p.cashBufferUSD)||0;
    if(type==='WITHDRAW'&&amount>prior){alert('ยอดถอนมากกว่าเงินสดคงเหลือ');return;}
    const balance=type==='SET'?amount:prior+(type==='DEPOSIT'?amount:-amount);
    if(p)p.cashBufferUSD=balance;
    else{const today=PortfolioCore.bangkokDate(),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));const list=trading.monthlyBalances||=[];const row=list.find(m=>m.year===year&&m.month===month);if(row)row.balanceUSD=balance;else list.push({year,month,balanceUSD:balance,note:'เงินเข้า/ออก'});list.sort((a,b)=>a.year*12+a.month-b.year*12-b.month);}
    const at=date===PortfolioCore.bangkokDate()?new Date().toISOString():new Date(date+'T12:00:00+07:00').toISOString();
    this.cashFlows.push({id:crypto.randomUUID(),portfolioId:id,type:type==='SET'?'ADJUSTMENT':type,at,date,
      amountUSD:type==='SET'?amount-prior:amount,amountTHB:(type==='SET'?amount-prior:amount)*rate,exchangeRate:rate,
      note:document.getElementById('cash-note')?.value||'',fxSource:'อัตราที่ผู้ใช้ระบุในรายการ'});
    this.saveData().then(ok=>{if(ok){this.closeModal('modal-cash-buffer');this.renderActiveTab();}});
  },
  generateObsidianMarkdown() {
    const money=n=>Number(n||0).toFixed(2);
    const cell=s=>String(s??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
    const grand=this.calculateGrandTotalStats();
    let md=`---\ntype: Financial_Review\nexported_at: "${new Date().toISOString()}"\ntags: [Financial_Report, Portfolio_Tracking]\n---\n\n# สรุปพอร์ต\n\nมูลค่าปัจจุบัน: ${money(grand.grandTotalUSD)} USD / ${money(grand.grandTotalTHB)} THB\n\nอัตราแปลงปัจจุบัน: ${this.exchangeRate} THB/USD\n\n## สินทรัพย์ปัจจุบัน\n\n| พอร์ต | สินทรัพย์ | จำนวน | ต้นทุนต่อหน่วย USD | ราคา USD | เวลารับราคา |\n|---|---|---:|---:|---:|---|\n`;
    for(const p of this.portfolios)for(const h of p.holdings||[])md+=`| ${cell(p.name)} | ${cell(h.ticker)} | ${h.shares} | ${h.avgCostUSD} | ${h.currentPriceUSD??'ไม่ทราบ'} | ${cell(h.priceReceivedAt||'ไม่มีข้อมูลเวลา')} |\n`;
    md+='\n## เงินเติม/ถอนและการปรับยอด\n\n| วันที่ | พอร์ต | ประเภท | USD | THB ณ รายการ | หมายเหตุ |\n|---|---|---|---:|---:|---|\n';
    for(const f of this.cashFlows||[])md+=`| ${cell(f.date)} | ${cell(this.portfolios.find(p=>p.id===f.portfolioId)?.name||f.portfolioId)} | ${cell(f.type)} | ${money(f.amountUSD)} | ${money(f.amountTHB)} | ${cell(f.note)} |\n`;
    md+='\n## ประวัติไตรมาสจริง\n\n';
    for(const s of this.quarterlySnapshots.filter(s=>s.recordedAt).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))){
      md+=`### ${s.quarter}/${s.year}\n\nวันที่ข้อมูล: ${s.date}; บันทึกจริง: ${s.recordedAt}\n\nมูลค่า: ${money(s.totalUSD)} USD / ${money(s.totalUSD*s.exchangeRate)} THB; FX: ${s.exchangeRate}\n\n| พอร์ต | USD |\n|---|---:|\n`;
      for(const [id,value]of Object.entries(s.portValuesUSD))md+=`| ${cell(s.portNames?.[id]||id)} | ${money(value)} |\n`;
      md+='\n';
    }
    md+='\n## ข้อมูลครบถ้วนสำหรับตรวจสอบ (รวม holdings ณ ไตรมาสและเวลาของราคา)\n\n~~~~json\n'+JSON.stringify(this.dataPayload(),null,2).replace(/~/g,'\\u007e')+'\n~~~~\n\nการปรับยอดไม่ถือเป็นเงินเติมหรือกำไรโดยอัตโนมัติ priceReceivedAt เป็นเวลารับข้อมูล; priceMarketAt เป็นเวลาตลาดหากแหล่งราคาส่งมา ไม่รับรองว่าเป็นเวลาซื้อขายล่าสุด ไม่มีข้อมูลจำลองแทนไตรมาสที่ขาด\n';
    return md;
  }
});
