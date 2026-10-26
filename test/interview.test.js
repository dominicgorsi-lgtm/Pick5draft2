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
 const initial=await call('state');assert.equal(initial.data.providerConnected,false);assert.equal(initial.data.players,25);assert.equal(initial.data.games.length,6);
 assert.equal((await call('lab/entry?userId=3&week=4')).status,401);
 const history=(await call('state?week=2')).data;
 assert.equal(history.week.pot,50000);assert.equal(history.week.status,'settled');assert.equal(history.week.carry,0);
 assert.equal(history.standings.length,25);assert.equal(history.standings.filter(s=>s.win===5).length,2);
 assert.deepEqual(history.standings.filter(s=>s.win===5).map(s=>[s.name,s.award]),[['Bob',25000],['Maya',25000]]);
 assert.equal(history.standings.reduce((sum,s)=>sum+s.award,0),50000);
 assert.ok(history.games.every(g=>g.status==='final'&&g.starts_at<history.week.ends_at));
 assert.ok(Date.parse(history.week.ends_at)<=Date.now());
 const prior=(await call('state?week=1')).data;assert.equal(prior.week.carry,25000);assert.ok(prior.standings.every(s=>s.win<5));
 const scenario=(await call('lab/scenario')).data;assert.equal(scenario.accounts.length,27);assert.equal(scenario.currentEntries,23);assert.equal(scenario.ledgerBalanced,true);
 assert.equal((await request('/presentation')).status,200);
 for(const path of ['/slides','/slides.js','/lab.js','/style.css'])assert.equal((await request(path)).status,200);
 assert.match((await request('/slides')).text,/speaker-notes/);

 const auth=await call('login',{email:'alice@pool.test',password:'Interview-only-2026!'});assert.equal(auth.status,200);const cookie=auth.cookie;

 assert.equal((await call('lab/reset',{},cookie)).status,403);
 for(const input of [{exercise:'V2',profile:{role:'admin'}},{exercise:'V3',userId:3},{exercise:'V5',weekId:3},{exercise:'V6',amountCents:99999}])assert.equal((await call('lab/secure',input,cookie)).status,403);
 // V1: an injected UNION reads account records through game search.
 const injection="%' UNION SELECT CAST(id AS TEXT),email,role FROM users -- ";
 const search=await call('lab/search?q='+encodeURIComponent(injection),undefined,cookie);
 assert.equal(search.status,200);assert.ok(search.data.rows.some(r=>r.home==='commissioner@pool.test'&&r.away==='admin'));
 const guarded=await call('lab/secure',{exercise:'V1',q:injection},cookie);assert.equal(guarded.status,200);assert.equal(guarded.data.rows.length,0);
 const normalSearch=await call('lab/secure',{exercise:'V1',q:'Chiefs'},cookie);assert.equal(normalSearch.data.rows.length,1);
 // V3: the normal view is sealed, while the alternate read exposes Bob's picks.
 assert.equal(initial.data.standings[0].picks,undefined);
 const leaked=await call('lab/entry?userId=3&week=4',undefined,cookie);
 assert.equal(leaked.data.picks.length,5);assert.ok(leaked.data.picks.every(p=>p.user_id===3));
 // V5: write to a week whose pick deadline has already expired.
 const closed=(await call('state?week=3')).data.week;assert.ok(Date.parse(closed.picks_at)<Date.now());
 const picks=Array.from({length:5},(_,i)=>({gameId:'demo-'+i,side:'home'}));
 assert.equal((await call('picks',{weekId:3,picks},cookie)).status,200);
 assert.equal((await call('state?week=3',undefined,cookie)).data.myPicks.length,5);
 // V6: player-authored awards exceed the fixed pot.
 const award=await call('lab/payout',{amountCents:99999},cookie);
 assert.equal(award.status,200);assert.ok(award.data.recordedCents>award.data.potCents);
 assert.equal((await call('state?week=2',undefined,cookie)).data.standings.find(p=>p.userId===2).award,99999);
 // V4: store a harmless HTML execution marker; verify it reaches the raw HTML sink.
 assert.equal((await call('picks',{weekId:4,picks},cookie)).status,200);
 const payload='<img src=x onerror="document.body.dataset.interviewXss=\'executed\'">';
 assert.equal((await call('lab/profile',{name:payload},cookie)).status,200);
 const inert=await call('lab/secure',{exercise:'V4',name:payload},cookie);assert.equal(inert.status,200);assert.equal(inert.data.name,payload);
 const stored=(await call('state',undefined,cookie)).data;assert.equal(stored.standings.find(s=>s.userId===2).name,payload);
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/refresh\(\);\s*$/,'globalThis.renderInterviewStandings = s => { state=s; return leaderboard(); };');
 const context={document:{querySelector:()=>({}),addEventListener:()=>{}},window:{addEventListener:()=>{}},setInterval:()=>{},Intl,Date,URLSearchParams};
 vm.runInNewContext(source,context);assert.ok(context.renderInterviewStandings(stored).includes('<strong>'+payload+'</strong>'));
 const html=await request('/');assert.match(html.headers['content-security-policy'],/unsafe-inline/);
 // V2: changing a privilege-bearing field grants commissioner authorization.
 assert.equal((await call('admin/scores',{},cookie)).status,403);
 assert.equal((await call('lab/profile',{name:'Alice',role:'admin'},cookie)).status,200);
 assert.equal((await call('state',undefined,cookie)).data.user.role,'admin');
 const sync=await call('admin/scores',{},cookie);assert.equal(sync.status,400);assert.match(sync.data.error,/offline/);
 assert.equal((await call('lab/reset',{},cookie)).status,403);
 const presenter=await call('login',{email:'presenter@pool.test',password:'Interview-only-2026!'});assert.equal(presenter.status,200);assert.equal(presenter.data.user.id,4);
 const reset=await call('lab/reset',{},presenter.cookie);assert.equal(reset.status,200);assert.ok(reset.cookie);
 assert.equal((await call('state',undefined,cookie)).data.user,null);
 assert.equal((await call('state',undefined,reset.cookie)).data.user.id,4);
 const restored=(await call('lab/scenario',undefined,reset.cookie)).data;assert.equal(restored.resetAllowed,true);assert.equal(restored.awardTotal,50000);assert.equal(restored.currentEntries,23);assert.equal(restored.ledgerBalanced,true);
 const aliceAgain=await call('login',{email:'alice@pool.test',password:'Interview-only-2026!'});assert.equal(aliceAgain.data.user.role,'player');assert.equal(aliceAgain.data.user.name,'Alice');
 const guest=await call('login',{email:'guest@pool.test',password:'Interview-only-2026!'});assert.equal(guest.data.user.role,'player');assert.equal(guest.data.myPicks.length,0);
 assert.equal((await call('picks',{weekId:4,picks},guest.cookie)).status,200);

});
