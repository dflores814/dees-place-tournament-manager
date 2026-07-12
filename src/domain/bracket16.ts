import { BracketSize, BracketStyle, BracketType, MatchDefinition, MatchResult, Player, ResolvedMatch, SlotSource } from './types';
import { parseBracketType } from './tournament';

const s=(seed:number):SlotSource=>({type:'seed',seed});
const w=(matchId:string):SlotSource=>({type:'winner',matchId});
const l=(matchId:string):SlotSource=>({type:'loser',matchId});
const m=(id:string,number:number,side:MatchDefinition['side'],round:number,label:string,a:SlotSource,b:SlotSource):MatchDefinition=>({id,number,side,round,label,slots:[a,b]});

function seedOrder(size:BracketSize):number[]{
 let order=[1,2];
 while(order.length<size){
  const next=order.length*2+1;
  order=order.flatMap(seed=>[seed,next-seed]);
 }
 return order;
}

function buildSingle(size:BracketSize,style:BracketStyle):MatchDefinition[]{
 const defs:MatchDefinition[]=[];
 let number=1;
 let previous:string[]=[];
 const seeds=seedOrder(size);
 for(let i=0;i<size;i+=2){
  const id=`U${number}`;
  defs.push(m(id,number++,'upper',1,'Round 1',s(seeds[i]!),s(seeds[i+1]!)));
  previous.push(id);
 }
 let round=2;
 while(previous.length>1){
  const next:string[]=[];
  for(let i=0;i<previous.length;i+=2){
   const id=`U${number}`;
   const label=previous.length===2?'Final':previous.length===4?'Semifinal':previous.length===8?'Quarterfinal':`Round ${round}`;
   defs.push(m(id,number++,'upper',round,label,w(previous[i]!),w(previous[i+1]!)));
   next.push(id);
  }
  previous=next;
  round++;
 }
 if(style==='modified-single'){
  const sf=defs.filter(d=>d.side==='upper'&&d.round===round-2);
  if(sf.length===2) defs.push(m(`P${number}`,number++,'final',1,'3rd - 4th',l(sf[0]!.id),l(sf[1]!.id)));
 }
 return defs;
}

function buildModified(size:BracketSize):MatchDefinition[]{
 const defs=buildSingle(size,'single').map(d=>({...d}));
 let number=defs.length+1;
 let lowerId=1;
 let firstLosers=defs.filter(d=>d.side==='upper'&&d.round===1).map(d=>d.id);
 let previous:string[]=[];
 for(let i=0;i<firstLosers.length;i+=2){
  const id=`L${lowerId++}`;
  defs.push(m(id,number++,'lower',1,'Second Chance',l(firstLosers[i]!),l(firstLosers[i+1]!)));
  previous.push(id);
 }
 let round=2;
 while(previous.length>1){
  const next:string[]=[];
  for(let i=0;i<previous.length;i+=2){
   const id=`L${lowerId++}`;
   defs.push(m(id,number++,'lower',round,'Second Chance',w(previous[i]!),w(previous[i+1]!)));
   next.push(id);
  }
  previous=next;
  round++;
 }
 const sf=defs.filter(d=>d.side==='upper'&&d.label==='Semifinal');
 if(sf.length===2) defs.push(m(`P${number}`,number++,'final',1,'3rd - 4th',l(sf[0]!.id),l(sf[1]!.id)));
 return defs;
}

