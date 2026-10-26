const BASE='https://api.the-odds-api.com/v4/sports/';
async function get(path,params={}) {
  if(!process.env.ODDS_API_KEY) throw new Error('Live odds are not connected. Configure ODDS_API_KEY on the server.');
  const u=new URL(path,BASE); u.search=new URLSearchParams({...params,apiKey:process.env.ODDS_API_KEY});
  let response;
  try { response=await fetch(u,{signal:AbortSignal.timeout(15000)}); } catch { throw new Error('The odds provider could not be reached.'); }
  if(!response.ok) throw new Error(`Odds provider returned ${response.status}. Check API access and quota.`);
  return response.json();
}
export async function fetchSpreads() {
  const bookmaker=process.env.ODDS_BOOKMAKER || 'draftkings';
  const result=await Promise.all(['americanfootball_nfl','americanfootball_ncaaf'].map(async sport=>{
    const rows=await get(`${sport}/odds`,{regions:'us',markets:'spreads',bookmakers:bookmaker,oddsFormat:'american'});
    return rows.flatMap(g=>{
      const book=g.bookmakers.find(b=>b.key===bookmaker), market=book?.markets.find(m=>m.key==='spreads');
      const home=market?.outcomes.find(o=>o.name===g.home_team),away=market?.outcomes.find(o=>o.name===g.away_team);
      if(!Number.isFinite(Date.parse(g.commence_time))||!Number.isFinite(home?.point)||!Number.isFinite(away?.point)||Math.abs(home.point+away.point)>0.001) return [];
      return [{id:g.id,league:sport.endsWith('nfl')?'NFL':'COLLEGE',home:g.home_team,away:g.away_team,startsAt:new Date(g.commence_time).toISOString(),homeSpread:home.point,quotedAt:book.last_update,bookmaker}];
    });
  }));
  return result.flat();
}
export async function fetchScores() {
  const rows=await Promise.all(['americanfootball_nfl','americanfootball_ncaaf'].map(s=>get(`${s}/scores`,{daysFrom:'3'})));
  return rows.flat().filter(g=>g.completed && g.scores?.length===2).flatMap(g=>{
    const home=Number(g.scores.find(s=>s.name===g.home_team)?.score),away=Number(g.scores.find(s=>s.name===g.away_team)?.score);
    return Number.isFinite(home)&&Number.isFinite(away)?[{id:g.id,home,away}]:[];
  });
}
