import { describe,it,expect } from 'vitest';
import { BRACKET_16,bracketDefinitions,resolveBracket,recordWinner,removeResultAndDependents } from '../src/domain/bracket16';
import { Player,MatchResult } from '../src/domain/types';
const players:Player[]=Array.from({length:16},(_,i)=>({id:`p${i+1}`,name:`P${i+1}`,seed:i+1,paid:true}));
const players32:Player[]=Array.from({length:32},(_,i)=>({id:`p${i+1}`,name:`P${i+1}`,seed:i+1,paid:true}));
const championshipPath=(gfWinner:string):MatchResult[]=>[
 {matchId:'U1',winnerId:'p1',completedAt:''},{matchId:'U2',winnerId:'p8',completedAt:''},{matchId:'U3',winnerId:'p4',completedAt:''},{matchId:'U4',winnerId:'p5',completedAt:''},
 {matchId:'U5',winnerId:'p2',completedAt:''},{matchId:'U6',winnerId:'p7',completedAt:''},{matchId:'U7',winnerId:'p3',completedAt:''},{matchId:'U8',winnerId:'p6',completedAt:''},
 {matchId:'U9',winnerId:'p1',completedAt:''},{matchId:'U10',winnerId:'p4',completedAt:''},{matchId:'U11',winnerId:'p2',completedAt:''},{matchId:'U12',winnerId:'p3',completedAt:''},
 {matchId:'U13',winnerId:'p1',completedAt:''},{matchId:'U14',winnerId:'p2',completedAt:''},{matchId:'U15',winnerId:'p1',completedAt:''},
 {matchId:'L1',winnerId:'p16',completedAt:''},{matchId:'L2',winnerId:'p13',completedAt:''},{matchId:'L3',winnerId:'p15',completedAt:''},{matchId:'L4',winnerId:'p14',completedAt:''},
 {matchId:'L5',winnerId:'p16',completedAt:''},{matchId:'L6',winnerId:'p13',completedAt:''},{matchId:'L7',winnerId:'p15',completedAt:''},{matchId:'L8',winnerId:'p14',completedAt:''},
 {matchId:'L9',winnerId:'p16',completedAt:''},{matchId:'L10',winnerId:'p15',completedAt:''},{matchId:'L11',winnerId:'p16',completedAt:''},{matchId:'L12',winnerId:'p15',completedAt:''},
 {matchId:'L13',winnerId:'p16',completedAt:''},{matchId:'L14',winnerId:'p2',completedAt:''},{matchId:'GF',winnerId:gfWinner,completedAt:''}
];
describe('16 player double elimination engine',()=>{
 it('defines 31 matches including conditional bracket reset',()=>expect(BRACKET_16).toHaveLength(31));
 it('opens eight upper matches',()=>expect(resolveBracket(players,[]).filter(m=>m.ready&&!m.complete)).toHaveLength(8));
 it('routes winner and loser',()=>{const r=recordWinner([], 'U1','p1');const b=resolveBracket(players,r);expect(b.find(m=>m.id==='U1')?.loserId).toBe('p16');expect(b.find(m=>m.id==='L1')?.playerIds[0]).toBe('p16');});
 it('advances first-round byes without creating loser-side players',()=>{
  const shortPlayers=players.slice(0,12);
  const b=resolveBracket(shortPlayers,[]);
  expect(b.find(m=>m.id==='U1')?.winnerId).toBe('p1');
  expect(b.find(m=>m.id==='U9')?.playerIds[0]).toBe('p1');
  expect(b.find(m=>m.id==='L1')?.playerIds[0]).toBeNull();
 });
 it('drops a bye player to losers bracket after their first played winners-side loss',()=>{
 const shortPlayers=players.slice(0,12);
 const results=recordWinner([], 'U2','p8');
 const afterRoundOne=resolveBracket(shortPlayers,results);
 expect(afterRoundOne.find(m=>m.id==='U9')?.playerIds).toEqual(['p1','p8']);
  const afterByePlayerLoses=resolveBracket(shortPlayers,recordWinner(results,'U9','p8'));
  expect(afterByePlayerLoses.find(m=>m.id==='L1')?.playerIds).toEqual(['p1','p9']);
  expect(afterByePlayerLoses.find(m=>m.id==='L5')?.playerIds[1]).toBeNull();
 });
 it('holds a real first-round loser until the paired bye player drops from winners side',()=>{
  const shortPlayers=players.slice(0,12);
  const bracket=resolveBracket(shortPlayers,recordWinner([], 'U2','p8'));
  expect(bracket.find(m=>m.id==='L1')?.playerIds).toEqual([null,'p9']);
  expect(bracket.find(m=>m.id==='L1')?.winnerId).toBeNull();
  expect(bracket.find(m=>m.id==='L5')?.playerIds[0]).toBeNull();
 });
 it('makes winners-side losers wait for the correct losers-bracket winner',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p8'),
   ...recordWinner([], 'U9','p1')
  ];
 const waiting=resolveBracket(players,results);
  expect(waiting.find(m=>m.id==='L1')?.playerIds).toEqual(['p16','p9']);
  expect(waiting.find(m=>m.id==='L8')?.playerIds).toEqual([null,'p8']);
  const afterLosersRound=resolveBracket(players,recordWinner(results,'L1','p16'));
  expect(afterLosersRound.find(m=>m.id==='L8')?.playerIds).toEqual([null,'p8']);
 });
 it('routes winner-side losers to the matching loser-of labels',()=>{
  const results=[
   ...recordWinner([], 'U7','p3'),
   ...recordWinner([], 'U8','p6'),
   ...recordWinner([], 'U12','p3')
  ];
  const bracket=resolveBracket(players,results);
  expect(bracket.find(m=>m.id==='L5')?.playerIds).toEqual([null,'p6']);
 });
 it('defines 16 player lower drops in the same order as the visual loser-of labels',()=>{
  const defs=bracketDefinitions('16-double');
  const lowerDropFor=(upperId:string)=>defs.find(def=>def.side==='lower'&&def.slots.some(slot=>slot.type==='loser'&&slot.matchId===upperId))?.id;
  expect(lowerDropFor('U12')).toBe('L5');
  expect(lowerDropFor('U11')).toBe('L6');
  expect(lowerDropFor('U10')).toBe('L7');
  expect(lowerDropFor('U9')).toBe('L8');
  expect(lowerDropFor('U13')).toBe('L11');
  expect(lowerDropFor('U14')).toBe('L12');
  expect(lowerDropFor('U15')).toBe('L14');
 });
 it('eliminates losers-bracket losers instead of routing them forward',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p8'),
   ...recordWinner([], 'L1','p16')
  ];
  const bracket=resolveBracket(players,results);
  expect(bracket.find(m=>m.id==='L1')?.loserId).toBe('p9');
  expect(bracket.filter(m=>!['U2','L1'].includes(m.id)).some(m=>m.playerIds.includes('p9'))).toBe(false);
 });
 it('selects and corrects losers-side winners the same way as winners-side matches',()=>{
  const setup=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p8')
  ];
  const afterLowerWinner=resolveBracket(players,recordWinner(setup,'L1','p16'));
  expect(afterLowerWinner.find(m=>m.id==='L5')?.playerIds[0]).toBe('p16');
  const corrected=removeResultAndDependents(recordWinner(setup,'L1','p16'),'L1');
  expect(corrected.map(result=>result.matchId)).toEqual(['U1','U2']);
  expect(resolveBracket(players,corrected).find(m=>m.id==='L5')?.playerIds[0]).toBeNull();
 });
 it('does not open bracket reset when undefeated finalist wins grand finals',()=>{
  const bracket=resolveBracket(players,championshipPath('p1'));
  expect(bracket.find(m=>m.id==='GF')?.playerIds).toEqual(['p1','p2']);
  expect(bracket.find(m=>m.id==='GFR')?.ready).toBe(false);
 });
 it('opens bracket reset when losers finalist wins first grand finals series',()=>{
  const bracket=resolveBracket(players,championshipPath('p2'));
  expect(bracket.find(m=>m.id==='GFR')?.playerIds).toEqual(['p1','p2']);
  expect(bracket.find(m=>m.id==='GFR')?.ready).toBe(true);
 });
 it('undo removes downstream results',()=>{const results:MatchResult[]=[{matchId:'U1',winnerId:'p1',completedAt:''},{matchId:'U2',winnerId:'p8',completedAt:''},{matchId:'U9',winnerId:'p1',completedAt:''}];expect(removeResultAndDependents(results,'U1').map(x=>x.matchId)).toEqual(['U2']);});
});

