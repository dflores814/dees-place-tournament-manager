import { BracketSize, BracketStyle, BracketType, Player, Tournament } from './types';

export const newId=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;

export function parseBracketType(type:BracketType):{capacity:BracketSize;style:BracketStyle}{
 const [size,...styleParts]=type.split('-');
 return {capacity:Number(size) as BracketSize,style:styleParts.join('-') as BracketStyle};
}

export function labelForBracket(type:BracketType):string{
 const {capacity,style}=parseBracketType(type);
 const label=style==='single'?'Single Elimination':style==='double'?'Double Elimination':'Modified Single Elim';
 return `${capacity} Player ${label}`;
}

export function createTournament(name:string,bracketType:BracketType='16-double'):Tournament{
 const now=new Date().toISOString();
 const {capacity}=parseBracketType(bracketType);
 return {id:newId(),name:name.trim()||'New Tournament',createdAt:now,updatedAt:now,status:'draft',capacity,bracketType,players:[],results:[],settings:{entryFee:10,raceTo:2,game:'8-ball',rules:'Modified APA rules',payoutPreset:'70-30'}};
}

export function upsertPlayer(t:Tournament,seed:number,name:string,skillLevel?:number):Tournament{
 const existing=t.players.find(p=>p.seed===seed);
 const players=t.players.filter(p=>p.seed!==seed);
 if(name.trim()) players.push({id:existing?.id??newId(),name:name.trim(),seed,paid:existing?.paid??false,...(skillLevel?{skillLevel}:{})});
 return {...t,players:players.sort((a,b)=>a.seed-b.seed),results:[],updatedAt:new Date().toISOString()};
}

export function purse(t:Tournament){return t.players.length*t.settings.entryFee;}
export function payouts(t:Tournament):number[]{
 const total=purse(t); const preset=t.settings.payoutPreset;
 if(preset==='winner-take-all') return [total];
 if(preset==='70-30') return [total*.7,total*.3];
 return [total*.6,total*.3,total*.1];
}
