import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
test('accounts, entry privacy, server-side deadlines, exact-five validation, grading and rollover',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'five-wide-test-'));
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATABASE_PATH:join(tmp,'test.sqlite'),ADMIN_EMAIL:'admin@test.com',ADMIN_PASSWORD:'long-admin-password',POOL_INVITE_CODE:'test-invite',ODDS_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let db;
 try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server start timed out')),5000).unref())]);
 async function call(path,body,cookie){const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const admin=await call('login',{email:'admin@test.com',password:'long-admin-password'});assert.equal(admin.status,200);
 assert.equal((await call('admin/week',{label:'Test',wednesday:'2099-10-28'})).status,401);
 assert.equal((await call('register',{email:'one@test.com',password:'long-player-password',name:'One',inviteCode:'bad'})).status,400);
 const player=await call('register',{email:'one@test.com',password:'long-player-password',name:'One',inviteCode:'test-invite'});assert.equal(player.status,200);
 assert.equal((await call('admin/week',{label:'Test',wednesday:'2099-10-28'},player.cookie)).status,403);
 db=new DatabaseSync(join(tmp,'test.sqlite'));db.exec('PRAGMA foreign_keys=ON;');
 const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString(),end=new Date(Date.now()+7*86400000).toISOString();
 db.prepare("INSERT INTO weeks(id,label,lines_at,picks_at,ends_at,pot,locked_at) VALUES(1,'Test',?,?,?,?,?)").run(past,future,end,25000,past);
 for(let i=0;i<5;i++)db.prepare('INSERT INTO games(id,week_id,league,home,away,starts_at,home_spread,quoted_at,bookmaker) VALUES(?,1,?,?,?,?,?,?,?)').run('g'+i,'NFL','Home '+i,'Away '+i,end,-3,past,'test');
 const picks=Array.from({length:5},(_,i)=>({gameId:'g'+i,side:'home'}));
 assert.equal((await call('picks',{picks:picks.slice(0,4)},player.cookie)).status,400);
 assert.equal((await call('picks',{picks:[picks[0],...picks.slice(0,4)]},player.cookie)).status,400);
 assert.equal((await call('picks',{picks},player.cookie)).status,200);
 const sealed=(await call('state')).data.standings[0];assert.equal(sealed.picks,undefined);assert.equal(sealed.win,undefined);
 assert.equal((await call('picks',{picks},admin.cookie)).status,400);
 db.prepare('UPDATE weeks SET picks_at=? WHERE id=1').run(past);
 assert.equal((await call('picks',{picks},player.cookie)).status,400);
 assert.equal((await call('state')).data.standings[0].picks.length,5);
 assert.equal((await call('admin/settle',{},admin.cookie)).status,400);
 db.exec("UPDATE games SET status='final',home_score=20,away_score=17");
 const settled=await call('admin/settle',{},admin.cookie);assert.equal(settled.status,200);assert.equal(settled.data.week.carry,25000);assert.equal(settled.data.standings[0].push,5);
 assert.equal((await call('admin/settle',{},admin.cookie)).status,400);
 const next=await call('admin/week',{label:'Next',wednesday:'2099-10-28'},admin.cookie);assert.equal(next.status,200);assert.equal(next.data.week.pot,50000);
 // A second week pays out the full accumulated pot to a perfect entry.
 const w=next.data.week.id;
 db.prepare('UPDATE weeks SET lines_at=?,picks_at=?,locked_at=? WHERE id=?').run(past,future,past,w);
 for(let i=0;i<5;i++)db.prepare('INSERT INTO games(id,week_id,league,home,away,starts_at,home_spread,quoted_at,bookmaker) VALUES(?,?,?,?,?,?,?,?,?)').run('g'+i,w,'NFL','Home '+i,'Away '+i,end,-3,past,'test');
 assert.equal((await call('picks',{picks},player.cookie)).status,200);
 db.prepare('UPDATE weeks SET picks_at=? WHERE id=?').run(past,w);db.prepare("UPDATE games SET status='final',home_score=28,away_score=21 WHERE week_id=?").run(w);
 const win=await call('admin/settle',{},admin.cookie);assert.equal(win.data.week.carry,0);assert.equal(win.data.standings[0].award,50000);
 // Capacity is enforced by the server, including simultaneous registrations.
 const add=db.prepare("INSERT INTO users(email,name,password) VALUES(?,?,?)");for(let i=0;i<24;i++)add.run('extra'+i+'@test.com','Extra','not-used');
 assert.equal((await call('register',{email:'last@test.com',password:'long-player-password',name:'Last',inviteCode:'test-invite'})).status,400);
 // Refuse stale line snapshots instead of silently using late lines.
 db.prepare("INSERT INTO weeks(id,label,lines_at,picks_at,ends_at,pot,synced_at) VALUES(99,'Stale',?,?,?,?,?)").run(past,future,end,25000,new Date(Date.now()-2*86400000).toISOString());
 assert.equal((await call('state')).data.week.locked_at,null);
 assert.equal((await call('picks',{picks},player.cookie)).status,400);
 assert.equal((await call('admin/sync',{},admin.cookie)).status,400);
 const csrf=await fetch(`http://127.0.0.1:${port}/api/logout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test',Cookie:player.cookie},body:'{}'});assert.equal(csrf.status,403);
 await call('logout',{},player.cookie);assert.equal((await call('state',undefined,player.cookie)).data.user,null);
 }finally{db?.close();child.kill();await once(child,'exit');rmSync(tmp,{recursive:true,force:true});}
});