function buildDouble(size:BracketSize):MatchDefinition[]{
 const defs=buildSingle(size,'single').map(d=>({...d}));
 let number=defs.length+1;
 let lowerId=1;
 let upperRoundLosers=defs.filter(d=>d.side==='upper').reduce<Record<number,string[]>>((acc,d)=>{
  (acc[d.round]??=[]).push(d.id);
  return acc;
 },{});
 let lowerQueue:string[]=[];
 const firstLosers=upperRoundLosers[1]!;
 for(let i=0;i<firstLosers.length;i+=2){
  const id=`L${lowerId++}`;
  defs.push(m(id,number++,'lower',1,'Loser R1',l(firstLosers[i]!),l(firstLosers[i+1]!)));
  lowerQueue.push(id);
 }
 let lowerRound=2;
 const maxUpperRound=Math.log2(size);
 const orderedIncoming=(upperRound:number,incoming:string[])=>{
  if(size===16 && upperRound===2) return [...incoming].reverse();
  if(size===32 && upperRound===2) return [...incoming].reverse();
  if(size===32 && upperRound===3) return [incoming[1],incoming[0],incoming[3],incoming[2]].filter(Boolean) as string[];
  if(size===32 && upperRound===4) return [...incoming].reverse();
  return incoming;
 };
 for(let upperRound=2;upperRound<=maxUpperRound;upperRound++){
  const incoming=orderedIncoming(upperRound,upperRoundLosers[upperRound]??[]);
  const merged:string[]=[];
  for(let i=0;i<lowerQueue.length;i++){
  if(incoming[i]){
    const id=`L${lowerId++}`;
    defs.push(m(id,number++,'lower',lowerRound,`Loser R${lowerRound}`,w(lowerQueue[i]!),l(incoming[i]!)));
    merged.push(id);
   }else{
    merged.push(lowerQueue[i]!);
   }
  }
  lowerQueue=merged;
  lowerRound++;
  if(lowerQueue.length>1){
   const next:string[]=[];
   for(let i=0;i<lowerQueue.length;i+=2){
    const id=`L${lowerId++}`;
    defs.push(m(id,number++,'lower',lowerRound,`Loser R${lowerRound}`,w(lowerQueue[i]!),w(lowerQueue[i+1]!)));
    next.push(id);
   }
   lowerQueue=next;
   lowerRound++;
  }
 }
 const upperFinal=defs.filter(d=>d.side==='upper').at(-1)!;
 const lowerFinal=lowerQueue[0]!;
 defs.push(m('GF',number++,'final',1,'Grand Final',w(upperFinal.id),w(lowerFinal)));
 defs.push(m('GFR',number,'final',2,'Bracket Reset',w(upperFinal.id),w(lowerFinal)));
 return defs;
}

export function bracketDefinitions(type:BracketType='16-double'):MatchDefinition[]{
 const {capacity,style}=parseBracketType(type);
 if(style==='double') return buildDouble(capacity);
 if(style==='modified-single') return buildModified(capacity);
 return buildSingle(capacity,style);
}

export const BRACKET_16: readonly MatchDefinition[] = bracketDefinitions('16-double');

function playerForSeed(players: readonly Player[], seed:number):string|null {
 return players.find(p=>p.seed===seed)?.id ?? null;
}

function isFirstRoundBye(def:MatchDefinition,p1:string|null,p2:string|null){
 return def.side==='upper' && def.round===1 && def.slots.every(slot=>slot.type==='seed') && ((!!p1&&!p2)||(!p1&&!!p2));
}

