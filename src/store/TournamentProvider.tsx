import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import { BracketType, Tournament, TournamentHistoryEntry } from '@/domain/types';
import { loadTournamentHistory, loadTournaments, saveTournamentHistory, saveTournaments } from './storage';
import { createTournament } from '@/domain/tournament';

type Ctx={items:Tournament[];history:TournamentHistoryEntry[];hydrated:boolean;create:(name:string,bracketType?:BracketType)=>Tournament;update:(t:Tournament)=>void;syncFromRemote:(t:Tournament)=>void;remove:(id:string)=>void;get:(id:string)=>Tournament|undefined;addHistory:(entry:TournamentHistoryEntry)=>void};
const Context=createContext<Ctx|null>(null);
export function TournamentProvider({children}:{children:React.ReactNode}){
 const [items,setItems]=useState<Tournament[]>([]); const [history,setHistory]=useState<TournamentHistoryEntry[]>([]); const [hydrated,setHydrated]=useState(false);
 useEffect(()=>{Promise.all([loadTournaments(),loadTournamentHistory()]).then(([savedItems,savedHistory])=>{setItems(savedItems);setHistory(savedHistory);setHydrated(true);});},[]);
 useEffect(()=>{if(hydrated) void saveTournaments(items);},[items,hydrated]);
 useEffect(()=>{if(hydrated) void saveTournamentHistory(history);},[history,hydrated]);
 const create=useCallback((name:string,bracketType?:BracketType)=>{const t=createTournament(name,bracketType);setItems(x=>[t,...x]);return t;},[]);
 const update=useCallback((t:Tournament)=>setItems(x=>x.map(v=>v.id===t.id?t:v)),[]);
 const syncFromRemote=useCallback((t:Tournament)=>setItems(items=>{
  const existing=items.find(v=>v.id===t.id);
  if(!existing) return [t,...items];
  if(existing.updatedAt>=t.updatedAt) return items;
  return items.map(v=>v.id===t.id?t:v);
 }),[]);
 const remove=useCallback((id:string)=>setItems(x=>x.filter(v=>v.id!==id)),[]);
 const get=useCallback((id:string)=>items.find(v=>v.id===id),[items]);
 const addHistory=useCallback((entry:TournamentHistoryEntry)=>setHistory(x=>x.some(item=>item.tournamentId===entry.tournamentId)?x:[entry,...x]),[]);
 const value=useMemo(()=>({items,history,hydrated,create,update,syncFromRemote,remove,get,addHistory}),[items,history,hydrated,create,update,syncFromRemote,remove,get,addHistory]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTournaments(){const v=useContext(Context);if(!v)throw new Error('TournamentProvider missing');return v;}
