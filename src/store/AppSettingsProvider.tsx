import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TournamentHistoryType } from '@/domain/types';

export type AppSettings={
 appearance:'dark'|'light';
 directorLock:boolean;
 participantPermission:'report-winners'|'view-only'|'director-approval';
 matchConfirmation:'single-tap'|'director-approval'|'both-players';
 raceChartMode:'off'|'8-ball-singles'|'custom'|'side-race'|'skill-handicap';
 skillLevelsEnabled:boolean;
 customRaceChart:Record<string,string>;
 sideRaceTargets:{upper:number;lower:number;final:number};
 skillHandicapTargets:{upper:number;lower:number;final:number};
 randomizeDefault:'ask'|'randomize'|'keep-order';
 byeHandling:'editable'|'auto-advance';
 playerDisplay:'full-name'|'initials'|'seed-name';
 bracketZoomDefault:'fit'|'last-used'|'full-size';
 readyMatchColor:'red'|'green'|'gold';
 notifications:boolean;
 autoSave:'every-change'|'every-match'|'manual';
 qrTimeout:'never'|'tournament-end'|'one-hour';
 tournamentHistoryType:TournamentHistoryType;
 payoutPreset:'top-4'|'top-8'|'custom';
 tableLabels:boolean;
 exportFormat:'json'|'csv';
};

const KEY='dees-place-app-settings-v1';
export const skillLevels=[2,3,4,5,6,7] as const;
export const eightBallSinglesRaceChart:Record<string,string>={
 '2-2':'2/2','2-3':'2/3','2-4':'2/4','2-5':'2/5','2-6':'2/6','2-7':'2/7',
 '3-2':'3/2','3-3':'2/2','3-4':'2/3','3-5':'2/4','3-6':'2/5','3-7':'2/6',
 '4-2':'4/2','4-3':'3/2','4-4':'3/3','4-5':'3/4','4-6':'3/5','4-7':'2/5',
 '5-2':'5/2','5-3':'4/2','5-4':'4/3','5-5':'4/4','5-6':'4/5','5-7':'3/5',
 '6-2':'6/2','6-3':'5/2','6-4':'5/3','6-5':'5/4','6-6':'5/5','6-7':'4/5',
 '7-2':'7/2','7-3':'6/2','7-4':'5/2','7-5':'5/3','7-6':'5/4','7-7':'5/5'
};
const defaults:AppSettings={
 appearance:'dark',
 directorLock:false,
 participantPermission:'report-winners',
 matchConfirmation:'single-tap',
 raceChartMode:'off',
 skillLevelsEnabled:false,
 customRaceChart:eightBallSinglesRaceChart,
 sideRaceTargets:{upper:3,lower:2,final:3},
 skillHandicapTargets:{upper:3,lower:2,final:3},
 randomizeDefault:'ask',
 byeHandling:'editable',
 playerDisplay:'full-name',
 bracketZoomDefault:'fit',
 readyMatchColor:'red',
 notifications:false,
 autoSave:'every-change',
 qrTimeout:'tournament-end',
 tournamentHistoryType:'singles',
 payoutPreset:'top-8',
 tableLabels:true,
 exportFormat:'json'
};

type Ctx={settings:AppSettings;hydrated:boolean;updateSetting:<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>void;resetSettings:()=>void};
const Context=createContext<Ctx|null>(null);

export function AppSettingsProvider({children}:{children:React.ReactNode}){
 const [settings,setSettings]=useState<AppSettings>(defaults);
 const [hydrated,setHydrated]=useState(false);
 useEffect(()=>{AsyncStorage.getItem(KEY).then(raw=>{if(raw)setSettings({...defaults,...JSON.parse(raw)});setHydrated(true);}).catch(()=>setHydrated(true));},[]);
 useEffect(()=>{if(hydrated) void AsyncStorage.setItem(KEY,JSON.stringify(settings));},[settings,hydrated]);
 const updateSetting=useCallback(<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>setSettings(current=>({...current,[key]:value})),[]);
 const resetSettings=useCallback(()=>setSettings(defaults),[]);
 const value=useMemo(()=>({settings,hydrated,updateSetting,resetSettings}),[settings,hydrated,updateSetting,resetSettings]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppSettings(){
 const value=useContext(Context);
 if(!value)throw new Error('AppSettingsProvider missing');
 return value;
}
