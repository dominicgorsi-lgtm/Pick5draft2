import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

test('hosted presentation is isolated from real pool data and enforces all six boundaries',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'five-wide-hosted-'));
 process.env.DATABASE_PATH=join(temp,'pool.sqlite');process.env.ADMIN_EMAIL='real-admin@test.com';process.env.ADMIN_PASSWORD='Real-test-admin-password!';process.env.COOKIE_SECURE='true';process.env.POOL_INVITE_CODE='real-invite-for-test';process.env.ODDS_API_KEY='real-provider-secret-for-test';
 const {server}=await import('../server.js');
 async function request(path,body,cookie){return new Promise((resolve,reject)=>{
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.url=path;req.method=body===undefined?'GET':'POST';req.headers={host:'demo.test',...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})};req.socket={remoteAddress:'127.0.0.1'};
 let status=200;const headers={};const res={setHeader:(k,v)=>headers[k.toLowerCase()]=v,writeHead:(code,values={})=>{status=code;for(const[k,v]of Object.entries(values))headers[k.toLowerCase()]=v;},end:v=>{const text=String(v??'');let data;try{data=JSON.parse(text);}catch{}resolve({status,data,text,headers,cookie:headers['set-cookie']?.split(';')[0]});}};
 try{server.emit('request',req,res);}catch(e){reject(e);}
 });}
 const demo=(path,body,cookie)=>request('/demo/api/'+path,body,cookie);
 try{
 for(const [path,expected]of [['/presentation','/demo/presentation'],['/slides','/demo/slides'],['/demo','/demo/']])assert.equal((await request(path)).headers.location,expected);
 for(const path of ['/demo/','/demo/presentation','/demo/slides','/demo/app.js','/demo/lab.js','/demo/slides.js','/demo/style.css'])assert.equal((await request(path)).status,200);
 const page=await request('/demo/presentation');assert.match(page.text,/ILLUSTRATIVE EXAMPLE/);assert.doesNotMatch(page.headers['content-security-policy'],/unsafe-inline/);
 const live=await request('/api/state');assert.equal(live.data.players,0);assert.equal(live.data.week,null);
 const history=(await demo('state?week=2')).data;assert.equal(history.players,25);assert.equal(history.week.pot,50000);assert.equal(history.standings.filter(s=>s.win===5).length,2);assert.equal(history.standings.reduce((sum,s)=>sum+s.award,0),50000);assert.equal(history.providerConnected,false);assert.ok(!JSON.stringify(history).includes('real-provider-secret-for-test'));
 const presenter=await demo('login',{email:'presenter@pool.test',password:'Interview-only-2026!'});assert.equal(presenter.status,200);assert.match(presenter.headers['set-cookie'],/^demo_pool_session=/);assert.match(presenter.headers['set-cookie'],/Path=\/demo;/);assert.match(presenter.headers['set-cookie'],/Secure/);
 assert.equal((await request('/api/state',undefined,presenter.cookie)).data.user,null);
 const real=await request('/api/login',{email:'real-admin@test.com',password:'Real-test-admin-password!'});assert.equal(real.status,200);assert.match(real.cookie,/^pool_session=/);assert.equal((await demo('state',undefined,real.cookie)).data.user,null);
 assert.equal((await request('/api/admin/week',{label:'Real pool preservation',wednesday:'2099-10-28'},real.cookie)).status,200);
 const alice=await demo('login',{email:'alice@pool.test',password:'Interview-only-2026!'}),cookie=alice.cookie;
 const query="%' UNION SELECT CAST(id AS TEXT),email,role FROM users -- ";
 const injected=await demo('lab/search?q='+encodeURIComponent(query),undefined,cookie);assert.equal(injected.status,200);assert.deepEqual(injected.data.rows,[]);assert.equal((await demo('lab/search?q=Chiefs',undefined,cookie)).data.rows.length,1);
 assert.equal((await demo('lab/entry?userId=3&week=4',undefined,cookie)).status,403);
 assert.equal((await demo('lab/profile',{name:'Alice',role:'admin'},cookie)).status,403);assert.equal((await demo('state',undefined,cookie)).data.user.role,'player');
 const picks=Array.from({length:5},(_,i)=>({gameId:'demo-'+i,side:'home'}));
 assert.equal((await demo('picks',{weekId:3,picks},cookie)).status,400);assert.equal((await demo('state?week=3',undefined,cookie)).data.myEntry??null,null);
 assert.equal((await demo('lab/payout',{amountCents:99999},cookie)).status,403);assert.equal((await demo('lab/scenario')).data.awardTotal,50000);
 assert.equal((await demo('picks',{weekId:4,picks},cookie)).status,200);
 const payload='<img src=x onerror="alert(1)">';assert.equal((await demo('lab/profile',{name:payload},cookie)).status,200);
 const stored=(await demo('state',undefined,cookie)).data;
 const source=readFileSync(new URL('../demo/public/app.js',import.meta.url),'utf8').replace(/refresh\(\);\s*$/,'globalThis.renderDemoStandings = s => {state=s;return leaderboard();};');
 const context={document:{querySelector:()=>({}),addEventListener:()=>{}},window:{addEventListener:()=>{}},setInterval:()=>{},Intl,Date,URLSearchParams};vm.runInNewContext(source,context);
 const html=context.renderDemoStandings(stored);assert.ok(!html.includes(payload));assert.ok(html.includes('&lt;img'));
 assert.equal((await demo('lab/reset',{},cookie)).status,403);const reset=await demo('lab/reset',{},presenter.cookie);assert.equal(reset.status,200);assert.equal((await demo('lab/scenario')).data.currentEntries,23);
 const retained=(await request('/api/state',undefined,real.cookie)).data;assert.equal(retained.user.role,'admin');assert.equal(retained.week.label,'Real pool preservation');assert.equal(retained.players,0);
 assert.equal((await demo('state',undefined,cookie)).data.user,null);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
