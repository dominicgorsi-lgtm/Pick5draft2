import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { weekDeadlines, gradePick, validSelections, payout } from './rules.js';
import { ACCOUNTS, WEEK, seedFixtures } from './fixtures.js';
const root=dirname(fileURLToPath(import.meta.url));
// Interview branch: deliberate vulnerabilities, isolated from the real pool.
if(process.env.INTERVIEW_LAB!=='true') throw new Error('Run npm run interview to opt into the local vulnerability lab.');
if(process.env.HOST && process.env.HOST!=='127.0.0.1') throw new Error('Interview lab must bind to 127.0.0.1.');
const db=new DatabaseSync(':memory:'); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'player');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS weeks(id INTEGER PRIMARY KEY,label TEXT NOT NULL,lines_at TEXT NOT NULL,picks_at TEXT NOT NULL,ends_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',synced_at TEXT,locked_at TEXT,pot INTEGER NOT NULL,carry INTEGER NOT NULL DEFAULT 0,settled_at TEXT);
CREATE TABLE IF NOT EXISTS games(id TEXT NOT NULL,week_id INTEGER REFERENCES weeks(id),league TEXT NOT NULL,home TEXT NOT NULL,away TEXT NOT NULL,starts_at TEXT NOT NULL,home_spread REAL NOT NULL,quoted_at TEXT NOT NULL,bookmaker TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',home_score INTEGER,away_score INTEGER,PRIMARY KEY(id,week_id));
CREATE TABLE IF NOT EXISTS entries(user_id INTEGER REFERENCES users(id),week_id INTEGER REFERENCES weeks(id),submitted_at TEXT NOT NULL,PRIMARY KEY(user_id,week_id));
CREATE TABLE IF NOT EXISTS picks(user_id INTEGER,week_id INTEGER,game_id TEXT,side TEXT NOT NULL,PRIMARY KEY(user_id,week_id,game_id),FOREIGN KEY(user_id,week_id) REFERENCES entries(user_id,week_id),FOREIGN KEY(game_id,week_id) REFERENCES games(id,week_id));
CREATE TABLE IF NOT EXISTS awards(week_id INTEGER REFERENCES weeks(id),user_id INTEGER REFERENCES users(id),cents INTEGER NOT NULL,PRIMARY KEY(week_id,user_id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,actor INTEGER,action TEXT NOT NULL,detail TEXT NOT NULL);
`);
const one=(s,...p)=>db.prepare(s).get(...p),all=(s,...p)=>db.prepare(s).all(...p),run=(s,...p)=>db.prepare(s).run(...p);
const now=()=>new Date().toISOString();
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
function audit(actor,action,detail){run('INSERT INTO audit(at,actor,action,detail) VALUES(?,?,?,?)',now(),actor,action,JSON.stringify(detail));}
function hash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
function matches(password,saved){const [salt,h]=saved.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(h,'hex'));}
const tokenHash=t=>createHash('sha256').update(t).digest('hex');
// Synthetic historical scores and rehearsal clock; never imports real pool data.
transaction(()=>seedFixtures(db,hash));

function current(){return one('SELECT * FROM weeks ORDER BY id DESC LIMIT 1');}
function games(w){return all('SELECT * FROM games WHERE week_id=? ORDER BY starts_at,league,home',w.id);}
function freeze(){const w=current();if(w&&w.status==='open'&&!w.locked_at&&now()>=w.lines_at){
 // Never take a new quote after the line deadline. Stop submissions if the last snapshot is stale.
 if(w.synced_at && Date.parse(w.lines_at)-Date.parse(w.synced_at)<=20*60000 && games(w).length){
 run('UPDATE weeks SET locked_at=? WHERE id=?',w.lines_at,w.id);audit(null,'lines_locked',{week:w.id,snapshot:w.synced_at});
 }
}}
const syncing=false;
async function syncOdds(){throw new Error('Interview lab is offline; only synthetic spreads are used.');}
async function syncScores(){throw new Error('Interview lab is offline; use synthetic results.');}
function standings(w,reveal){if(!w)return [];return all('SELECT e.*,u.name FROM entries e JOIN users u ON e.user_id=u.id WHERE e.week_id=?',w.id).map(e=>{
 const ps=all('SELECT p.side,g.* FROM picks p JOIN games g ON p.game_id=g.id AND p.week_id=g.week_id WHERE p.user_id=? AND p.week_id=?',e.user_id,w.id);
 const result={win:0,loss:0,push:0,pending:0,void:0};for(const p of ps)result[gradePick(p,p.side)]++;
 return {userId:e.user_id,name:e.name,submittedAt:e.submitted_at,...(reveal?{...result,picks:ps.map(p=>({...p,result:gradePick(p,p.side)}))}:{}),award:one('SELECT cents FROM awards WHERE week_id=? AND user_id=?',w.id,e.user_id)?.cents||0};
 }).sort((a,b)=>(b.win||0)-(a.win||0)||a.name.localeCompare(b.name));}
function state(user,weekId){freeze();const w=weekId?one('SELECT * FROM weeks WHERE id=?',weekId):current();const reveal=w&&now()>=w.picks_at;return {user:user?{id:user.id,name:user.name,role:user.role}:null,configured:!!one("SELECT id FROM users WHERE role='admin'"),providerConnected:false,week:w||null,games:w?games(w):[],myPicks:w&&user?all('SELECT game_id AS gameId,side FROM picks WHERE user_id=? AND week_id=?',user.id,w.id):[],myEntry:w&&user?one('SELECT submitted_at FROM entries WHERE user_id=? AND week_id=?',user.id,w.id):null,standings:standings(w,reveal),players:one("SELECT count(*) AS n FROM users WHERE role='player'").n,weeks:all('SELECT id,label,status,pot,carry FROM weeks ORDER BY id DESC'),audit:user?.role==='admin'?all('SELECT * FROM audit ORDER BY id DESC LIMIT 20'):[]};}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const limits=new Map();
function rate(req){const key=req.socket.remoteAddress;const time=Date.now();let v=limits.get(key);if(!v||v.until<time){v={n:0,until:time+15*60000};limits.set(key,v);}if(++v.n>30)throw new Error('Too many sign-in attempts. Try again in 15 minutes.');}
function userFor(req){const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)pool_session=([a-f0-9]{64})(?:;|$)/);return cookie?one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?',tokenHash(cookie[1]),Date.now()):null;}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw new Error('Request too large.');}try{return JSON.parse(s||'{}');}catch{throw new Error('Invalid JSON.');}}
function session(res,user){const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',tokenHash(token),user.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`pool_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),route=url.pathname,user=userFor(req);
 if(route.startsWith('/api/lab/')){
 if(req.method==='GET'&&route==='/api/lab/scenario'){
  const past=one('SELECT * FROM weeks WHERE id=?',WEEK.completed);
  const totals=one('SELECT COALESCE(sum(cents),0) AS cents FROM awards WHERE week_id=?',WEEK.completed);
  return json(res,200,{synthetic:true,weeks:WEEK,accounts:ACCOUNTS.map(({id,email,name,role})=>({id,email,name,role})),lastWeek:past,priorWeek:one('SELECT * FROM weeks WHERE id=?',WEEK.rollover),awardTotal:totals.cents,ledgerBalanced:totals.cents===past.pot,currentEntries:one('SELECT count(*) n FROM entries WHERE week_id=?',WEEK.open).n,resetAllowed:[1,4].includes(user?.id),clock:'Historical weeks use the last fully completed Pacific pool week. Exercise weeks use a relative rehearsal clock.'});
 }
 if(!user)return json(res,401,{error:'Sign in with a synthetic account first.'});
 if(req.method==='GET'&&route==='/api/lab/search'){
   // V1: SQL injection. Direct interpolation makes UNION read unrelated tables.
   const query=url.searchParams.get('q')||'';
   const rows=all("SELECT id,home,away FROM games WHERE week_id=4 AND home LIKE '%"+query+"%'");
   return json(res,200,{rows});
 }
 if(req.method==='GET'&&route==='/api/lab/entry'){
   // V3: IDOR. Authentication exists, but target ownership and sealing are not checked.
   const owner=Number(url.searchParams.get('userId')),week=Number(url.searchParams.get('week')||4);
   return json(res,200,{picks:all('SELECT * FROM picks WHERE user_id=? AND week_id=?',owner,week)});
 }
 if(req.method!=='POST')return json(res,404,{error:'Lab endpoint not found.'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Invalid request origin.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Use application/json.'});
 const input=await body(req);
 if(route==='/api/lab/reset'){
   if(![1,4].includes(user.id)||user.role!=='admin')return json(res,403,{error:'Use the original presenter or commissioner account to reset the rehearsal.'});
   transaction(()=>seedFixtures(db,hash));limits.clear();
   const presenter=one('SELECT * FROM users WHERE id=?',user.id);session(res,presenter);
   return json(res,200,{ok:true,message:'Synthetic roster, results, entries and awards restored. Other browser sessions were signed out.',user:{id:presenter.id,name:presenter.name,role:presenter.role}});
 }
 if(route==='/api/lab/secure'){
   // Comparison examples only. Original exercise endpoints deliberately remain vulnerable.
   switch(input.exercise){
    case 'V1':return json(res,200,{rows:all('SELECT id,home,away FROM games WHERE week_id=? AND home LIKE ?',WEEK.open,'%'+String(input.q||'')+'%'),control:'Bound parameters keep search input as data.'});
    case 'V2':if(Object.hasOwn(input.profile||{},'role'))return json(res,403,{error:'Role is not an editable profile field.'});return json(res,200,{control:'Only name would be accepted; this comparison does not save changes.'});
    case 'V3':if(Number(input.userId)!==user.id&&now()<one('SELECT picks_at FROM weeks WHERE id=?',WEEK.open).picks_at)return json(res,403,{error:'Other players’ entries stay sealed until the deadline.'});return json(res,200,{picks:all('SELECT * FROM picks WHERE user_id=? AND week_id=?',Number(input.userId),WEEK.open)});
    case 'V4':return json(res,200,{name:String(input.name||''),control:'Render this value using textContent, never innerHTML.'});
    case 'V5':{const target=one('SELECT * FROM weeks WHERE id=?',Number(input.weekId));if(!target||target.status!=='open'||!target.locked_at||now()>=target.picks_at)return json(res,403,{error:'The selected week is closed. Deadline checked on the server.'});return json(res,200,{control:'Deadline check passed; this comparison does not write an entry.'});}
    case 'V6':return json(res,403,{error:'Players cannot create awards. Settlement must calculate amounts from verified results.'});
    default:throw new Error('Unknown comparison exercise.');
   }
 }
 if(route==='/api/lab/profile'){
   // V2: Mass assignment. The client can change a privilege-bearing role.
   const profile={name:user.name,role:user.role,...input};
   if(typeof profile.name!=='string'||profile.name.length>500||!['player','admin'].includes(profile.role))throw new Error('Invalid synthetic profile.');
   run('UPDATE users SET name=?,role=? WHERE id=?',profile.name,profile.role,user.id);
   return json(res,200,{profile:{name:profile.name,role:profile.role}});
 }
 if(route==='/api/lab/payout'){
   // V6: Financial integrity. A player supplies their award, with no settlement authorization.
   if(!Number.isInteger(input.amountCents)||input.amountCents<0||input.amountCents>1000000)throw new Error('Use a synthetic amount from 0 to 1000000 cents.');
   run('INSERT INTO awards(week_id,user_id,cents) VALUES(2,?,?) ON CONFLICT(week_id,user_id) DO UPDATE SET cents=excluded.cents',user.id,input.amountCents);
   return json(res,200,{recordedCents:input.amountCents,potCents:50000,realMoneyTransferred:false});
 }
 return json(res,404,{error:'Lab endpoint not found.'});
 }
 if(route.startsWith('/api/')){
 if(req.method==='GET'&&route==='/api/state')return json(res,200,state(user,Number(url.searchParams.get('week'))||null));
 if(req.method!=='POST')return json(res,404,{error:'Endpoint not found.'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Invalid request origin.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Use application/json.'});
 const b=await body(req);freeze();
 if(route==='/api/login'||route==='/api/register'){
 rate(req);const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
 if(email.length>254||password.length>256)throw new Error('Invalid credentials.');
 if(route==='/api/register'){
 if(!process.env.POOL_INVITE_CODE||b.inviteCode!==process.env.POOL_INVITE_CODE)throw new Error('A valid pool invite code is required.');
 if(!/^\S+@\S+\.\S+$/.test(email)||password.length<12||!String(b.name||'').trim()||b.name.length>50)throw new Error('Enter a name, valid email, and a password of at least 12 characters.');
 transaction(()=>{if(one("SELECT count(*) n FROM users WHERE role='player'").n>=25)throw new Error('All 25 player spots are filled.');if(one('SELECT id FROM users WHERE email=?',email))throw new Error('This email already has an account.');run('INSERT INTO users(email,name,password) VALUES(?,?,?)',email,b.name.trim(),hash(password));});
 }
 const found=one('SELECT * FROM users WHERE email=?',email);if(!found||!matches(password,found.password))return json(res,401,{error:'Email or password is incorrect.'});session(res,found);return json(res,200,state(found));
 }
 if(!user)return json(res,401,{error:'Sign in to continue.'});
 if(route==='/api/logout'){const c=(req.headers.cookie||'').match(/pool_session=([a-f0-9]{64})/);if(c)run('DELETE FROM sessions WHERE token=?',tokenHash(c[1]));res.setHeader('Set-Cookie','pool_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');return json(res,200,{ok:true});}
 if(route==='/api/picks'){
 if(user.role!=='player')throw new Error('The commissioner account manages the pool. Join with a separate player account to enter.');
 // V5: The browser checks the deadline, but the server omits it and accepts a week ID.
 const w=b.weekId?one('SELECT * FROM weeks WHERE id=?',Number(b.weekId)):current();if(!w||w.status!=='open'||!w.locked_at)throw new Error('Picks are not open. Submit after lines lock and before Thursday 11:59 PM Pacific.');
 validSelections(b.picks,games(w),w.picks_at);
 transaction(()=>{run('INSERT INTO entries VALUES(?,?,?) ON CONFLICT(user_id,week_id) DO UPDATE SET submitted_at=excluded.submitted_at',user.id,w.id,now());run('DELETE FROM picks WHERE user_id=? AND week_id=?',user.id,w.id);for(const p of b.picks)run('INSERT INTO picks VALUES(?,?,?,?)',user.id,w.id,p.gameId,p.side);audit(user.id,'picks_submitted',{week:w.id,picks:b.picks});});return json(res,200,state(user));
 }
 if(user.role!=='admin')return json(res,403,{error:'Commissioner access required.'});
 if(route==='/api/admin/week'){
 if(syncing)throw new Error('Wait for the provider sync to finish.');
 const prev=current();if(prev&&prev.status!=='settled')throw new Error('Settle the current week before creating another.');
 const dates=weekDeadlines(String(b.wednesday||''));if(dates.linesAt<=now())throw new Error('Choose an upcoming Wednesday.');
 if(prev&&dates.linesAt<=prev.ends_at)throw new Error('The new week must follow the previous week.');
 const label=String(b.label||'').trim();if(!label||label.length>60)throw new Error('Enter a week name (up to 60 characters).');
 const r=run('INSERT INTO weeks(label,lines_at,picks_at,ends_at,pot) VALUES(?,?,?,?,?)',label,dates.linesAt,dates.picksAt,dates.endsAt,25000+(prev?.carry||0));audit(user.id,'week_created',{id:Number(r.lastInsertRowid),...dates});
 }else if(route==='/api/admin/sync'){await syncOdds();}
 else if(route==='/api/admin/scores'){await syncScores();}
 else if(route==='/api/admin/result'){
 const w=current();if(!w||w.status==='settled'||now()<w.picks_at)throw new Error('Results can be recorded after picks close.');
 const g=one('SELECT * FROM games WHERE id=? AND week_id=?',b.gameId,w.id);if(!g||now()<g.starts_at)throw new Error('Game has not started.');
 if(!['final','void'].includes(b.status))throw new Error('Choose final or void.');
 if(b.status==='final'&&(!Number.isInteger(b.home)||!Number.isInteger(b.away)||b.home<0||b.away<0||b.home>200||b.away>200))throw new Error('Enter valid final scores.');
 run('UPDATE games SET status=?,home_score=?,away_score=? WHERE id=? AND week_id=?',b.status,b.status==='final'?b.home:null,b.status==='final'?b.away:null,b.gameId,w.id);audit(user.id,'result_recorded',b);
 }else if(route==='/api/admin/cancel'){
 const w=current();
 if(!w||w.status!=='open'||w.locked_at||now()<w.lines_at||one('SELECT count(*) n FROM entries WHERE week_id=?',w.id).n)throw new Error('Only an unplayable week with no locked lines or entries can be canceled after its line deadline.');
 transaction(()=>{run("UPDATE weeks SET status='settled',carry=pot,settled_at=? WHERE id=?",now(),w.id);audit(user.id,'unplayable_week_canceled',{week:w.id,carry:w.pot});});
 }else if(route==='/api/admin/settle'){
 const w=current();if(!w||w.status==='settled'||now()<w.picks_at)throw new Error('This week cannot be settled.');
 if(!w.locked_at)throw new Error('This week has no valid locked line snapshot.');
 const pending=one("SELECT count(*) n FROM picks p JOIN games g ON g.id=p.game_id AND g.week_id=p.week_id WHERE p.week_id=? AND g.status NOT IN ('final','void')",w.id).n;
 if(pending)throw new Error('Wait for every selected game to finish or be voided.');
 const winners=standings(w,true).filter(s=>s.win===5).map(s=>s.userId),awards=payout(w.pot,winners);
 transaction(()=>{for(const a of awards)run('INSERT INTO awards VALUES(?,?,?)',w.id,a.userId,a.cents);run("UPDATE weeks SET status='settled',carry=?,settled_at=? WHERE id=?",winners.length?0:w.pot,now(),w.id);audit(user.id,'week_settled',{week:w.id,awards,carry:winners.length?0:w.pot});});
 }else return json(res,404,{error:'Endpoint not found.'});
 return json(res,200,state(user));
 }
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
 const files={'/slides':['slides.html','text/html'],'/slides.js':['slides.js','text/javascript'],'/presentation':['lab.html','text/html'],'/interview':['lab.html','text/html'],'/lab.js':['lab.js','text/javascript'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
 const file=files[route];if(!file){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8'});res.end(readFileSync(join(root,'public',file[0])));
 }catch(e){const expected=!/SQLITE|constraint|database/i.test(e.message);if(!expected)console.error('Database operation failed');json(res,400,{error:expected?e.message:'Unable to save this change. Try again.'});}
});
let tick=0;
const interval=setInterval(async()=>{freeze();if(++tick%15!==0)return;const w=current();try{if(w?.status==='open'){if(now()<w.lines_at)await syncOdds();else await syncScores();}}catch(e){console.error('Scheduled provider sync:',e.message);}run('DELETE FROM sessions WHERE expires<?',Date.now());for(const [k,v]of limits)if(v.until<Date.now())limits.delete(k);},60000);
interval.unref();
export { server };
if(process.env.INTERVIEW_TEST_NO_LISTEN!=='true') server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`Five Wide listening on port ${Number(process.env.PORT)||3000}`));