describe('32 player double elimination engine',()=>{
 it('defines 63 matches including conditional bracket reset',()=>expect(resolveBracket(players32,[],'32-double')).toHaveLength(63));
 it('opens sixteen upper matches',()=>expect(resolveBracket(players32,[],'32-double').filter(m=>m.ready&&!m.complete)).toHaveLength(16));
 it('routes first-round winners and losers into the same structure as 16 player double elimination',()=>{
  const bracket=resolveBracket(players32,recordWinner([], 'U1','p1'),'32-double');
  expect(bracket.find(m=>m.id==='U1')?.loserId).toBe('p32');
  expect(bracket.find(m=>m.id==='L1')?.playerIds[0]).toBe('p32');
 });
 it('advances first-round byes without dropping anyone to losers',()=>{
  const shortPlayers=players32.slice(0,24);
  const bracket=resolveBracket(shortPlayers,[],'32-double');
  expect(bracket.find(m=>m.id==='U1')?.winnerId).toBe('p1');
  expect(bracket.find(m=>m.id==='U17')?.playerIds[0]).toBe('p1');
  expect(bracket.find(m=>m.id==='L1')?.playerIds[0]).toBeNull();
 });
 it('drops a bye player to the paired losers match after their first played winners-side loss',()=>{
  const shortPlayers=players32.slice(0,24);
  const results=recordWinner([], 'U2','p16');
  const afterRoundOne=resolveBracket(shortPlayers,results,'32-double');
  expect(afterRoundOne.find(m=>m.id==='U17')?.playerIds).toEqual(['p1','p16']);
  const afterByePlayerLoses=resolveBracket(shortPlayers,recordWinner(results,'U17','p16'),'32-double');
  expect(afterByePlayerLoses.find(m=>m.id==='L1')?.playerIds).toEqual(['p1','p17']);
  expect(afterByePlayerLoses.find(m=>m.id==='L16')?.playerIds[1]).toBeNull();
 });
 it('makes winners-side losers wait for the correct losers-bracket winner',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p16'),
   ...recordWinner([], 'U17','p1')
  ];
  const waiting=resolveBracket(players32,results,'32-double');
  expect(waiting.find(m=>m.id==='L1')?.playerIds).toEqual(['p32','p17']);
  expect(waiting.find(m=>m.id==='L16')?.playerIds).toEqual([null,'p16']);
  const afterLosersRound=resolveBracket(players32,recordWinner(results,'L1','p32'),'32-double');
  expect(afterLosersRound.find(m=>m.id==='L16')?.playerIds).toEqual([null,'p16']);
 });
 it('routes 32 player winner-side losers to the matching loser-of labels',()=>{
  const results=[
   ...recordWinner([], 'U15','p6'),
   ...recordWinner([], 'U16','p11'),
   ...recordWinner([], 'U24','p6')
  ];
  const bracket=resolveBracket(players32,results,'32-double');
  expect(bracket.find(m=>m.id==='L9')?.playerIds).toEqual([null,'p11']);
 });
 it('defines 32 player lower drops in the same order as the visual loser-of labels',()=>{
  const defs=bracketDefinitions('32-double');
  const lowerDropFor=(upperId:string)=>defs.find(def=>def.side==='lower'&&def.slots.some(slot=>slot.type==='loser'&&slot.matchId===upperId))?.id;
  expect(lowerDropFor('U24')).toBe('L9');
  expect(lowerDropFor('U23')).toBe('L10');
  expect(lowerDropFor('U22')).toBe('L11');
  expect(lowerDropFor('U21')).toBe('L12');
  expect(lowerDropFor('U20')).toBe('L13');
  expect(lowerDropFor('U19')).toBe('L14');
  expect(lowerDropFor('U18')).toBe('L15');
  expect(lowerDropFor('U17')).toBe('L16');
  expect(lowerDropFor('U26')).toBe('L21');
  expect(lowerDropFor('U25')).toBe('L22');
  expect(lowerDropFor('U28')).toBe('L23');
  expect(lowerDropFor('U27')).toBe('L24');
  expect(lowerDropFor('U30')).toBe('L27');
  expect(lowerDropFor('U29')).toBe('L28');
  expect(lowerDropFor('U31')).toBe('L30');
 });
 it('eliminates losers-bracket losers instead of routing them forward',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p16'),
   ...recordWinner([], 'L1','p32')
  ];
  const bracket=resolveBracket(players32,results,'32-double');
  expect(bracket.find(m=>m.id==='L1')?.loserId).toBe('p17');
  expect(bracket.filter(m=>!['U2','L1'].includes(m.id)).some(m=>m.playerIds.includes('p17'))).toBe(false);
 });
 it('selects and corrects 32 player losers-side winners the same way as winners-side matches',()=>{
  const setup=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p16'),
   ...recordWinner([], 'U15','p6'),
   ...recordWinner([], 'U16','p11'),
   ...recordWinner([], 'U24','p6')
  ];
  const afterLowerWinner=resolveBracket(players32,recordWinner(setup,'L1','p32'),'32-double');
  expect(afterLowerWinner.find(m=>m.id==='L9')?.playerIds).toEqual(['p32','p11']);
  const corrected=removeResultAndDependents(recordWinner(setup,'L1','p32'),'L1','32-double');
  expect(corrected.map(result=>result.matchId)).toEqual(['U1','U2','U15','U16','U24']);
  expect(resolveBracket(players32,corrected,'32-double').find(m=>m.id==='L9')?.playerIds).toEqual([null,'p11']);
 });
});

