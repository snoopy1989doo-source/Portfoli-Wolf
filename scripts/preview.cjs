// Synthetic preview only. Firebase scripts and all connect requests are disabled.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const fixture={portfolios:[{id:'preview',name:'พอร์ตทดลอง',emoji:'📁',tier:'Tier 1',category:'Test',color:'#38bdf8',goalUSD:10000,cashBufferUSD:100,holdings:[{id:'sample',ticker:'MSFT',name:'ข้อมูลจำลอง',shares:.0036587,avgCostUSD:428.356,currentPriceUSD:493.95,change1dPct:-1.15,targetTHB:15000}]}],tradingData:{},quarterlySnapshots:[],dividends:[],achievements:[],cashFlows:[],tradingHistory:[],exchangeRate:32.83};
const injection=`<script>PixelStewardApp.prototype.initFirebase=function(){let cloud={schemaVersion:4,revision:0,generation:'preview',data:${JSON.stringify(fixture)}};if(location.search.includes('empty'))cloud.data=PortfolioCore.empty();this.finnhubApiKey='';this.isFirebaseOnline=true;this.setCloudStatus('online','ข้อมูลจำลอง — ไม่เชื่อมฐานจริง');this.dbRef={transaction:async fn=>{const next=fn(structuredClone(cloud));if(next)cloud=next;return {committed:!!next,snapshot:{val:()=>structuredClone(cloud)}};},once:async()=>({val:()=>structuredClone(cloud)})};this.acceptCloud(cloud);};PixelStewardApp.prototype.fetchWithTimeout=async function(){throw Error('Preview: no network');};PixelStewardApp.prototype.fetchLiveExchangeRate=async function(){return this.exchangeRate;};</script>`;
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','app.js','app-data.js','portfolio-core.js','cloud-store.js','style.css','mobile.css','manifest.json'].includes(name)&&!/^assets\/[\w/.-]+\.(png|svg|jpg)$/.test(name)){res.writeHead(404);res.end();return;}
  const filename=path.resolve(root,name);if(!filename.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
  try{let data=fs.readFileSync(filename);if(name==='index.html')data=data.toString().replace(/<script[^>]*src="[^"]*firebase[^"]*"[^>]*><\/script>/g,'').replace('</body>',injection+'</body>');
    res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"connect-src 'none'; worker-src 'none'"});res.end(data);
  }catch(e){res.writeHead(404);res.end();}
}).listen(8765,'127.0.0.1',()=>console.log('Synthetic preview http://127.0.0.1:8765 — no Firebase/network connections'));
