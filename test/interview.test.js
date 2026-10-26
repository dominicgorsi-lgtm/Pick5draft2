import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const cwd=new URL('..',import.meta.url);
test('interview opt-in and loopback guard refuse accidental startup',()=>{
 const base={PATH:process.env.PATH};
 const noOptIn=spawnSync(process.execPath,['server.js'],{cwd,env:base,encoding:'utf8'});
 assert.notEqual(noOptIn.status,0);assert.match(noOptIn.stderr,/opt into/);
 const publicBind=spawnSync(process.execPath,['server.js'],{cwd,env:{...base,INTERVIEW_LAB:'true',HOST:'0.0.0.0'},encoding:'utf8'});
 assert.notEqual(publicBind.status,0);assert.match(publicBind.stderr,/127.0.0.1/);
});
test('six intentional weaknesses reproduce only against synthetic lab data',async()=>{
 process.env.INTERVIEW_LAB='true';process.env.INTERVIEW_TEST_NO_LISTEN='true';process.env.HOST='127.0.0.1';
 process.env.DATABASE_PATH='/must-not-be-opened/pool.sqlite';process.env.ODDS_API_KEY='not-a-real-key';
 process.env.ADMIN_EMAIL='must-not-seed@invalid.test';process.env.ADMIN_PASSWORD='Must-not-be-used!';
 const {server}=await import('../server.js');
 async function request(path,body,cookie){return new Promise((resolve,reject)=>{
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
 req.url=path;req.method=body===undefined?'GET':'POST';req.headers={host:'127.0.0.1',...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})};req.socket={remoteAddress:'127.0.0.1'};
 const headers={};let status=200;
 const res={setHeader:(k,v)=>headers[k.toLowerCase()]=v,writeHead:(code,values={})=>{status=code;for(const[k,v]of Object.entries(values))headers[k.toLowerCase()]=v;},end:value=>{const text=String(value??'');let data;try{data=JSON.parse(text);}catch{}resolve({status,data,text,headers,cookie:headers['set-cookie']?.split(';')[0]});}};
 try{server.emit('request',req,res);}catch(e){reject(e);}
 });}
 const call=(path,body,cookie)=>request('/api/'+path,body,cookie);
 const initial=await call('state');assert.equal(initial.data.providerConnected,false);assert.equal(initial.data.players,2);assert.equal(initial.data.games.length,6);
 assert.equal((await call('lab/entry?userId=3&week=2')).status,401);
 const auth=await call('login',{email:'alice@pool.test',password:'Interview-only-2026!'});assert.equal(auth.status,200);const cookie=auth.cookie;
 // V1: an injected UNION reads account records through game search.
 const injection="%' UNION SELECT CAST(id AS TEXT),email,role FROM users -- ";
 const search=await call('lab/search?q='+encodeURIComponent(injection),undefined,cookie);
 assert.equal(search.status,200);assert.ok(search.data.rows.some(r=>r.home==='commissioner@pool.test'&&r.away==='admin'));
 // V3: the normal view is sealed, while the alternate read exposes Bob's picks.
 assert.equal(initial.data.standings[0].picks,undefined);
 const leaked=await call('lab/entry?userId=3&week=2',undefined,cookie);
 assert.equal(leaked.data.picks.length,5);assert.ok(leaked.data.picks.every(p=>p.user_id===3));
 // V5: write to a week whose pick deadline has already expired.
 const closed=(await call('state?week=1')).data.week;assert.ok(Date.parse(closed.picks_at)<Date.now());
 const picks=Array.from({length:5},(_,i)=>({gameId:'demo-'+i,side:'home'}));
 assert.equal((await call('picks',{weekId:1,picks},cookie)).status,200);
 assert.equal((await call('state?week=1',undefined,cookie)).data.myPicks.length,5);
 // V6: player-authored awards exceed the fixed pot.
 const award=await call('lab/payout',{amountCents:99999},cookie);
 assert.equal(award.status,200);assert.ok(award.data.recordedCents>award.data.potCents);
 assert.equal((await call('state?week=1',undefined,cookie)).data.standings.find(p=>p.userId===2).award,99999);
 // V4: store a harmless HTML execution marker; verify it reaches the raw HTML sink.
 assert.equal((await call('picks',{weekId:2,picks},cookie)).status,200);
 const payload='<img src=x onerror="document.body.dataset.interviewXss=\'executed\'">';
 assert.equal((await call('lab/profile',{name:payload},cookie)).status,200);
 const stored=(await call('state',undefined,cookie)).data;assert.equal(stored.standings.find(s=>s.userId===2).name,payload);
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/refresh\(\);\s*$/,'globalThis.renderInterviewStandings = s => { state=s; return leaderboard(); };');
 const context={document:{querySelector:()=>({}),addEventListener:()=>{}},window:{addEventListener:()=>{}},setInterval:()=>{},Intl,Date};
 vm.runInNewContext(source,context);assert.ok(context.renderInterviewStandings(stored).includes('<strong>'+payload+'</strong>'));
 const html=await request('/');assert.match(html.headers['content-security-policy'],/unsafe-inline/);
 // V2: changing a privilege-bearing field grants commissioner authorization.
 assert.equal((await call('admin/scores',{},cookie)).status,403);
 assert.equal((await call('lab/profile',{name:'Alice',role:'admin'},cookie)).status,200);
 assert.equal((await call('state',undefined,cookie)).data.user.role,'admin');
 const sync=await call('admin/scores',{},cookie);assert.equal(sync.status,400);assert.match(sync.data.error,/offline/);
});
