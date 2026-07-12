import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import { BracketType, Tournament } from '@/domain/types';
import { loadTournaments,saveTournaments } from './storage';
import { createTournament } from '@/domain/tournament';

type Ctx={items:Tournament[];hydrated:boolean;create:(name:string,bracketType?:BracketType)=>Tournament;update:(t:Tournament)=>void;syncFromRemote:(t:Tournament)=>void;remove:(id:string)=>void;get:(id:string)=>Tournament|undefined};
const Context=createContext<Ctx|null>(null);
export function TournamentProvider({children}:{children:React.ReactNode}){
 const [items,setItems]=useState<Tournament[]>([]); const [hydrated,setHydrated]=useState(false);
 useEffect(()=>{loadTournaments().then(v=>{setItems(v);setHydrated(true);});},[]);
 useEffect(()=>{if(hydrated) void saveTournaments(items);},[items,hydrated]);
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
 const value=useMemo(()=>({items,hydrated,create,update,syncFromRemote,remove,get}),[items,hydrated,create,update,syncFromRemote,remove,get]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTournaments(){const v=useContext(Context);if(!v)throw new Error('TournamentProvider missing');return v;}
