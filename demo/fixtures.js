import { pacificParts, pacificInstant, weekDeadlines } from '../rules.js';
export const DEMO_PASSWORD='Interview-only-2026!';
export const BOB_PASSWORD='Bob-owner-demo-2026!';
export const WEEK={rollover:1,completed:2,late:3,open:4};
export const ACCOUNTS=[
 {id:1,email:'commissioner@pool.test',name:'Commissioner',role:'admin'},
 {id:2,email:'alice@pool.test',name:'Alice',role:'player'},
 {id:3,email:'bob@pool.test',name:'Bob',role:'player'},
 {id:4,email:'presenter@pool.test',name:'Dominic · Presenter',role:'admin'},
 ...['Maya','Jordan','Chris','Sam','Taylor','Alex','Morgan','Casey','Jamie','Riley','Cameron','Drew','Avery','Quinn','Parker','Reese','Blake','Devon','Skyler','Logan','Charlie','Dakota','Guest'].map((name,i)=>({id:i+5,email:name.toLowerCase()+'@pool.test',name,role:'player'}))
];
export const PLAYERS=ACCOUNTS.filter(a=>a.role==='player');
export function seedFixtures(db,hash,at=new Date()){
 const run=(sql,...args)=>db.prepare(sql).run(...args);
 for(const table of ['picks','entries','awards','games','weeks','sessions','audit','users'])db.exec('DELETE FROM '+table);
 const stamp=offset=>new Date(at.getTime()+offset).toISOString();
 const p=pacificParts(at),day=new Date(Date.UTC(p.year,p.month-1,p.day));
 const sinceTuesday=(day.getUTCDay()-2+7)%7;
 const end=new Date(day.getTime()-sinceTuesday*86400000);
 const lastWed=new Date(end.getTime()-6*86400000).toISOString().slice(0,10);
 const priorWed=new Date(end.getTime()-13*86400000).toISOString().slice(0,10);
 for(const a of ACCOUNTS)run('INSERT INTO users(id,email,name,password,role) VALUES(?,?,?,?,?)',a.id,a.email,a.name,hash(a.id===3?BOB_PASSWORD:DEMO_PASSWORD),a.role);
 const prior=weekDeadlines(priorWed),last=weekDeadlines(lastWed);
 const weeks=[
  {id:1,label:'Prior week · $250 rollover',...prior,status:'settled',pot:25000,carry:25000},
  {id:2,label:'Last completed week · $500 split',...last,status:'settled',pot:50000,carry:0},
  {id:3,label:'Late-entry exercise · Closed',linesAt:stamp(-86400000),picksAt:stamp(-3600000),endsAt:stamp(6*86400000),status:'open',pot:25000,carry:0},
  {id:4,label:'Current demo week · Picks open',linesAt:stamp(-86400000),picksAt:stamp(86400000),endsAt:stamp(6*86400000),status:'open',pot:25000,carry:0}
 ];
 const names=[['Chiefs','Bills'],['49ers','Rams'],['Georgia','Texas'],['Oregon','Ohio State'],['Eagles','Cowboys'],['Alabama','LSU']];
 for(const w of weeks){
  run('INSERT INTO weeks(id,label,lines_at,picks_at,ends_at,status,pot,carry,locked_at,synced_at,settled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',w.id,w.label,w.linesAt,w.picksAt,w.endsAt,w.status,w.pot,w.carry,w.linesAt,w.linesAt,w.status==='settled'?w.endsAt:null);
  for(let i=0;i<6;i++){
   const college=[2,3,5].includes(i);
   const gameDay=new Date(Date.parse((w.id===1?priorWed:lastWed)+'T00:00:00Z')+(college?3:4)*86400000).toISOString().slice(0,10);
   const starts=w.id<3?pacificInstant(gameDay,i%2?13:10,i%2?25:0):stamp(3*86400000+i*3600000);
   run('INSERT INTO games(id,week_id,league,home,away,starts_at,home_spread,quoted_at,bookmaker,status,home_score,away_score) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)','demo-'+i,w.id,[2,3,5].includes(i)?'COLLEGE':'NFL',...names[i],starts,[-3.5,2.5,-7,1.5,-2,3][i],w.linesAt,'simulated-fixture',w.id<3?'final':'scheduled',w.id<3?28:null,w.id<3?17:null);
  }
  for(const a of PLAYERS){
   if(w.id===3&&a.id!==3)continue;
   if(w.id===4&&[2,27].includes(a.id))continue;
   run('INSERT INTO entries VALUES(?,?,?)',a.id,w.id,w.id<3?new Date(Date.parse(w.picksAt)-3600000).toISOString():stamp(-1800000));
   const winCount=w.id===2&&[3,5].includes(a.id)?5:a.id%5;
   for(let i=0;i<5;i++){
    const side=w.id===4&&a.id===3?'away':i<winCount?'home':'away';
    run('INSERT INTO picks VALUES(?,?,?,?)',a.id,w.id,'demo-'+i,side);
   }
  }
 }
 for(const id of [3,5])run('INSERT INTO awards VALUES(?,?,?)',2,id,25000);
 run('INSERT INTO audit(at,actor,action,detail) VALUES(?,?,?,?)',stamp(0),4,'presentation_seeded',JSON.stringify({synthetic:true,players:25,completedWeek:lastWed,winners:['Bob','Maya']}));
}
