export const ZONE = 'America/Los_Angeles';
export function pacificParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
export function pacificInstant(day, hour, minute=0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Use a YYYY-MM-DD date.');
  const base = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0,10)!==day) throw new Error('Invalid date.');
  const target=base+(hour*60+minute)*60000;
  let guess=target+8*3600000;
  for(let i=0;i<3;i++) { const p=pacificParts(new Date(guess)); guess+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); }
  return new Date(guess).toISOString();
}
export function weekDeadlines(wednesday) {
  const d=new Date(`${wednesday}T00:00:00Z`);
  if(d.getUTCDay()!==3) throw new Error('Select the Wednesday of the pool week.');
  const thursday=new Date(d.getTime()+86400000).toISOString().slice(0,10);
  const tuesday=new Date(d.getTime()+6*86400000).toISOString().slice(0,10);
  return {linesAt:pacificInstant(wednesday,21),picksAt:pacificInstant(thursday,23,59),endsAt:pacificInstant(tuesday,0)};
}
export function gradePick(game, side) {
  if(game.status==='void') return 'void';
  if(game.status!=='final') return 'pending';
  const margin=side==='home' ? game.home_score-game.away_score+game.home_spread : game.away_score-game.home_score-game.home_spread;
  return margin>0?'win':margin<0?'loss':'push';
}
export function validSelections(picks,games,deadline) {
  if(!Array.isArray(picks)||picks.length!==5) throw new Error('Choose exactly five games.');
  if(new Set(picks.map(p=>p.gameId)).size!==5) throw new Error('Choose five different games.');
  for(const p of picks) {
    const g=games.find(g=>g.id===p.gameId);
    if(!g || !['home','away'].includes(p.side) || g.status!=='scheduled' || g.starts_at<=deadline) throw new Error('One of these games is not eligible.');
  }
}
export function payout(totalCents, winnerIds) {
  const ids=[...winnerIds].sort((a,b)=>a-b);
  if(!ids.length) return [];
  return ids.map((userId,i)=>({userId,cents:Math.floor(totalCents/ids.length)+(i<totalCents%ids.length?1:0)}));
}