export function resolveBracket(players: readonly Player[], results: readonly MatchResult[], type:BracketType='16-double'): ResolvedMatch[] {
 const defs=bracketDefinitions(type);
 const {style}=parseBracketType(type);
 const resultMap = new Map(results.map(r=>[r.matchId,r]));
 const resolved = new Map<string,ResolvedMatch>();
 const consumedLowerDropSources = new Set<string>();
 const relatedUpperDrop=(def:MatchDefinition):string|null=>{
  if(style!=='double') return null;
  if(def.side!=='lower'||def.round!==1) return null;
  const lowerSources=def.slots.filter(slot=>slot.type==='loser').map(slot=>slot.matchId);
  if(lowerSources.length!==2) return null;
  const upper=defs.find(match=>match.side==='upper'&&match.round===2&&match.slots.every(slot=>slot.type==='winner'&&lowerSources.includes(slot.matchId)));
  return upper?.id??null;
 };
 const sourcePlayer=(source:SlotSource):string|null=>{
  if(source.type==='seed') return playerForSeed(players,source.seed);
  if(source.type==='loser'&&consumedLowerDropSources.has(source.matchId)) return null;
  const prior=resolved.get(source.matchId);
  return source.type==='winner' ? prior?.winnerId ?? null : prior?.loserId ?? null;
 };
 const sourcePermanentlyEmpty=(source:SlotSource):boolean=>{
  if(source.type==='seed') return !playerForSeed(players,source.seed);
  if(source.type==='loser'&&consumedLowerDropSources.has(source.matchId)) return true;
  const prior=resolved.get(source.matchId);
  return !!prior?.complete && (source.type==='loser'?!prior.loserId:!prior.winnerId);
 };
 for(const def of defs){
  let p1=sourcePlayer(def.slots[0]); let p2=sourcePlayer(def.slots[1]);
  const result=resultMap.get(def.id);
  if(def.id==='GFR'){
   const grandFinal=resolved.get('GF');
   const resetNeeded=!!grandFinal?.complete && grandFinal.winnerId===grandFinal.playerIds[1];
   if(!resetNeeded){p1=null;p2=null;}
  }
  const upperDrop=relatedUpperDrop(def);
  const upperDropLoser=upperDrop?resolved.get(upperDrop)?.loserId??null:null;
  if(upperDrop&&upperDropLoser){
   if(!p1&&sourcePermanentlyEmpty(def.slots[0])&&p2){p1=upperDropLoser;consumedLowerDropSources.add(upperDrop);}
   else if(!p2&&sourcePermanentlyEmpty(def.slots[1])&&p1){p2=upperDropLoser;consumedLowerDropSources.add(upperDrop);}
  }
  const waitingForUpperDrop=!!upperDrop&&!upperDropLoser&&((!!p1&&!p2&&sourcePermanentlyEmpty(def.slots[1])) || (!!p2&&!p1&&sourcePermanentlyEmpty(def.slots[0])));
  const lowerWalkover=def.side==='lower' && !waitingForUpperDrop && ((!!p1&&!p2&&sourcePermanentlyEmpty(def.slots[1])) || (!!p2&&!p1&&sourcePermanentlyEmpty(def.slots[0])));
  const autoWinner=isFirstRoundBye(def,p1,p2) || lowerWalkover ? (p1??p2) : null;
  const validWinner=result && (result.winnerId===p1 || result.winnerId===p2) ? result.winnerId : autoWinner;
  const loser=validWinner && p1 && p2 ? (validWinner===p1?p2:p1) : null;
  resolved.set(def.id,{...def,playerIds:[p1,p2],winnerId:validWinner,loserId:loser,ready:!!p1&&!!p2,complete:!!validWinner});
 }
 return [...resolved.values()];
}

export function recordWinner(results:readonly MatchResult[], matchId:string, winnerId:string):MatchResult[]{
 const clean=results.filter(r=>r.matchId!==matchId);
 return [...clean,{matchId,winnerId,completedAt:new Date().toISOString()}];
}

export function removeResultAndDependents(results:readonly MatchResult[], matchId:string, type:BracketType='16-double'):MatchResult[]{
 const invalid=new Set([matchId]);
 let changed=true;
 const defs=bracketDefinitions(type);
 while(changed){
  changed=false;
  for(const def of defs){
   if(invalid.has(def.id)) continue;
   if(def.slots.some(slot=>slot.type!=='seed'&&invalid.has(slot.matchId))){invalid.add(def.id);changed=true;}
  }
 }
 return results.filter(r=>!invalid.has(r.matchId));
}

export function nextReadyMatches(players:readonly Player[],results:readonly MatchResult[],type:BracketType='16-double'):ResolvedMatch[]{
 return resolveBracket(players,results,type).filter(match=>match.ready&&!match.complete);
}