describe('modified single elimination engine',()=>{
 it('builds a 16 player winners bracket plus second-chance bracket',()=>{
  const bracket=resolveBracket(players,[],'16-modified-single');
  expect(bracket).toHaveLength(23);
  expect(bracket.filter(m=>m.side==='upper')).toHaveLength(15);
  expect(bracket.filter(m=>m.side==='lower')).toHaveLength(7);
  expect(bracket.filter(m=>m.side==='final')).toHaveLength(1);
 });
 it('builds a 32 player winners bracket plus second-chance bracket',()=>{
  const bracket=resolveBracket(players32,[],'32-modified-single');
  expect(bracket).toHaveLength(47);
  expect(bracket.filter(m=>m.side==='upper')).toHaveLength(31);
  expect(bracket.filter(m=>m.side==='lower')).toHaveLength(15);
  expect(bracket.filter(m=>m.side==='final')).toHaveLength(1);
 });
 it('routes 16 player first-round losers into second chance matches only',()=>{
  const results=recordWinner([], 'U1','p1');
  const bracket=resolveBracket(players,results,'16-modified-single');
  expect(bracket.find(m=>m.id==='U1')?.loserId).toBe('p16');
  expect(bracket.find(m=>m.id==='L1')?.playerIds[0]).toBe('p16');
 });
 it('does not drop a later winners-side loser into the second-chance bracket',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p8'),
   ...recordWinner([], 'U9','p1')
  ];
  const bracket=resolveBracket(players,results,'16-modified-single');
  expect(bracket.find(m=>m.id==='U9')?.loserId).toBe('p8');
  expect(bracket.some(m=>m.side==='lower'&&m.playerIds.includes('p8'))).toBe(false);
 });
 it('gives 16 player first-round losers a second match and then eliminates the second-chance loser',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p8'),
   ...recordWinner([], 'L1','p16')
  ];
  const bracket=resolveBracket(players,results,'16-modified-single');
  expect(bracket.find(m=>m.id==='L1')?.loserId).toBe('p9');
  expect(bracket.filter(m=>m.side==='lower'&&m.id!=='L1').some(m=>m.playerIds.includes('p9'))).toBe(false);
 });
 it('routes 32 player first-round losers into second chance matches only',()=>{
  const results=recordWinner([], 'U1','p1');
  const bracket=resolveBracket(players32,results,'32-modified-single');
  expect(bracket.find(m=>m.id==='U1')?.loserId).toBe('p32');
  expect(bracket.find(m=>m.id==='L1')?.playerIds[0]).toBe('p32');
 });
 it('does not drop a 32 player later winners-side loser into second chance',()=>{
  const results=[
   ...recordWinner([], 'U1','p1'),
   ...recordWinner([], 'U2','p16'),
   ...recordWinner([], 'U17','p1')
  ];
  const bracket=resolveBracket(players32,results,'32-modified-single');
  expect(bracket.find(m=>m.id==='U17')?.loserId).toBe('p16');
  expect(bracket.some(m=>m.side==='lower'&&m.playerIds.includes('p16'))).toBe(false);
 });
});
