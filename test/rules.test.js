import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDeadlines, pacificInstant, gradePick, validSelections, payout } from '../rules.js';
test('Pacific deadlines follow daylight saving time',()=>{
 assert.deepEqual(weekDeadlines('2026-10-28'),{linesAt:'2026-10-29T04:00:00.000Z',picksAt:'2026-10-30T06:59:00.000Z',endsAt:'2026-11-03T08:00:00.000Z'});
 assert.equal(weekDeadlines('2026-11-04').linesAt,'2026-11-05T05:00:00.000Z');
 assert.equal(weekDeadlines('2026-11-04').picksAt,'2026-11-06T07:59:00.000Z');
 assert.throws(()=>weekDeadlines('2026-10-29'));
 assert.throws(()=>pacificInstant('2026-02-30',21));
});
test('ATS grading supports both sides, half points, pushes and voids',()=>{
 const g={status:'final',home_score:24,away_score:21,home_spread:-3};
 assert.equal(gradePick(g,'home'),'push');assert.equal(gradePick(g,'away'),'push');
 assert.equal(gradePick({...g,home_spread:-2.5},'home'),'win');
 assert.equal(gradePick({...g,home_spread:-2.5},'away'),'loss');
 assert.equal(gradePick({...g,status:'void'},'home'),'void');
 assert.equal(gradePick({...g,status:'scheduled'},'home'),'pending');
});
test('five unique games, one valid side each, starting after the deadline',()=>{
 const games=Array.from({length:5},(_,id)=>({id:String(id),status:'scheduled',starts_at:'2026-11-01T20:00:00.000Z'}));
 const picks=games.map(g=>({gameId:g.id,side:'home'})),deadline='2026-10-30T06:59:00.000Z';
 assert.doesNotThrow(()=>validSelections(picks,games,deadline));
 assert.throws(()=>validSelections(picks.slice(0,4),games,deadline));
 assert.throws(()=>validSelections([picks[0],...picks.slice(0,4)],games,deadline));
 assert.throws(()=>validSelections([{gameId:'0',side:'bad'},...picks.slice(1)],games,deadline));
 assert.throws(()=>validSelections(picks,[{...games[0],starts_at:deadline},...games.slice(1)],deadline));
});
test('payouts conserve every cent with deterministic remainder handling',()=>{
 assert.deepEqual(payout(25000,[]),[]);assert.deepEqual(payout(50000,[9]),[{userId:9,cents:50000}]);
 assert.deepEqual(payout(25000,[3,2,1]),[{userId:1,cents:8334},{userId:2,cents:8333},{userId:3,cents:8333}]);
});
