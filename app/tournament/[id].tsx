import { useEffect,useMemo,useRef,useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTournaments } from '@/store/TournamentProvider';
import { nextReadyMatches, recordWinner, removeResultAndDependents, resolveBracket } from '@/domain/bracket16';
import { labelForBracket, newId } from '@/domain/tournament';
import { BracketType, MatchScore, PayoutRow, Player, ResolvedMatch, SlotSource, Tournament } from '@/domain/types';
import { Button } from '@/components/Button';
import { getTheme, theme } from '@/theme';
import { openTournamentSync, realtimeConfigured, syncUrl, SyncStatus } from '@/store/realtime';
import { AppSettings, eightBallSinglesRaceChart, skillLevels, useAppSettings } from '@/store/AppSettingsProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const bracketFont=Platform.select({web:'Barlow Condensed, Arial Narrow, Arial, sans-serif',android:'sans-serif-condensed',default:undefined});
const bracketColors={
 line:'#cfd7df',
 text:'#f7fbff',
 number:'#7cff4d',
 source:'#35e6ff',
 placement:'#115cff',
 ready:'#ff2633',
 bye:'rgba(124,255,77,.16)',
 gold:'#e0aa45',
 score:'#d783ff'
};

function sourceSeed(source:SlotSource|undefined){return source?.type==='seed'?source.seed:null;}
function shuffle<T>(items:T[]):T[]{return items.map(value=>({value,sort:Math.random()})).sort((a,b)=>a.sort-b.sort).map(item=>item.value);}

function normalize(t:Tournament):Tournament{
 const bracketType=(t.bracketType??'16-double') as BracketType;
 const capacity=t.capacity??16;
 return {...t,bracketType,capacity,scores:t.scores??[],payouts:t.payouts??[],settings:{...t.settings,joinToken:t.settings.joinToken??newId(),historyType:t.settings.historyType??'singles'}};
}

function titleIsValid(name:string){
 const value=name.trim().toLowerCase();
 return value.length>0 && value!=='new tournament';
}

function pinIsValid(pin:string|undefined){
 return /^\d{4}$/.test(pin??'');
}

function pinsMatch(pin:string,confirmation:string){
 return pinIsValid(pin) && pin===confirmation;
}

function duplicatePlayerNames(players:readonly Player[]){
 const seen=new Set<string>();
 const duplicates=new Set<string>();
 for(const player of players){
  const name=player.name.trim().toLowerCase();
  if(!name) continue;
  if(seen.has(name)) duplicates.add(player.name.trim());
  seen.add(name);
 }
 return [...duplicates];
}

function normalizedSkillLevel(value:number|undefined){
 return skillLevels.some(level=>level===value)?value??2:2;
}

function sideRaceTarget(side:ResolvedMatch['side'],settings:AppSettings){
 if(side==='lower')return settings.sideRaceTargets.lower;
 if(side==='final')return settings.sideRaceTargets.final;
 return settings.sideRaceTargets.upper;
}

function skillHandicapBaseTarget(side:ResolvedMatch['side'],settings:AppSettings){
 if(side==='lower')return settings.skillHandicapTargets.lower;
 if(side==='final')return settings.skillHandicapTargets.final;
 return settings.skillHandicapTargets.upper;
}

function skillHandicapRace(playerA:Player|undefined,playerB:Player|undefined,settings:AppSettings,side:ResolvedMatch['side']){
 if(!playerA||!playerB)return null;
 const base=Math.max(1,skillHandicapBaseTarget(side,settings));
 const a=normalizedSkillLevel(playerA.skillLevel);
 const b=normalizedSkillLevel(playerB.skillLevel);
 const gap=Math.abs(a-b);
 const targets:[number,number]=[base,base];
 if(gap>=2){
  if(a<b)targets[0]=Math.max(1,base-1);
  if(b<a)targets[1]=Math.max(1,base-1);
 }
 return targets;
}

function raceForPlayers(playerA:Player|undefined,playerB:Player|undefined,settings:AppSettings,side?:ResolvedMatch['side']){
 if(settings.raceChartMode==='off' || !playerA || !playerB)return null;
 if(settings.raceChartMode==='side-race')return `Race to ${Math.max(1,sideRaceTarget(side??'upper',settings))}`;
 if(settings.raceChartMode==='skill-handicap'){
  const targets=skillHandicapRace(playerA,playerB,settings,side??'upper');
  return targets?`Race ${targets[0]}/${targets[1]}`:null;
 }
 const chart=settings.raceChartMode==='custom'?settings.customRaceChart:eightBallSinglesRaceChart;
 const a=normalizedSkillLevel(playerA.skillLevel);
 const b=normalizedSkillLevel(playerB.skillLevel);
 const race=chart[`${a}-${b}`];
 return race?`Race ${race}`:null;
}

function raceTargets(playerA:Player|undefined,playerB:Player|undefined,settings:AppSettings,tournament:Tournament,side?:ResolvedMatch['side']){
 const label=raceForPlayers(playerA,playerB,settings,side);
 const fallback=Math.max(1,tournament.settings.raceTo??2);
 if(!label)return null;
 if(settings.raceChartMode==='side-race'){
  const target=Math.max(1,sideRaceTarget(side??'upper',settings));
  return {label,targets:[target,target] as const};
 }
 if(settings.raceChartMode==='skill-handicap'){
  const targets=skillHandicapRace(playerA,playerB,settings,side??'upper');
  return targets?{label,targets}:null;
 }
 const match=label.match(/(\d+)\s*\/\s*(\d+)/);
 if(!match)return {label,targets:[fallback,fallback] as const};
 return {label,targets:[Number(match[1]),Number(match[2])] as const};
}

function shouldShowSkillLevels(settings:AppSettings){
 return settings.raceChartMode==='skill-handicap'||(settings.raceChartMode==='custom'&&settings.skillLevelsEnabled);
}

function raceSettingsSnapshot(settings:AppSettings){
 return {
  raceChartMode:settings.raceChartMode,
  skillLevelsEnabled:settings.skillLevelsEnabled,
  customRaceChart:settings.customRaceChart,
  sideRaceTargets:settings.sideRaceTargets,
  skillHandicapTargets:settings.skillHandicapTargets
 };
}

function sameRaceSettings(tournament:Tournament,settings:AppSettings){
 const snapshot=raceSettingsSnapshot(settings);
 return tournament.settings.raceChartMode===snapshot.raceChartMode
  && tournament.settings.skillLevelsEnabled===snapshot.skillLevelsEnabled
  && JSON.stringify(tournament.settings.customRaceChart??{})===JSON.stringify(snapshot.customRaceChart)
  && JSON.stringify(tournament.settings.sideRaceTargets??{})===JSON.stringify(snapshot.sideRaceTargets)
  && JSON.stringify(tournament.settings.skillHandicapTargets??{})===JSON.stringify(snapshot.skillHandicapTargets);
}

function effectiveRaceSettings(tournament:Tournament,settings:AppSettings):AppSettings{
 return {
  ...settings,
  raceChartMode:tournament.settings.raceChartMode??settings.raceChartMode,
  skillLevelsEnabled:tournament.settings.skillLevelsEnabled??settings.skillLevelsEnabled,
  customRaceChart:tournament.settings.customRaceChart??settings.customRaceChart,
  sideRaceTargets:tournament.settings.sideRaceTargets??settings.sideRaceTargets,
  skillHandicapTargets:tournament.settings.skillHandicapTargets??settings.skillHandicapTargets
 };
}

const payoutPlaces=['Winner','2nd','3rd','4th','5th','6th','7th','8th'];

function syncStatusText(status:SyncStatus){
 if(status==='connected')return 'Online';
 if(status==='connecting')return 'Connecting';
 if(status==='offline')return 'Offline';
 return 'Not configured';
}

function syncStatusColor(status:SyncStatus,light:boolean){
 if(status==='connected')return light?'#17650f':theme.green;
 if(status==='connecting')return '#e0aa45';
 return light?'#8b1e1e':'#e95050';
}

function publicViewerUrl(tournament:Tournament){
 const base=syncUrl().replace(/^wss:/,'https:').replace(/^ws:/,'http:').replace(/\/$/,'');
 if(!base)return '';
 return `${base}/view/${encodeURIComponent(tournament.id)}?join=${encodeURIComponent(tournament.settings.joinToken??'')}`;
}

function dateTimeText(value:string|undefined){
 if(!value)return 'Not recorded';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?value:date.toLocaleString();
}

function payoutRows(t:Tournament):PayoutRow[]{
 return payoutPlaces.map(place=>t.payouts?.find(row=>row.place===place)??{place,player:'',amount:''});
}

function tournamentChampionPlayer(tournament:Tournament,matches:readonly ResolvedMatch[]){
 const finalWinners=matches.filter(match=>match.side==='final'&&match.winnerId);
 const lastFinal=finalWinners[finalWinners.length-1];
 const completed=matches.filter(match=>match.winnerId);
 const lastWinnerId=lastFinal?.winnerId??completed[completed.length-1]?.winnerId;
 return tournament.players.find(player=>player.id===lastWinnerId)??null;
}

function scoreFor(scores:readonly MatchScore[]|undefined,matchId:string){
 return scores?.find(score=>score.matchId===matchId)?.scores??{};
}

function withScoreDelta(scores:readonly MatchScore[]|undefined,matchId:string,playerId:string,delta:number){
 const existing=scoreFor(scores,matchId);
 const nextScore={...existing,[playerId]:Math.max(0,(existing[playerId]??0)+delta)};
 const next:MatchScore={matchId,scores:nextScore,updatedAt:new Date().toISOString()};
 return [...(scores??[]).filter(score=>score.matchId!==matchId),next];
}

function withPoint(scores:readonly MatchScore[]|undefined,matchId:string,playerId:string){
 return withScoreDelta(scores,matchId,playerId,1);
}

function clamp(value:number,min:number,max:number){
 return Math.max(min,Math.min(max,value));
}

function touchDistance(event:GestureResponderEvent){
 const [first,second]=event.nativeEvent.touches;
 if(!first||!second)return 0;
 const dx=first.pageX-second.pageX;
 const dy=first.pageY-second.pageY;
 return Math.sqrt(dx*dx+dy*dy);
}

function canvasSize(type:BracketType,castMode:boolean){
 if(type==='16-single') return {width:580,height:620};
 if(type==='32-single') return {width:680,height:1160};
 if(type==='16-double') return {width:860,height:castMode?860:980};
 if(type==='32-double') return {width:1080,height:castMode?1480:1590};
 return {width:1300,height:castMode?620:760};
}

export default function TournamentScreen(){
 const {id,role,joinToken}=useLocalSearchParams<{id:string;role?:string;joinToken?:string}>();
 const participantMode=role==='participant';
 const {width:viewportWidth,height:viewportHeight}=useWindowDimensions();
 const insets=useSafeAreaInsets();
 const {items,get,update,syncFromRemote,addHistory}=useTournaments();
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const found=get(id);
 const t=found?normalize(found):undefined;
 const raceSettings=t?effectiveRaceSettings(t,settings):settings;
 const syncJoinToken=participantMode?joinToken:t?.settings.joinToken;
 const syncRef=useRef<ReturnType<typeof openTournamentSync>|null>(null);
 const [syncStatus,setSyncStatus]=useState<SyncStatus>(realtimeConfigured()?'connecting':'unconfigured');
 const [playersOpen,setPlayersOpen]=useState(false);
 const [directorToolsOpen,setDirectorToolsOpen]=useState(false);
 const [payoutOpen,setPayoutOpen]=useState(false);
 const [scoresOpen,setScoresOpen]=useState(false);
 const [skillsOpen,setSkillsOpen]=useState(false);
 const [qrOpen,setQrOpen]=useState(false);
 const [startOpen,setStartOpen]=useState(false);
 const [startBlocker,setStartBlocker]=useState<string|null>(null);
 const [endOpen,setEndOpen]=useState(false);
 const [championConfirmOpen,setChampionConfirmOpen]=useState(false);
 const [dismissedChampionId,setDismissedChampionId]=useState<string|null>(null);
 const [castMode,setCastMode]=useState(false);
 const [castPickerOpen,setCastPickerOpen]=useState(false);
 const [castStatus,setCastStatus]=useState('Search for a compatible TV or casting device, or use this screen for screen mirroring.');
 const [playerName,setPlayerName]=useState('');
 const [playerSkill,setPlayerSkill]=useState(2);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [targetByeSeed,setTargetByeSeed]=useState<number|null>(null);
 const [winnerMatchId,setWinnerMatchId]=useState<string|null>(null);
 const [winnerPickId,setWinnerPickId]=useState<string|null>(null);
 const [pendingPoint,setPendingPoint]=useState<{matchId:string;playerId:string}|null>(null);
 const [draftTitle,setDraftTitle]=useState(t?.name??'');
 const [directorPin,setDirectorPin]=useState(t?.settings.directorPinHash??'');
 const [directorPinConfirm,setDirectorPinConfirm]=useState(t?.settings.directorPinHash??'');
 const [zoom,setZoom]=useState(1);
 const [pinching,setPinching]=useState(false);
 const pinchStartDistance=useRef(0);
 const pinchStartZoom=useRef(1);
 const resolved=useMemo(()=>t?resolveBracket(t.players,t.results,t.bracketType):[],[t]);
 const ready=useMemo(()=>t?nextReadyMatches(t.players,t.results,t.bracketType):[],[t]);
 const champion=useMemo(()=>t?tournamentChampionPlayer(t,resolved):null,[t,resolved]);
 useEffect(()=>{
  if(!id)return;
  syncRef.current?.close();
  syncRef.current=openTournamentSync(id,tournament=>syncFromRemote(tournament),setSyncStatus,syncJoinToken);
  return ()=>syncRef.current?.close();
 },[id,syncFromRemote,syncJoinToken]);
 useEffect(()=>{
  if(found&&!found.settings.joinToken&&t) update(t);
 },[found,t,update]);
 useEffect(()=>{
  if(!t||participantMode||sameRaceSettings(t,settings))return;
  const stamped={...t,settings:{...t.settings,...raceSettingsSnapshot(settings)},updatedAt:new Date().toISOString()};
  update(stamped);
  if(syncStatus==='connected')syncRef.current?.publish(stamped);
 },[t?.id,t?.updatedAt,t?.settings.raceChartMode,t?.settings.skillLevelsEnabled,t?.settings.customRaceChart,t?.settings.sideRaceTargets,t?.settings.skillHandicapTargets,participantMode,settings.raceChartMode,settings.skillLevelsEnabled,settings.customRaceChart,settings.sideRaceTargets,settings.skillHandicapTargets,syncStatus,update]);
 useEffect(()=>{
  if(!t||participantMode||syncStatus!=='connected')return;
  syncRef.current?.publish({...t,settings:{...t.settings,...raceSettingsSnapshot(settings)}});
 },[t?.id,t?.updatedAt,participantMode,syncStatus,settings.raceChartMode,settings.skillLevelsEnabled,settings.customRaceChart,settings.sideRaceTargets,settings.skillHandicapTargets]);
 useEffect(()=>{
  if(!t||participantMode||t.status==='complete'||!champion)return;
  if(t.settings.confirmedWinnerId===champion.id||dismissedChampionId===champion.id)return;
  setChampionConfirmOpen(true);
 },[t?.id,t?.status,t?.updatedAt,participantMode,champion?.id,t?.settings.confirmedWinnerId,dismissedChampionId]);
 if(!t)return <View style={[s.page,{backgroundColor:colors.bg}]}><Text style={[s.title,{color:colors.text}]}>{realtimeConfigured()?'Joining tournament...':'Tournament not found'}</Text><Text style={[s.muted,{color:colors.muted}]}>{realtimeConfigured()?`Sync status: ${syncStatus}`:'Realtime sync is not configured on this build.'}</Text><Button title="Home" onPress={()=>router.replace('/')}/></View>;
 const reconnectSync=()=>{
  setSyncStatus(realtimeConfigured()?'connecting':'unconfigured');
  syncRef.current?.reconnect();
 };
 const save=(next:Tournament)=>{
  const raced=participantMode?next:{...next,settings:{...next.settings,...raceSettingsSnapshot(settings)}};
  const stamped={...raced,updatedAt:new Date().toISOString()};
  update(stamped);
  syncRef.current?.publish(stamped);
 };
 const selected=t.players.find(player=>player.id===selectedId);
 const openPlayers=(seed?:number)=>{
 setDraftTitle(titleIsValid(t.name)?t.name:'');
  setDirectorPin(t.settings.directorPinHash??'');
  setDirectorPinConfirm(t.settings.directorPinHash??'');
  setSelectedId(null);
  setPlayerName('');
  setPlayerSkill(2);
  setTargetByeSeed(seed??null);
  setPlayersOpen(true);
 };
 const addPlayer=()=>{
  const name=playerName.trim();
  if(!name)return;
  if(t.players.some(player=>player.name.trim().toLowerCase()===name.toLowerCase())){Alert.alert('Name already added','Each player name must be different before it can be added.');return;}
  const openSeed=targetByeSeed??Array.from({length:t.capacity},(_,i)=>i+1).find(seed=>!t.players.some(player=>player.seed===seed));
  if(!openSeed){Alert.alert('Bracket full','Remove or change a player before adding another.');return;}
  if(t.players.some(player=>player.seed===openSeed)){Alert.alert('Bracket spot filled','That bracket spot already has a player.');return;}
  save({...t,name:draftTitle.trim()||t.name,players:[...t.players,{id:newId(),name,skillLevel:playerSkill,seed:openSeed,paid:false}].sort((a,b)=>a.seed-b.seed)});
  setPlayerName('');
  setPlayerSkill(2);
  setTargetByeSeed(null);
 };
 const removePlayer=()=>{
  if(!selected)return;
  save({...t,players:t.players.filter(player=>player.id!==selected.id).map((player,index)=>({...player,seed:index+1})),results:[],scores:[]});
  setSelectedId(null);
  setPlayerName('');
  setPlayerSkill(2);
 };
 const changePlayer=()=>{
  if(!selected || !playerName.trim())return;
  const name=playerName.trim();
  if(t.players.some(player=>player.id!==selected.id&&player.name.trim().toLowerCase()===name.toLowerCase())){Alert.alert('Name already added','Each player name must be different before it can be used.');return;}
  save({...t,name:draftTitle.trim()||t.name,players:t.players.map(player=>player.id===selected.id?{...player,name,skillLevel:playerSkill}:player)});
  setPlayerName('');
 };
 const confirmPlayers=()=>{
  if(!titleIsValid(draftTitle)){Alert.alert('Tournament title required','Enter a tournament title before continuing.');return;}
  if(t.status!=='active'&&!pinIsValid(directorPin)){Alert.alert('Director PIN required','Enter a four digit tournament director PIN before continuing.');return;}
  if(t.status!=='active'&&!pinsMatch(directorPin,directorPinConfirm)){Alert.alert('Director PIN does not match','Re-enter the same four digit PIN to confirm it.');return;}
  const duplicates=duplicatePlayerNames(t.players);
  if(duplicates.length){Alert.alert('Duplicate player names',`Fix duplicate names before continuing: ${duplicates.join(', ')}`);return;}
  save({...t,name:draftTitle.trim(),settings:{...t.settings,directorPinHash:t.status==='active'?t.settings.directorPinHash??'':directorPin}});
  setTargetByeSeed(null);
  setPlayersOpen(false);
 };
 const startTournament=()=>{
  const otherRunning=items.find(item=>item.id!==t.id&&item.status==='active');
  if(otherRunning){setStartBlocker(`End "${otherRunning.name}" before starting another tournament.`);return;}
  const duplicates=duplicatePlayerNames(t.players);
  const blockers=[
   ...(!titleIsValid(t.name)?['Enter a tournament title.']:[]),
   ...(!pinIsValid(t.settings.directorPinHash)?['Enter a four digit tournament director PIN.']:[]),
   ...(duplicates.length?[`Fix duplicate player names: ${duplicates.join(', ')}.`]:[])
  ];
  if(blockers.length){openPlayers();setStartBlocker(blockers.join('\n'));return;}
  if(t.status==='active'&&t.results.length>0){setStartBlocker('This tournament already has completed matches. Use the minus button on a match if something needs to be corrected.');return;}
  setStartOpen(true);
 };
 const confirmStart=(randomize:boolean)=>{
  save({...t,status:'active',players:randomize?shuffle(t.players).map((player,index)=>({...player,seed:index+1})):t.players,results:t.results.length?t.results:[],scores:t.scores??[]});
  setStartOpen(false);
 };
 const chooseWinner=(match:ResolvedMatch)=>{
  if(participantMode&&t.status!=='active'){Alert.alert('Tournament not started','The tournament director must press Start before joined devices can report winners or scores.');return;}
  if(participantMode&&settings.participantPermission==='view-only'){Alert.alert('View only','This device can view the bracket but cannot report winners.');return;}
  if(participantMode&&match.complete){Alert.alert('Match complete','Only the tournament director can correct a completed match.');return;}
  if(participantMode&&!match.ready)return;
  if(!participantMode&&!match.ready&&!match.complete)return;
  setWinnerMatchId(match.id);
  setWinnerPickId(match.winnerId??match.playerIds.find(Boolean)??null);
 };
 const winnerMatch=resolved.find(match=>match.id===winnerMatchId);
const confirmWinner=()=>{
 if(!winnerMatch || !winnerPickId)return;
 if(participantMode&&(!winnerMatch.ready||winnerMatch.complete))return;
 if(participantMode&&t.status!=='active'){Alert.alert('Tournament not started','The tournament director must press Start before joined devices can report winners.');return;}
 const playerA=t.players.find(player=>player.id===winnerMatch.playerIds[0]);
 const playerB=t.players.find(player=>player.id===winnerMatch.playerIds[1]);
 const race=raceTargets(playerA,playerB,raceSettings,t,winnerMatch.side);
 if(race){
  const winnerIndex=winnerMatch.playerIds[0]===winnerPickId?0:1;
  const winnerScore=scoreFor(t.scores,winnerMatch.id)[winnerPickId]??0;
  const target=race.targets[winnerIndex]??race.targets[0];
  if(winnerScore<target){Alert.alert('Race score required',`The selected winner must reach ${target} points before moving on.`);return;}
 }
 const baseResults=winnerMatch.complete?removeResultAndDependents(t.results,winnerMatch.id,t.bracketType):t.results;
 save({...t,status:'active',results:recordWinner(baseResults,winnerMatch.id,winnerPickId)});
  setWinnerMatchId(null);
  setWinnerPickId(null);
 };
 const requestPoint=(matchId:string,playerId:string)=>{
  const match=resolved.find(item=>item.id===matchId);
  if(participantMode&&t.status!=='active'){Alert.alert('Tournament not started','The tournament director must press Start before joined devices can change scores.');return;}
  if(participantMode&&settings.participantPermission==='view-only'){Alert.alert('View only','This device can view the bracket but cannot change scores.');return;}
  if(!match||!match.ready||match.complete)return;
  const playerA=t.players.find(player=>player.id===match.playerIds[0]);
  const playerB=t.players.find(player=>player.id===match.playerIds[1]);
  if(!raceTargets(playerA,playerB,raceSettings,t,match.side))return;
  setPendingPoint({matchId,playerId});
 };
 const confirmPoint=()=>{
  if(!pendingPoint)return;
  const match=resolved.find(item=>item.id===pendingPoint.matchId);
  if(!match || match.complete){setPendingPoint(null);return;}
  const playerA=t.players.find(player=>player.id===match.playerIds[0]);
  const playerB=t.players.find(player=>player.id===match.playerIds[1]);
 const race=raceTargets(playerA,playerB,raceSettings,t,match.side);
 if(!race){setPendingPoint(null);return;}
 const nextScores=withPoint(t.scores,match.id,pendingPoint.playerId);
 save({...t,status:'active',scores:nextScores});
 setPendingPoint(null);
};
 const changeScore=(matchId:string,playerId:string,delta:number)=>{
  if(participantMode)return;
  const match=resolved.find(item=>item.id===matchId);
  if(!match)return;
  const playerA=t.players.find(player=>player.id===match.playerIds[0]);
  const playerB=t.players.find(player=>player.id===match.playerIds[1]);
 const race=raceTargets(playerA,playerB,raceSettings,t,match.side);
 if(!race)return;
 const nextScores=withScoreDelta(t.scores,matchId,playerId,delta);
 save({...t,status:'active',scores:nextScores});
};
 const editMatch=(match:ResolvedMatch)=>{
  chooseWinner(match);
 };
 const confirmTournamentChampion=()=>{
  if(!champion)return;
  save({...t,settings:{...t.settings,confirmedWinnerId:champion.id,confirmedWinnerName:champion.name,confirmedWinnerAt:new Date().toISOString()}});
  setChampionConfirmOpen(false);
  setDismissedChampionId(null);
 };
 const closeChampionConfirm=()=>{
  setDismissedChampionId(champion?.id??null);
  setChampionConfirmOpen(false);
 };
 const endTournament=()=>setEndOpen(true);
 const sharePublicViewer=async()=>{
  const link=publicViewerUrl(t);
  await Share.share({title:'View Tournament Bracket',message:link || 'Public viewer link is unavailable until live sync is configured.'});
 };
 const confirmEndTournament=()=>{
  if(champion&&t.settings.confirmedWinnerId!==champion.id){
   setEndOpen(false);
   setChampionConfirmOpen(true);
   return;
  }
  const winnerName=t.settings.confirmedWinnerName??champion?.name??'';
  if(winnerName) addHistory({id:newId(),tournamentId:t.id,tournamentName:t.name,winnerName,type:t.settings.historyType??'singles',date:new Date().toISOString(),bracketType:t.bracketType,playerCount:t.players.length,confirmedAt:t.settings.confirmedWinnerAt});
  save({...t,status:'complete'});
  setEndOpen(false);
  router.replace('/');
 };
 const openCastPicker=()=>{
  setCastStatus('Search for a compatible TV or casting device, or use this screen for screen mirroring.');
  setCastPickerOpen(true);
 };
 const startCast=()=>{
  setCastPickerOpen(false);
  setCastMode(true);
  const doc=globalThis.document as (Document&{documentElement:{requestFullscreen?:()=>Promise<void>}})|undefined;
  void doc?.documentElement?.requestFullscreen?.().catch(()=>{});
 };
 const searchCastDevices=async()=>{
  type PresentationConnection={close?:()=>void};
  type PresentationRequest={start:()=>Promise<PresentationConnection>};
  type PresentationRequestCtor=new(urls:string[])=>PresentationRequest;
  const browser=globalThis as typeof globalThis&{PresentationRequest?:PresentationRequestCtor;location?:{href:string}};
  if(!browser.PresentationRequest){
   setCastStatus('This device/browser cannot list cast devices from inside the app. Use this screen with screen mirroring, or build with native Chromecast/Roku support for a full device list.');
   return;
  }
  try{
   setCastStatus('Searching for compatible displays...');
   const request=new browser.PresentationRequest([browser.location?.href??'']);
   await request.start();
   setCastPickerOpen(false);
   setCastMode(true);
  }catch(error){
   setCastStatus(error instanceof Error && error.name==='NotFoundError'?'No compatible cast device was selected. Try again or use this screen.':'Casting was cancelled or unavailable. Try again or use this screen.');
  }
 };
 const exitCast=()=>{
  setCastMode(false);
  const doc=globalThis.document as (Document&{exitFullscreen?:()=>Promise<void>;fullscreenElement?:Element|null})|undefined;
  if(doc?.fullscreenElement) void doc.exitFullscreen?.().catch(()=>{});
 };
 const updatePayout=(place:string,field:'player'|'amount',value:string)=>{
  const rows=payoutRows(t).map(row=>row.place===place?{...row,[field]:value}:row);
  save({...t,payouts:rows});
 };
 const canvasBounds=canvasSize(t.bracketType,false);
 const castFitZoom=castMode?clamp(Math.min((viewportWidth-24)/canvasBounds.width,(viewportHeight-24)/canvasBounds.height),0.25,1):zoom;
 const displayZoom=castMode?castFitZoom:zoom;
 const scaledCanvas={width:canvasBounds.width*displayZoom,height:canvasBounds.height*displayZoom};
 const pinchHandlers={
  onStartShouldSetResponder:(event:GestureResponderEvent)=>event.nativeEvent.touches.length>=2,
  onMoveShouldSetResponder:(event:GestureResponderEvent)=>event.nativeEvent.touches.length>=2,
  onResponderGrant:(event:GestureResponderEvent)=>{
   const distance=touchDistance(event);
   if(distance>0){
    setPinching(true);
    pinchStartDistance.current=distance;
    pinchStartZoom.current=zoom;
   }
  },
 onResponderMove:(event:GestureResponderEvent)=>{
   const distance=touchDistance(event);
   if(distance>0&&pinchStartDistance.current>0){
    setZoom(clamp(pinchStartZoom.current*(distance/pinchStartDistance.current),0.45,2.5));
   }
  },
  onResponderRelease:()=>{pinchStartDistance.current=0;setPinching(false);},
  onResponderEnd:()=>{pinchStartDistance.current=0;setPinching(false);},
  onResponderTerminate:()=>{pinchStartDistance.current=0;setPinching(false);}
 };
 const bracketViewport={minWidth:viewportWidth,minHeight:Math.max(320,viewportHeight-(castMode?0:44))};
 const bracketScrollContent={
  minWidth:Math.max(bracketViewport.minWidth,scaledCanvas.width+48),
  minHeight:Math.max(bracketViewport.minHeight,scaledCanvas.height+96)
 };
 return <View style={[s.page,{backgroundColor:colors.bg}]}>
  {!castMode&&<View style={[s.toolbar,{paddingTop:insets.top+10}]}>
   <Button title="⌂" variant="secondary" onPress={()=>router.replace('/')} style={s.toolbarButton} textStyle={s.toolbarIconText}/>
   {!participantMode&&<Button title="♙" variant="secondary" onPress={()=>openPlayers()} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="▶" onPress={startTournament} disabled={t.status==='complete'} style={[s.toolbarButton,s.toolbarPrimaryButton]} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="▣" variant="secondary" onPress={()=>save(t)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="$" variant="secondary" onPress={()=>setPayoutOpen(true)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="⚙" variant="secondary" onPress={()=>setDirectorToolsOpen(true)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   <Button title="#" variant="secondary" onPress={()=>setScoresOpen(true)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>
   <Button title="★" variant="secondary" onPress={()=>setSkillsOpen(true)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>
   {!participantMode&&<Button title="▦" variant="secondary" onPress={()=>setQrOpen(true)} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="⛶" variant="secondary" onPress={openCastPicker} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
   {!participantMode&&<Button title="×" variant="danger" onPress={endTournament} style={[s.toolbarButton,s.toolbarDangerButton]} textStyle={s.toolbarIconText}/>}
   {participantMode&&<Text style={s.participantBadge}>Participant mode</Text>}
   <Text style={[s.syncBadge,{color:syncStatusColor(syncStatus,settings.appearance==='light')}]}>Sync: {syncStatusText(syncStatus)}</Text>
   {syncStatus!=='connected'&&syncStatus!=='unconfigured'&&<Button title="↻" variant="secondary" onPress={reconnectSync} style={s.toolbarButton} textStyle={s.toolbarIconText}/>}
  </View>}
  {!castMode&&syncStatus!=='connected'&&<SyncRecoveryBanner status={syncStatus} reconnect={reconnectSync}/>}
  <ScrollView style={s.scroller} contentContainerStyle={[bracketScrollContent,s.bracketViewport,castMode&&s.castViewport]} scrollEnabled={!pinching&&!castMode} nestedScrollEnabled directionalLockEnabled centerContent>
   <ScrollView horizontal style={s.horizontalScroll} scrollEnabled={!pinching&&!castMode} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator contentContainerStyle={[s.horizontalScroller,bracketScrollContent,castMode&&s.castViewport]}>
   <View {...pinchHandlers} style={[s.zoomSurface,scaledCanvas]}>
   <View style={[s.canvas,t.bracketType==='16-single'&&s.single16Canvas,t.bracketType==='32-single'&&s.single32Canvas,t.bracketType==='16-double'&&s.doubleCanvas,t.bracketType==='32-double'&&s.double32Canvas,castMode&&s.castCanvas,{transform:[{translateX:canvasBounds.width*(displayZoom-1)/2},{translateY:canvasBounds.height*(displayZoom-1)/2},{scale:displayZoom}]}]}>
    {!castMode&&<Image source={require('../../assets/dees-place-logo.png')} resizeMode="contain" style={s.bracketLogo}/>}
    {!castMode&&<View style={s.infoPanel}>
     <InfoRow label="Title:" value={titleIsValid(t.name)?t.name:'Title Required'}/>
     <InfoRow label="Players:" value={`${t.players.length}`}/>
     <InfoRow label="Bracket:" value={labelForBracket(t.bracketType)}/>
     {settings.tableLabels&&<InfoRow label="Location Desc:" value="Table"/>}
    </View>}
    {!castMode&&<View style={s.statusPanel}><Text style={s.statusText}>{t.status==='active'?'Tournament Started':t.status==='complete'?'Tournament Complete':'Tourney Not Started'}</Text></View>}
    {!castMode&&<View style={s.readyPanel}><Text style={s.statusText}>Playable Matches:</Text><Text style={s.readyCount}>{ready.length}</Text></View>}
  <BracketCanvas tournament={t} matches={resolved} readyIds={new Set(ready.map(match=>match.id))} onWinner={chooseWinner} onEdit={participantMode?()=>{}:editMatch} onBye={seed=>openPlayers(seed)} director={!participantMode} readyColor={settings.readyMatchColor} playerDisplay={settings.playerDisplay} settings={raceSettings} presentation={castMode}/>
   </View>
   </View>
   </ScrollView>
  </ScrollView>
  <PlayerModal visible={playersOpen} tournament={t} raceSettings={raceSettings} draftTitle={draftTitle} setDraftTitle={setDraftTitle} directorPin={directorPin} setDirectorPin={setDirectorPin} directorPinConfirm={directorPinConfirm} setDirectorPinConfirm={setDirectorPinConfirm} playerName={playerName} setPlayerName={setPlayerName} playerSkill={playerSkill} setPlayerSkill={setPlayerSkill} selectedId={selectedId} setSelectedId={setSelectedId} targetByeSeed={targetByeSeed} addPlayer={addPlayer} removePlayer={removePlayer} changePlayer={changePlayer} confirmPlayers={confirmPlayers} close={()=>{setTargetByeSeed(null);setPlayersOpen(false);}}/>
  <StartModal visible={startOpen} defaultMode={settings.randomizeDefault} confirm={confirmStart} close={()=>setStartOpen(false)}/>
  <NoticeModal visible={!!startBlocker} title="Tournament cannot start" message={startBlocker??''} close={()=>setStartBlocker(null)}/>
  <EndTournamentModal visible={endOpen} confirm={confirmEndTournament} close={()=>setEndOpen(false)}/>
  {!participantMode&&<ChampionConfirmModal visible={championConfirmOpen} championName={champion?.name??''} confirm={confirmTournamentChampion} close={closeChampionConfirm}/>}
  {!participantMode&&<DirectorToolsModal visible={directorToolsOpen} tournament={t} syncStatus={syncStatus} championName={champion?.name??''} reconnect={reconnectSync} openQr={()=>{setDirectorToolsOpen(false);setQrOpen(true);}} openPayout={()=>{setDirectorToolsOpen(false);setPayoutOpen(true);}} openCast={()=>{setDirectorToolsOpen(false);openCastPicker();}} endTournament={()=>{setDirectorToolsOpen(false);endTournament();}} sharePublicViewer={sharePublicViewer} close={()=>setDirectorToolsOpen(false)}/>}
  <PayoutModal visible={payoutOpen} rows={payoutRows(t)} onChange={updatePayout} close={()=>setPayoutOpen(false)}/>
  <ScoresModal visible={scoresOpen} tournament={t} matches={resolved} settings={raceSettings} close={()=>setScoresOpen(false)}/>
  <SkillLevelsModal visible={skillsOpen} tournament={t} close={()=>setSkillsOpen(false)}/>
  <CastDeviceModal visible={castPickerOpen} status={castStatus} search={searchCastDevices} useThisScreen={startCast} close={()=>setCastPickerOpen(false)}/>
  <WinnerModal visible={!!winnerMatch} match={winnerMatch} players={t.players} selectedId={winnerPickId} setSelectedId={setWinnerPickId} race={winnerMatch?raceTargets(t.players.find(player=>player.id===winnerMatch.playerIds[0]),t.players.find(player=>player.id===winnerMatch.playerIds[1]),raceSettings,t,winnerMatch.side):null} scores={winnerMatch?scoreFor(t.scores,winnerMatch.id):{}} director={!participantMode} onPoint={requestPoint} onScoreChange={changeScore} confirm={confirmWinner} close={()=>{setWinnerMatchId(null);setWinnerPickId(null);}}/>
  <ConfirmPointModal visible={!!pendingPoint} player={t.players.find(player=>player.id===pendingPoint?.playerId)} confirm={confirmPoint} close={()=>setPendingPoint(null)}/>
  <Modal transparent visible={qrOpen} animationType="fade" onRequestClose={()=>setQrOpen(false)}>
   <QrModal tournament={t} syncStatus={syncStatus} reconnect={reconnectSync} sharePublicViewer={sharePublicViewer} close={()=>setQrOpen(false)}/>
  </Modal>
 </View>;
}

function InfoRow({label,value}:{label:string;value:string}){return <View style={s.infoRow}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value}</Text></View>;}

function PlayerModal({visible,tournament,raceSettings,draftTitle,setDraftTitle,directorPin,setDirectorPin,directorPinConfirm,setDirectorPinConfirm,playerName,setPlayerName,playerSkill,setPlayerSkill,selectedId,setSelectedId,targetByeSeed,addPlayer,removePlayer,changePlayer,confirmPlayers,close}:{visible:boolean;tournament:Tournament;raceSettings:AppSettings;draftTitle:string;setDraftTitle:(v:string)=>void;directorPin:string;setDirectorPin:(v:string)=>void;directorPinConfirm:string;setDirectorPinConfirm:(v:string)=>void;playerName:string;setPlayerName:(v:string)=>void;playerSkill:number;setPlayerSkill:(v:number)=>void;selectedId:string|null;setSelectedId:(v:string|null)=>void;targetByeSeed:number|null;addPlayer:()=>void;removePlayer:()=>void;changePlayer:()=>void;confirmPlayers:()=>void;close:()=>void}){
 const duplicates=duplicatePlayerNames(tournament.players);
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const showSkillLevels=shouldShowSkillLevels(raceSettings);
 const canEditPin=tournament.status!=='active';
 const setPin=(value:string)=>setDirectorPin(value.replace(/\D/g,'').slice(0,4));
 const setPinConfirm=(value:string)=>setDirectorPinConfirm(value.replace(/\D/g,'').slice(0,4));
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}><View style={[s.playerWindow,{backgroundColor:colors.panel,borderColor:colors.border}]}>
   <View style={s.modalTitleBar}><Text style={s.modalTitle}>Players</Text><Pressable onPress={close}><Text style={s.close}>x</Text></Pressable></View>
   <View style={s.playerBody}>
    <View style={s.playerHeader}><Text style={s.statusPill}>{tournament.status==='active'?'Tournament Started':'Tournament Not Started'}</Text><Text style={[s.count,{color:colors.text}]}>Player Count: {tournament.players.length} / {tournament.capacity}</Text></View>
    <Text style={[s.label,{color:colors.text}]}>Tournament Title *</Text><TextInput value={draftTitle} onChangeText={setDraftTitle} placeholder="Enter tournament title" placeholderTextColor="#777" style={[s.whiteInput,{backgroundColor:colors.input,color:colors.inputText},!titleIsValid(draftTitle)&&s.requiredInput]}/>
    {!titleIsValid(draftTitle)&&<Text style={s.validationText}>Tournament title is required before continuing.</Text>}
    <Text style={[s.label,{color:colors.text}]}>Tournament Director PIN *</Text><TextInput value={directorPin} onChangeText={setPin} editable={canEditPin} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="4 digits" placeholderTextColor="#777" style={[s.whiteInput,{backgroundColor:canEditPin?colors.input:colors.panel2,color:colors.inputText},!pinIsValid(directorPin)&&tournament.status!=='active'&&s.requiredInput]}/>
    <Text style={[s.label,{color:colors.text}]}>Confirm Director PIN *</Text><TextInput value={directorPinConfirm} onChangeText={setPinConfirm} editable={canEditPin} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="Re-enter 4 digits" placeholderTextColor="#777" style={[s.whiteInput,{backgroundColor:canEditPin?colors.input:colors.panel2,color:colors.inputText},directorPinConfirm.length>0&&!pinsMatch(directorPin,directorPinConfirm)&&tournament.status!=='active'&&s.requiredInput]}/>
    {!pinIsValid(directorPin)&&tournament.status!=='active'&&<Text style={s.validationText}>A four digit director PIN is required before the tournament can start.</Text>}
    {pinIsValid(directorPin)&&!pinsMatch(directorPin,directorPinConfirm)&&tournament.status!=='active'&&<Text style={s.validationText}>The confirmation PIN must match the director PIN.</Text>}
    {tournament.status==='active'&&<Text style={s.validationText}>Director PIN is locked while the tournament is running.</Text>}
    {duplicates.length>0&&<Text style={s.validationText}>Duplicate names must be fixed: {duplicates.join(', ')}</Text>}
    {targetByeSeed&&<Text style={s.byeNotice}>Adding late player to Bye spot #{targetByeSeed}</Text>}
    <View style={s.playerGrid}>
      <View style={s.playerControls}>
      <View style={s.nameHeader}><Text style={[s.label,{color:colors.text}]}>Player Name</Text><Text style={[s.inlineCount,{color:colors.text}]}>{tournament.players.length} entered</Text></View><TextInput value={playerName} onChangeText={setPlayerName} style={[s.whiteInput,{backgroundColor:colors.input,color:colors.inputText}]}/>
      {showSkillLevels&&<><Text style={[s.label,{color:colors.text}]}>Skill Level</Text>
      <View style={s.skillButtons}>{skillLevels.map(level=><Pressable key={level} onPress={()=>setPlayerSkill(level)} style={[s.skillButton,playerSkill===level&&s.skillSelected]}><Text style={[s.skillText,playerSkill===level&&s.skillSelectedText]}>{level}</Text></Pressable>)}</View></>}
      <View style={s.smallButtons}><Button title="Add" variant="secondary" onPress={addPlayer}/><Button title="Remove" variant="secondary" onPress={removePlayer} disabled={!selectedId}/><Button title="Change" variant="secondary" onPress={changePlayer} disabled={!selectedId}/></View>
      <Text style={[s.label,{color:colors.text}]}>Bracket Type</Text><Text style={[s.selectBox,{backgroundColor:colors.input,color:colors.inputText}]}>{labelForBracket(tournament.bracketType)}</Text>
     </View>
     <ScrollView style={s.playerList}>{tournament.players.map(player=><Pressable key={player.id} onPress={()=>{setSelectedId(player.id);setPlayerName(player.name);setPlayerSkill(normalizedSkillLevel(player.skillLevel));}} style={[s.playerOption,selectedId===player.id&&s.playerSelected]}><Text style={s.playerOptionText}>{player.seed}. {player.name}{showSkillLevels?` - SL ${normalizedSkillLevel(player.skillLevel)}`:''}</Text></Pressable>)}</ScrollView>
    </View>
    <View style={s.modalActions}><Button title="Confirm" onPress={confirmPlayers}/><Button title="Close" variant="secondary" onPress={close}/></View>
   </View>
  </View></View>
 </Modal>;
}

function StartModal({visible,defaultMode,confirm,close}:{visible:boolean;defaultMode:'ask'|'randomize'|'keep-order';confirm:(randomize:boolean)=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const question=defaultMode==='randomize'?'Start tournament and randomize players?':defaultMode==='keep-order'?'Start tournament and keep current order?':'Would you like to randomize the players?';
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.startWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <Text style={[s.startTitle,{color:colors.text}]}>NOHO Tournament Manager</Text>
    <Text style={[s.startQuestion,{color:colors.text}]}>{question}</Text>
    <View style={s.startActions}>
     {defaultMode==='ask'&&<Button title="Yes" onPress={()=>confirm(true)} style={s.startButton}/>}
     {defaultMode==='ask'&&<Button title="No" variant="secondary" onPress={()=>confirm(false)} style={s.startButton}/>}
     {defaultMode==='randomize'&&<Button title="Yes" onPress={()=>confirm(true)} style={s.startButton}/>}
     {defaultMode==='keep-order'&&<Button title="Yes" onPress={()=>confirm(false)} style={s.startButton}/>}
     <Button title="Cancel" variant="secondary" onPress={close} style={s.startButton}/>
    </View>
   </View>
  </View>
 </Modal>;
}

function NoticeModal({visible,title,message,close}:{visible:boolean;title:string;message:string;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}><View style={[s.startWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}><Text style={[s.startTitle,{color:colors.text}]}>{title}</Text><Text style={[s.startQuestion,{color:colors.text}]}>{message}</Text><View style={s.startActions}><Button title="OK" onPress={close} style={s.startButton}/></View></View></View>
 </Modal>;
}

function EndTournamentModal({visible,confirm,close}:{visible:boolean;confirm:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}><View style={[s.startWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}><Text style={[s.startTitle,{color:colors.text}]}>End Tournament?</Text><Text style={[s.startQuestion,{color:colors.text}]}>Are you sure you want to end this tournament?</Text><View style={s.startActions}><Button title="Yes" variant="danger" onPress={confirm} style={s.startButton}/><Button title="No" variant="secondary" onPress={close} style={s.startButton}/></View></View></View>
 </Modal>;
}

function ChampionConfirmModal({visible,championName,confirm,close}:{visible:boolean;championName:string;confirm:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.startWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <Text style={[s.startTitle,{color:colors.text}]}>Confirm Winner?</Text>
    <Text style={[s.startQuestion,{color:colors.text}]}>{championName || 'The winner'} is on the Winner line. Confirm this tournament winner?</Text>
    <View style={s.startActions}>
     <Button title="Yes" onPress={confirm} style={s.startButton}/>
     <Button title="No" variant="secondary" onPress={close} style={s.startButton}/>
    </View>
   </View>
  </View>
 </Modal>;
}

function PayoutModal({visible,rows,onChange,close}:{visible:boolean;rows:PayoutRow[];onChange:(place:string,field:'player'|'amount',value:string)=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.payoutWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <View style={s.payoutHeader}><Text style={[s.payoutTitle,{color:colors.text}]}>Payouts</Text><Pressable onPress={close}><Text style={[s.winnerClose,{color:colors.text}]}>x</Text></Pressable></View>
    <View style={s.payoutTable}>
     <View style={[s.payoutRow,s.payoutHeadRow,{borderColor:colors.border}]}><Text style={[s.payoutPlaceHead,{color:colors.text}]}>Place</Text><Text style={[s.payoutPlayerHead,{color:colors.text}]}>Player</Text><Text style={[s.payoutAmountHead,{color:colors.text}]}>$</Text></View>
     {rows.map(row=><View key={row.place} style={[s.payoutRow,{borderColor:colors.border}]}>
      <Text style={[s.payoutPlace,{color:colors.text}]}>{row.place}</Text>
      <TextInput value={row.player} onChangeText={value=>onChange(row.place,'player',value)} placeholder="Player" placeholderTextColor="#777" style={[s.payoutInput,s.payoutPlayerInput,{backgroundColor:colors.input,color:colors.inputText,borderColor:colors.border}]}/>
      <TextInput value={row.amount} onChangeText={value=>onChange(row.place,'amount',value)} placeholder="0.00" placeholderTextColor="#777" keyboardType="decimal-pad" style={[s.payoutInput,s.payoutAmountInput,{backgroundColor:colors.input,color:colors.inputText,borderColor:colors.border}]}/>
     </View>)}
    </View>
    <View style={s.modalActions}><Button title="Close" variant="secondary" onPress={close}/></View>
   </View>
  </View>
 </Modal>;
}

type ScoreView='menu'|'played'|'live';
function ScoresModal({visible,tournament,matches,settings,close}:{visible:boolean;tournament:Tournament;matches:ResolvedMatch[];settings:AppSettings;close:()=>void}){
 const {settings:appSettings}=useAppSettings();
 const colors=getTheme(appSettings.appearance);
 const [view,setView]=useState<ScoreView>('menu');
 useEffect(()=>{if(visible)setView('menu');},[visible]);
 const playerName=(id:string|null)=>tournament.players.find(player=>player.id===id)?.name??'TBD';
 const scoreLine=(match:ResolvedMatch)=>{
  const matchScore=scoreFor(tournament.scores,match.id);
  const first=match.playerIds[0],second=match.playerIds[1];
  const playerA=tournament.players.find(player=>player.id===first);
  const playerB=tournament.players.find(player=>player.id===second);
  const race=raceTargets(playerA,playerB,settings,tournament,match.side);
  const left=first?matchScore[first]??0:0;
  const right=second?matchScore[second]??0:0;
  return race?`${left}/${race.targets[0]} - ${right}/${race.targets[1]}`:`${left} - ${right}`;
 };
 const hasScore=(match:ResolvedMatch)=>Object.keys(scoreFor(tournament.scores,match.id)).length>0;
 const played=matches.filter(match=>match.complete&&(hasScore(match)||match.winnerId));
 const live=matches.filter(match=>match.ready&&!match.complete);
 const rows=view==='played'?played:view==='live'?live:[];
 const title=view==='played'?'Played Match Scores':view==='live'?'Live Scores':'Scores';
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.scoresWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <View style={s.payoutHeader}><Text style={[s.payoutTitle,{color:colors.text}]}>{title}</Text><Pressable onPress={close}><Text style={[s.winnerClose,{color:colors.text}]}>x</Text></Pressable></View>
    {view==='menu'?<View style={s.scoreChoiceList}>
     <Button title="Played Match Scores" onPress={()=>setView('played')}/>
     <Button title="Live Scores" variant="secondary" onPress={()=>setView('live')}/>
     <Button title="Close" variant="secondary" onPress={close}/>
    </View>:<View style={s.scoreList}>
     <ScrollView style={s.scoreRows}>
      {rows.length===0&&<Text style={[s.scoreEmpty,{color:colors.muted}]}>{view==='live'?'No matches are currently ready or being played.':'No completed match scores yet.'}</Text>}
      {rows.map(match=><View key={match.id} style={[s.scoreRow,{borderColor:colors.border,backgroundColor:colors.panel2}]}>
       <Text style={[s.scoreMatchTitle,{color:colors.text}]}>Match {match.number}</Text>
       <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[s.scorePlayers,{color:colors.text}]}>{playerName(match.playerIds[0])} vs {playerName(match.playerIds[1])}</Text>
       <Text style={s.scoreValue}>{scoreLine(match)}</Text>
       {match.winnerId&&<Text numberOfLines={1} style={[s.scoreWinner,{color:colors.muted}]}>Winner: {playerName(match.winnerId)}</Text>}
      </View>)}
     </ScrollView>
     <View style={s.modalActions}><Button title="Back" variant="secondary" onPress={()=>setView('menu')}/><Button title="Close" variant="secondary" onPress={close}/></View>
    </View>}
   </View>
  </View>
 </Modal>;
}

function SkillLevelsModal({visible,tournament,close}:{visible:boolean;tournament:Tournament;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const players=[...tournament.players].sort((a,b)=>a.seed-b.seed);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.skillsWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <View style={s.payoutHeader}><Text style={[s.payoutTitle,{color:colors.text}]}>Player Skill Levels</Text><Pressable onPress={close}><Text style={[s.winnerClose,{color:colors.text}]}>x</Text></Pressable></View>
    <ScrollView style={s.skillsRows} contentContainerStyle={s.skillsList}>
     {players.length===0&&<Text style={[s.scoreEmpty,{color:colors.muted}]}>No players have been added yet.</Text>}
     {players.map(player=><View key={player.id} style={[s.skillLevelRow,{borderColor:colors.border,backgroundColor:colors.panel2}]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[s.skillPlayerName,{color:colors.text}]}>{player.seed}. {player.name}</Text>
      <Text style={s.skillBadge}>SL {normalizedSkillLevel(player.skillLevel)}</Text>
     </View>)}
    </ScrollView>
    <View style={s.modalActions}><Button title="Close" variant="secondary" onPress={close}/></View>
   </View>
  </View>
 </Modal>;
}

function ConfirmPointModal({visible,player,confirm,close}:{visible:boolean;player:Player|undefined;confirm:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}><View style={[s.startWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}><Text style={[s.startTitle,{color:colors.text}]}>Add Point?</Text><Text style={[s.startQuestion,{color:colors.text}]}>Add one point for {player?.name??'this player'}?</Text><View style={s.startActions}><Button title="Yes" onPress={confirm} style={s.startButton}/><Button title="No" variant="secondary" onPress={close} style={s.startButton}/></View></View></View>
 </Modal>;
}

function CastDeviceModal({visible,status,search,useThisScreen,close}:{visible:boolean;status:string;search:()=>void;useThisScreen:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.castWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <Text style={[s.startTitle,{color:colors.text}]}>Cast Bracket</Text>
    <Text style={[s.castMessage,{color:colors.muted}]}>{status}</Text>
    <View style={s.castActions}>
     <Button title="Search Devices" onPress={search} style={s.castActionButton}/>
     <Button title="Use This Screen" variant="secondary" onPress={useThisScreen} style={s.castActionButton}/>
    </View>
    <Button title="Cancel" variant="secondary" onPress={close}/>
   </View>
  </View>
 </Modal>;
}

function SyncRecoveryBanner({status,reconnect}:{status:SyncStatus;reconnect:()=>void}){
 const message=status==='unconfigured'
  ? 'Live sync is not configured on this build.'
  : status==='connecting'
   ? 'Live sync is connecting. Changes will update when the connection returns.'
   : 'Live sync is offline. The app is retrying automatically.';
 return <View style={s.syncRecovery}><Text style={s.syncRecoveryText}>{message}</Text>{status!=='unconfigured'&&<Button title="Reconnect" variant="secondary" onPress={reconnect} style={s.syncRecoveryButton}/>}</View>;
}

function DirectorToolsModal({visible,tournament,syncStatus,championName,reconnect,openQr,openPayout,openCast,endTournament,sharePublicViewer,close}:{visible:boolean;tournament:Tournament;syncStatus:SyncStatus;championName:string;reconnect:()=>void;openQr:()=>void;openPayout:()=>void;openCast:()=>void;endTournament:()=>void;sharePublicViewer:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const viewerLink=publicViewerUrl(tournament);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.directorWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <View style={s.payoutHeader}><Text style={[s.payoutTitle,{color:colors.text}]}>Director Tools</Text><Pressable onPress={close}><Text style={[s.winnerClose,{color:colors.text}]}>x</Text></Pressable></View>
    <View style={[s.directorInfo,{borderColor:colors.border,backgroundColor:colors.panel2}]}>
     <Text style={[s.directorInfoText,{color:colors.text}]}>Sync: {syncStatusText(syncStatus)}</Text>
     <Text style={[s.directorInfoText,{color:colors.text}]}>PIN: {tournament.settings.directorPinHash?'Set':'Missing'}</Text>
     <Text style={[s.directorInfoText,{color:colors.text}]}>History: {tournament.settings.historyType==='teams'?'Teams':'Singles'}</Text>
     <Text style={[s.directorInfoText,{color:colors.text}]}>Winner: {tournament.settings.confirmedWinnerName??championName??'Not confirmed'}</Text>
     <Text style={[s.directorInfoText,{color:colors.text}]}>Confirmed: {dateTimeText(tournament.settings.confirmedWinnerAt)}</Text>
     <Text numberOfLines={2} style={[s.directorLink,{color:colors.muted}]}>Viewer: {viewerLink||'Unavailable until live sync is configured'}</Text>
    </View>
    <View style={s.directorActions}>
     <Button title="QR" onPress={openQr}/>
     <Button title="Public View Link" variant="secondary" onPress={sharePublicViewer}/>
     <Button title="Reconnect Sync" variant="secondary" onPress={reconnect}/>
     <Button title="Payout" variant="secondary" onPress={openPayout}/>
     <Button title="Cast Screen" variant="secondary" onPress={openCast}/>
     <Button title="End Tournament" variant="danger" onPress={endTournament}/>
    </View>
   </View>
  </View>
 </Modal>;
}

function WinnerModal({visible,match,players,selectedId,setSelectedId,race,scores,director,onPoint,onScoreChange,confirm,close}:{visible:boolean;match:ResolvedMatch|undefined;players:readonly Player[];selectedId:string|null;setSelectedId:(id:string)=>void;race:{label:string;targets:readonly [number,number]}|null;scores:Record<string,number>;director:boolean;onPoint:(matchId:string,playerId:string)=>void;onScoreChange:(matchId:string,playerId:string,delta:number)=>void;confirm:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const [scoreOpen,setScoreOpen]=useState(false);
 const contenders=(match?.playerIds??[]).map(id=>players.find(player=>player.id===id)).filter(Boolean) as Player[];
 const selectedIndex=match?.playerIds[0]===selectedId?0:match?.playerIds[1]===selectedId?1:-1;
 const selectedScore=selectedId?scores[selectedId]??0:0;
 const selectedTarget=selectedIndex>=0?race?.targets[selectedIndex]??0:0;
 const canConfirm=!!selectedId&&(!race||selectedScore>=selectedTarget);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.winnerWindow,{backgroundColor:colors.panel,borderColor:colors.border}]}>
    <View style={s.winnerHeader}><Text style={[s.winnerTitle,{color:colors.muted}]}>MATCH {match?.number} - SELECT WINNER</Text><Pressable onPress={close}><Text style={[s.winnerClose,{color:colors.muted}]}>x</Text></Pressable></View>
    <Text style={[s.winnerHelp,{color:colors.muted}]}>Tap the winner of this match</Text>
    {race&&<Text style={s.raceLabel}>{race.label}</Text>}
    {contenders.map((player,index)=><View key={player.id}>
     <Pressable onPress={()=>setSelectedId(player.id)} style={[s.winnerChoice,{backgroundColor:colors.panel,borderColor:colors.border},selectedId===player.id&&s.winnerChoiceSelected]}><Text style={[s.crown,{color:selectedId===player.id?'#fff':colors.text}]}>♔</Text><Text style={[s.winnerChoiceText,{color:colors.text},selectedId===player.id&&s.winnerChoiceSelectedText]}>{player.name}</Text><Text style={[s.scoreText,selectedId===player.id&&s.winnerChoiceSelectedText]}>{scores[player.id]??0}/{race?.targets[index]??'-'}</Text></Pressable>
     {race&&match&&scoreOpen&&director&&<View style={s.scoreEditRow}><Pressable onPress={()=>onScoreChange(match.id,player.id,-1)} style={s.scoreEditButton}><Text style={s.scoreEditText}>-</Text></Pressable><Text style={s.scoreEditLabel}>Change Score</Text><Pressable onPress={()=>onScoreChange(match.id,player.id,1)} style={s.scoreEditButton}><Text style={s.scoreEditText}>+</Text></Pressable></View>}
     {race&&match&&!match.complete&&scoreOpen&&!director&&<Button title="ADD POINT" variant="secondary" onPress={()=>onPoint(match.id,player.id)} style={s.addPointButton}/>}
     {index===0&&<Text style={[s.vs,{color:colors.muted}]}>VS</Text>}
    </View>)}
    {race&&match&&!match.complete&&<Button title={scoreOpen?'HIDE SCORE':'CHANGE SCORE'} variant="secondary" onPress={()=>setScoreOpen(value=>!value)} style={s.changeScoreButton}/>}
    {race&&selectedId&&selectedTarget>0&&selectedScore<selectedTarget&&<Text style={[s.winnerHelp,{color:colors.muted}]}>Selected winner needs {selectedTarget-selectedScore} more point{selectedTarget-selectedScore===1?'':'s'}.</Text>}
    <Button title="CONFIRM" onPress={confirm} disabled={!canConfirm} style={s.confirmWinner}/>
    <Button title="BACK TO BRACKET" variant="secondary" onPress={close} style={s.backToBracketButton}/>
   </View>
  </View>
 </Modal>;
}

function QrModal({tournament,syncStatus,reconnect,sharePublicViewer,close}:{tournament:Tournament;syncStatus:SyncStatus;reconnect:()=>void;sharePublicViewer:()=>void;close:()=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const joinLink=`deesplacetm:///tournament/${tournament.id}?role=participant&join=${encodeURIComponent(tournament.settings.joinToken??'')}`;
 const qrSource=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinLink)}`;
 const viewerLink=publicViewerUrl(tournament);
 return <View style={[s.modalShade,{backgroundColor:colors.shade}]}><View style={[s.qrWindow,{backgroundColor:colors.panel,borderColor:colors.border}]}><Text style={[s.qrTitle,{color:colors.text}]}>Join Tournament</Text><Image source={{uri:qrSource}} style={s.qrImage}/><Text style={s.qrCode}>{tournament.id.slice(0,10).toUpperCase()}</Text><Text style={[s.muted,{color:colors.muted}]}>Only this director QR can join this tournament. Players open in participant mode and can submit match winners.</Text><Text style={[syncStatus==='connected'?s.syncReady:s.syncWarning,{color:syncStatusColor(syncStatus,settings.appearance==='light')}]}>{syncStatus==='connected'?'Sync: Online':`Sync: ${syncStatusText(syncStatus)}`}</Text><Text numberOfLines={2} style={[s.viewerLink,{color:colors.muted}]}>View-only link: {viewerLink||'Unavailable until live sync is configured'}</Text>{syncStatus!=='connected'&&syncStatus!=='unconfigured'&&<Button title="Reconnect" onPress={reconnect}/>}<Button title="Share View Link" variant="secondary" onPress={sharePublicViewer}/><Button title="Close" variant="secondary" onPress={close}/></View></View>;
}

type ReadyColor='red'|'green'|'gold';
type PlayerDisplay='full-name'|'initials'|'seed-name';
function readyStyle(color:ReadyColor){return color==='green'?s.readyMatchGreen:color==='gold'?s.readyMatchGold:s.readyMatch;}
function displayPlayer(player:Player,mode:PlayerDisplay){
 if(mode==='initials') return player.name.split(/\s+/).filter(Boolean).map(part=>part[0]?.toUpperCase()).join('');
 if(mode==='seed-name') return `${player.seed}. ${player.name}`;
 return player.name;
}
function fittedNameStyle(label:string){
 const length=label.trim().length;
 if(length>28)return s.slotTextTiny;
 if(length>20)return s.slotTextSmall;
 if(length>14)return s.slotTextMedium;
 return null;
}
function BracketCanvas({tournament,matches,readyIds,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false}:{tournament:Tournament;matches:ResolvedMatch[];readyIds:Set<string>;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean}){
 if(tournament.bracketType==='16-single') return <SingleElim16Canvas tournament={tournament} matches={matches} readyIds={readyIds} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation}/>;
 if(tournament.bracketType==='32-single') return <SingleElim32Canvas tournament={tournament} matches={matches} readyIds={readyIds} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation}/>;
 if(tournament.bracketType==='16-double') return <DoubleElim16Canvas tournament={tournament} matches={matches} readyIds={readyIds} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation}/>;
 if(tournament.bracketType==='32-double') return <DoubleElim32Canvas tournament={tournament} matches={matches} readyIds={readyIds} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation}/>;
 const upper=matches.filter(match=>match.side==='upper');
 const lower=matches.filter(match=>match.side==='lower');
 const final=matches.filter(match=>match.side==='final');
 const rounds=[...new Set(upper.map(match=>match.round))];
 const lowerRounds=[...new Set(lower.map(match=>match.round))];
 return <View style={s.bracketArea}>
  <View style={s.rounds}>{rounds.map(round=><View key={round} style={[s.round,{marginTop:(round-1)*32}]}>{upper.filter(match=>match.round===round).map(match=><BracketBox key={match.id} tournament={tournament} match={match} ready={readyIds.has(match.id)} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation}/>)}</View>)}
   {final.map(match=><View key={match.id} style={[s.round,s.finalRound,{marginTop:130}]}><BracketBox tournament={tournament} match={match} ready={readyIds.has(match.id)} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation} finalBox/><View style={s.inlineWinnerRow}><View style={s.inlinePlaceLabel}><Text style={s.placeLabelText}>Winner</Text></View><View style={s.inlineWinnerLine}/></View></View>)}
  </View>
  {(tournament.bracketType.includes('double')||tournament.bracketType.includes('modified-single'))&&<View style={s.lowerRounds}>{lowerRounds.map(round=><View key={round} style={s.lowerRound}>{lower.filter(match=>match.round===round).map(match=><BracketBox key={match.id} tournament={tournament} match={match} ready={readyIds.has(match.id)} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation} displayNumber=""/>)}</View>)}</View>}
 </View>;
}

type BoxPoint={left:number;top:number};
const lineBox={w:102,h:48,c:24};
function HLine({left,top,width}:{left:number;top:number;width:number}){return width>0?<View style={[s.connectorLine,{left,top,width,height:1}]}/>:null;}
function VLine({left,top,height}:{left:number;top:number;height:number}){return height>0?<View style={[s.connectorLine,{left,top,width:1,height}]}/>:null;}
function PairConnector({a,b,to}:{a:BoxPoint;b:BoxPoint;to:BoxPoint}){
 const ay=a.top+lineBox.c,by=b.top+lineBox.c,ty=to.top+lineBox.c;
 const minY=Math.min(ay,by),maxY=Math.max(ay,by);
 if(to.left>a.left){
  const start=a.left+lineBox.w,end=to.left,mid=Math.round((start+end)/2);
  return <><HLine left={start} top={ay} width={mid-start}/><HLine left={b.left+lineBox.w} top={by} width={mid-(b.left+lineBox.w)}/><VLine left={mid} top={minY} height={maxY-minY}/><HLine left={mid} top={ty} width={end-mid}/></>;
 }
 const start=to.left+lineBox.w,end=a.left,mid=Math.round((start+end)/2);
 return <><HLine left={mid} top={ay} width={end-mid}/><HLine left={mid} top={by} width={b.left-mid}/><VLine left={mid} top={minY} height={maxY-minY}/><HLine left={start} top={ty} width={mid-start}/></>;
}
function StepConnector({from,to}:{from:BoxPoint;to:BoxPoint}){
 const fy=from.top+lineBox.c,ty=to.top+lineBox.c;
 if(to.left>from.left){
  const start=from.left+lineBox.w,end=to.left,mid=Math.round((start+end)/2);
  return <><HLine left={start} top={fy} width={mid-start}/><VLine left={mid} top={Math.min(fy,ty)} height={Math.abs(ty-fy)}/><HLine left={mid} top={ty} width={end-mid}/></>;
 }
 const start=to.left+lineBox.w,end=from.left,mid=Math.round((start+end)/2);
 return <><HLine left={mid} top={fy} width={end-mid}/><VLine left={mid} top={Math.min(fy,ty)} height={Math.abs(ty-fy)}/><HLine left={start} top={ty} width={mid-start}/></>;
}
function EndConnector({from,left,top}:{from:BoxPoint;left:number;top:number}){
 const y=top+8;
 if(left>from.left)return <HLine left={from.left+lineBox.w} top={y} width={left-(from.left+lineBox.w)}/>;
 return <HLine left={left+72} top={y} width={from.left-(left+72)}/>;
}
function WinnerLine({left,top,width=72}:{left:number;top:number;width?:number}){return <HLine left={left} top={top+8} width={width}/>;}

function DoubleElim16Canvas({tournament,matches,readyIds,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false}:{tournament:Tournament;matches:ResolvedMatch[];readyIds:Set<string>;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean}){
 const byId=(id:string)=>matches.find(match=>match.id===id);
 const render=(id:string,left:number,top:number,displayNumber?:number|string)=>{
  const match=byId(id);
  if(!match)return null;
  const visualNumber=displayNumber??(id.startsWith('L')?'':undefined);
  const props={tournament,match,ready:readyIds.has(match.id),onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation,boxStyle:[s.templateMatch,{left,top}],...(visualNumber===undefined?{}:{displayNumber:visualNumber})};
  return <BracketBox key={id} {...props}/>;
 };
 const p={
  U1:{left:0,top:0},U2:{left:0,top:58},U3:{left:0,top:116},U4:{left:0,top:174},U5:{left:0,top:232},U6:{left:0,top:290},U7:{left:0,top:348},U8:{left:0,top:406},
  U9:{left:126,top:29},U10:{left:126,top:145},U11:{left:126,top:261},U12:{left:126,top:377},
  U13:{left:252,top:87},U14:{left:252,top:319},U15:{left:378,top:203},GF:{left:504,top:250},GFR:{left:504,top:333},
  L1:{left:704,top:540},L2:{left:704,top:598},L3:{left:704,top:656},L4:{left:704,top:714},
  L5:{left:578,top:511},L6:{left:578,top:569},L7:{left:578,top:627},L8:{left:578,top:685},
  L9:{left:452,top:540},L10:{left:452,top:656},L11:{left:326,top:540},L12:{left:326,top:656},
  L13:{left:200,top:598},L14:{left:74,top:656}
 } satisfies Record<string,BoxPoint>;
 return <View style={s.templateArea}>
  <PairConnector a={p.U1} b={p.U2} to={p.U9}/><PairConnector a={p.U3} b={p.U4} to={p.U10}/><PairConnector a={p.U5} b={p.U6} to={p.U11}/><PairConnector a={p.U7} b={p.U8} to={p.U12}/>
  <PairConnector a={p.U9} b={p.U10} to={p.U13}/><PairConnector a={p.U11} b={p.U12} to={p.U14}/><PairConnector a={p.U13} b={p.U14} to={p.U15}/><StepConnector from={p.U15} to={p.GF}/><EndConnector from={p.GF} left={504} top={330}/>
  <StepConnector from={p.L1} to={p.L5}/><StepConnector from={p.L2} to={p.L6}/><StepConnector from={p.L3} to={p.L7}/><StepConnector from={p.L4} to={p.L8}/>
  <PairConnector a={p.L5} b={p.L6} to={p.L9}/><PairConnector a={p.L7} b={p.L8} to={p.L10}/><StepConnector from={p.L9} to={p.L11}/><StepConnector from={p.L10} to={p.L12}/>
  <PairConnector a={p.L11} b={p.L12} to={p.L13}/><StepConnector from={p.L13} to={p.L14}/>
  <View style={[s.placeLabel,{left:406,top:292}]}><Text style={s.placeLabelText}>2nd</Text></View>
  <View style={[s.placeLabel,{left:504,top:378}]}><Text style={s.placeLabelText}>Winner</Text></View>
  <WinnerLine left={576} top={378}/>
  <View style={[s.placeLabel,{left:74,top:723}]}><Text style={s.placeLabelText}>3rd</Text></View>
  <View style={[s.placeLabel,{left:200,top:641}]}><Text style={s.placeLabelText}>4th</Text></View>
  <View style={[s.placeLabel,{left:326,top:590}]}><Text style={s.placeLabelText}>5th</Text></View>
  <View style={[s.placeLabel,{left:326,top:706}]}><Text style={s.placeLabelText}>6th</Text></View>
  <Text style={[s.loserSourceLabel,{left:100,top:718}]}>Loser of 15</Text>
  <Text style={[s.loserSourceLabel,{left:229,top:653}]}>Loser of 13</Text>
  <Text style={[s.loserSourceLabel,{left:229,top:748}]}>Loser of 14</Text>
  <Text style={[s.loserSourceLabel,{left:604,top:557}]}>Loser of 12</Text>
  <Text style={[s.loserSourceLabel,{left:604,top:615}]}>Loser of 11</Text>
  <Text style={[s.loserSourceLabel,{left:604,top:673}]}>Loser of 10</Text>
  <Text style={[s.loserSourceLabel,{left:604,top:731}]}>Loser of 9</Text>
  {[
   render('U1',0,0),render('U2',0,58),render('U3',0,116),render('U4',0,174),render('U5',0,232),render('U6',0,290),render('U7',0,348),render('U8',0,406),
   render('U9',126,29),render('U10',126,145),render('U11',126,261),render('U12',126,377),render('U13',252,87),render('U14',252,319),render('U15',378,203),render('GF',504,250,16),render('GFR',504,333,''),
   render('L1',704,540),render('L2',704,598),render('L3',704,656),render('L4',704,714),render('L5',578,511),render('L6',578,569),render('L7',578,627),render('L8',578,685),
   render('L9',452,540),render('L10',452,656),render('L11',326,540),render('L12',326,656),render('L13',200,598),render('L14',74,656)
 ]}
 </View>;
}

function SingleElim16Canvas({tournament,matches,readyIds,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false}:{tournament:Tournament;matches:ResolvedMatch[];readyIds:Set<string>;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean}){
 const byId=(id:string)=>matches.find(match=>match.id===id);
 const render=(id:string,left:number,top:number)=>{
  const match=byId(id);
  if(!match)return null;
  return <BracketBox key={id} tournament={tournament} match={match} ready={readyIds.has(match.id)} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation} boxStyle={[s.templateMatch,{left,top}]}/>;
 };
 const p={U1:{left:0,top:0},U2:{left:0,top:58},U3:{left:0,top:116},U4:{left:0,top:174},U5:{left:0,top:232},U6:{left:0,top:290},U7:{left:0,top:348},U8:{left:0,top:406},U9:{left:100,top:29},U10:{left:100,top:145},U11:{left:100,top:261},U12:{left:100,top:377},U13:{left:200,top:87},U14:{left:200,top:319},U15:{left:284,top:203}} satisfies Record<string,BoxPoint>;
 return <View style={s.single16Area}>
  <PairConnector a={p.U1} b={p.U2} to={p.U9}/><PairConnector a={p.U3} b={p.U4} to={p.U10}/><PairConnector a={p.U5} b={p.U6} to={p.U11}/><PairConnector a={p.U7} b={p.U8} to={p.U12}/>
  <PairConnector a={p.U9} b={p.U10} to={p.U13}/><PairConnector a={p.U11} b={p.U12} to={p.U14}/><PairConnector a={p.U13} b={p.U14} to={p.U15}/><EndConnector from={p.U15} left={379} top={288}/>
  <View style={[s.placeLabel,s.widePlaceLabel,{left:214,top:288}]}><Text style={s.placeLabelText}>3rd - 4th</Text></View>
  <View style={[s.placeLabel,{left:295,top:288}]}><Text style={s.placeLabelText}>2nd</Text></View>
  <View style={[s.placeLabel,{left:379,top:336}]}><Text style={s.placeLabelText}>Winner</Text></View>
  <WinnerLine left={451} top={336}/>
  {[
   render('U1',0,0),render('U2',0,58),render('U3',0,116),render('U4',0,174),
   render('U5',0,232),render('U6',0,290),render('U7',0,348),render('U8',0,406),
   render('U9',100,29),render('U10',100,145),render('U11',100,261),render('U12',100,377),
   render('U13',200,87),render('U14',200,319),render('U15',284,203)
  ]}
 </View>;
}

function SingleElim32Canvas({tournament,matches,readyIds,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false}:{tournament:Tournament;matches:ResolvedMatch[];readyIds:Set<string>;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean}){
 const byId=(id:string)=>matches.find(match=>match.id===id);
 const render=(id:string,left:number,top:number)=>{
  const match=byId(id);
  if(!match)return null;
  return <BracketBox key={id} tournament={tournament} match={match} ready={readyIds.has(match.id)} onWinner={onWinner} onEdit={onEdit} onBye={onBye} director={director} readyColor={readyColor} playerDisplay={playerDisplay} settings={settings} presentation={presentation} boxStyle={[s.templateMatch,{left,top}]}/>;
 };
 const p={U1:{left:0,top:0},U2:{left:0,top:58},U3:{left:0,top:116},U4:{left:0,top:174},U5:{left:0,top:232},U6:{left:0,top:290},U7:{left:0,top:348},U8:{left:0,top:406},U9:{left:0,top:464},U10:{left:0,top:522},U11:{left:0,top:580},U12:{left:0,top:638},U13:{left:0,top:696},U14:{left:0,top:754},U15:{left:0,top:812},U16:{left:0,top:870},U17:{left:100,top:29},U18:{left:100,top:145},U19:{left:100,top:261},U20:{left:100,top:377},U21:{left:100,top:493},U22:{left:100,top:609},U23:{left:100,top:725},U24:{left:100,top:841},U25:{left:200,top:87},U26:{left:200,top:319},U27:{left:200,top:551},U28:{left:200,top:783},U29:{left:284,top:203},U30:{left:284,top:667},U31:{left:368,top:435}} satisfies Record<string,BoxPoint>;
 return <View style={s.single32Area}>
  <PairConnector a={p.U1} b={p.U2} to={p.U17}/><PairConnector a={p.U3} b={p.U4} to={p.U18}/><PairConnector a={p.U5} b={p.U6} to={p.U19}/><PairConnector a={p.U7} b={p.U8} to={p.U20}/>
  <PairConnector a={p.U9} b={p.U10} to={p.U21}/><PairConnector a={p.U11} b={p.U12} to={p.U22}/><PairConnector a={p.U13} b={p.U14} to={p.U23}/><PairConnector a={p.U15} b={p.U16} to={p.U24}/>
  <PairConnector a={p.U17} b={p.U18} to={p.U25}/><PairConnector a={p.U19} b={p.U20} to={p.U26}/><PairConnector a={p.U21} b={p.U22} to={p.U27}/><PairConnector a={p.U23} b={p.U24} to={p.U28}/>
  <PairConnector a={p.U25} b={p.U26} to={p.U29}/><PairConnector a={p.U27} b={p.U28} to={p.U30}/><PairConnector a={p.U29} b={p.U30} to={p.U31}/><EndConnector from={p.U31} left={465} top={450}/>
  <View style={[s.placeLabel,s.widePlaceLabel,{left:216,top:430}]}><Text style={s.placeLabelText}>5th - 8th</Text></View>
  <View style={[s.placeLabel,s.widePlaceLabel,{left:300,top:430}]}><Text style={s.placeLabelText}>3rd - 4th</Text></View>
  <View style={[s.placeLabel,{left:377,top:430}]}><Text style={s.placeLabelText}>2nd</Text></View>
  <View style={[s.placeLabel,{left:465,top:510}]}><Text style={s.placeLabelText}>Winner</Text></View>
  <WinnerLine left={537} top={510}/>
  {[
   render('U1',0,0),render('U2',0,58),render('U3',0,116),render('U4',0,174),
   render('U5',0,232),render('U6',0,290),render('U7',0,348),render('U8',0,406),
   render('U9',0,464),render('U10',0,522),render('U11',0,580),render('U12',0,638),
   render('U13',0,696),render('U14',0,754),render('U15',0,812),render('U16',0,870),
   render('U17',100,29),render('U18',100,145),render('U19',100,261),render('U20',100,377),
   render('U21',100,493),render('U22',100,609),render('U23',100,725),render('U24',100,841),
   render('U25',200,87),render('U26',200,319),render('U27',200,551),render('U28',200,783),
   render('U29',284,203),render('U30',284,667),render('U31',368,435)
  ]}
 </View>;
}

function DoubleElim32Canvas({tournament,matches,readyIds,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false}:{tournament:Tournament;matches:ResolvedMatch[];readyIds:Set<string>;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean}){
 const byId=(id:string)=>matches.find(match=>match.id===id);
 const render=(id:string,left:number,top:number,displayNumber?:number|string)=>{
 const match=byId(id);
 if(!match)return null;
  const visualNumber=displayNumber??(id.startsWith('L')?'':undefined);
 const props={tournament,match,ready:readyIds.has(match.id),onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation,boxStyle:[s.templateMatch,{left,top}],...(visualNumber===undefined?{}:{displayNumber:visualNumber})};
  return <BracketBox key={id} {...props}/>;
 };
 const p={
  U1:{left:0,top:0},U2:{left:0,top:58},U3:{left:0,top:116},U4:{left:0,top:174},U5:{left:0,top:232},U6:{left:0,top:290},U7:{left:0,top:348},U8:{left:0,top:406},
  U9:{left:0,top:464},U10:{left:0,top:522},U11:{left:0,top:580},U12:{left:0,top:638},U13:{left:0,top:696},U14:{left:0,top:754},U15:{left:0,top:812},U16:{left:0,top:870},
  U17:{left:122,top:29},U18:{left:122,top:145},U19:{left:122,top:261},U20:{left:122,top:377},U21:{left:122,top:493},U22:{left:122,top:609},U23:{left:122,top:725},U24:{left:122,top:841},
  U25:{left:244,top:87},U26:{left:244,top:319},U27:{left:244,top:551},U28:{left:244,top:783},U29:{left:366,top:203},U30:{left:366,top:667},U31:{left:488,top:435},GF:{left:610,top:495},GFR:{left:610,top:578},
  L1:{left:770,top:820},L2:{left:770,top:890},L3:{left:770,top:960},L4:{left:770,top:1030},L5:{left:770,top:1100},L6:{left:770,top:1170},L7:{left:770,top:1240},L8:{left:770,top:1310},
  L9:{left:648,top:795},L10:{left:648,top:865},L11:{left:648,top:935},L12:{left:648,top:1005},L13:{left:648,top:1075},L14:{left:648,top:1145},L15:{left:648,top:1215},L16:{left:648,top:1285},
  L17:{left:526,top:830},L18:{left:526,top:970},L19:{left:526,top:1110},L20:{left:526,top:1250},L21:{left:404,top:800},L22:{left:404,top:940},L23:{left:404,top:1080},L24:{left:404,top:1220},
  L25:{left:282,top:870},L26:{left:282,top:1150},L27:{left:190,top:920},L28:{left:190,top:1220},L29:{left:98,top:1070},L30:{left:0,top:1120}
 } satisfies Record<string,BoxPoint>;
 return <View style={s.template32Area}>
  <PairConnector a={p.U1} b={p.U2} to={p.U17}/><PairConnector a={p.U3} b={p.U4} to={p.U18}/><PairConnector a={p.U5} b={p.U6} to={p.U19}/><PairConnector a={p.U7} b={p.U8} to={p.U20}/>
  <PairConnector a={p.U9} b={p.U10} to={p.U21}/><PairConnector a={p.U11} b={p.U12} to={p.U22}/><PairConnector a={p.U13} b={p.U14} to={p.U23}/><PairConnector a={p.U15} b={p.U16} to={p.U24}/>
  <PairConnector a={p.U17} b={p.U18} to={p.U25}/><PairConnector a={p.U19} b={p.U20} to={p.U26}/><PairConnector a={p.U21} b={p.U22} to={p.U27}/><PairConnector a={p.U23} b={p.U24} to={p.U28}/>
  <PairConnector a={p.U25} b={p.U26} to={p.U29}/><PairConnector a={p.U27} b={p.U28} to={p.U30}/><PairConnector a={p.U29} b={p.U30} to={p.U31}/><StepConnector from={p.U31} to={p.GF}/><EndConnector from={p.GF} left={610} top={528}/>
  <StepConnector from={p.L1} to={p.L9}/><StepConnector from={p.L2} to={p.L10}/><StepConnector from={p.L3} to={p.L11}/><StepConnector from={p.L4} to={p.L12}/>
  <StepConnector from={p.L5} to={p.L13}/><StepConnector from={p.L6} to={p.L14}/><StepConnector from={p.L7} to={p.L15}/><StepConnector from={p.L8} to={p.L16}/>
  <PairConnector a={p.L9} b={p.L10} to={p.L17}/><PairConnector a={p.L11} b={p.L12} to={p.L18}/><PairConnector a={p.L13} b={p.L14} to={p.L19}/><PairConnector a={p.L15} b={p.L16} to={p.L20}/>
  <StepConnector from={p.L17} to={p.L21}/><StepConnector from={p.L18} to={p.L22}/><StepConnector from={p.L19} to={p.L23}/><StepConnector from={p.L20} to={p.L24}/>
  <PairConnector a={p.L21} b={p.L22} to={p.L25}/><PairConnector a={p.L23} b={p.L24} to={p.L26}/><StepConnector from={p.L25} to={p.L27}/><StepConnector from={p.L26} to={p.L28}/>
  <PairConnector a={p.L27} b={p.L28} to={p.L29}/><StepConnector from={p.L29} to={p.L30}/>
  <View style={[s.placeLabel,{left:508,top:540}]}><Text style={s.placeLabelText}>2nd</Text></View>
  <View style={[s.placeLabel,{left:610,top:623}]}><Text style={s.placeLabelText}>Winner</Text></View>
  <WinnerLine left={682} top={623}/>
  <View style={[s.placeLabel,{left:98,top:1142}]}><Text style={s.placeLabelText}>3rd</Text></View>
  <View style={[s.placeLabel,{left:190,top:1105}]}><Text style={s.placeLabelText}>4th</Text></View>
  <View style={[s.placeLabel,s.widePlaceLabel,{left:282,top:1020}]}><Text style={s.placeLabelText}>5th-6th</Text></View>
  <View style={[s.placeLabel,s.widePlaceLabel,{left:404,top:1050}]}><Text style={s.placeLabelText}>7th-8th</Text></View>
  <Text style={[s.loserSourceLabel,{left:112,top:1182}]}>Loser of 31</Text>
  <Text style={[s.loserSourceLabel,{left:215,top:972}]}>Loser of 30</Text>
  <Text style={[s.loserSourceLabel,{left:215,top:1272}]}>Loser of 29</Text>
  <Text style={[s.loserSourceLabel,{left:310,top:924}]}>Loser of 26</Text>
  <Text style={[s.loserSourceLabel,{left:310,top:1204}]}>Loser of 25</Text>
  <Text style={[s.loserSourceLabel,{left:432,top:854}]}>Loser of 28</Text>
  <Text style={[s.loserSourceLabel,{left:432,top:994}]}>Loser of 27</Text>
  <Text style={[s.loserSourceLabel,{left:432,top:1134}]}>Loser of 24</Text>
  <Text style={[s.loserSourceLabel,{left:432,top:1274}]}>Loser of 23</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:844}]}>Loser of 22</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:914}]}>Loser of 21</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:984}]}>Loser of 20</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:1054}]}>Loser of 19</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:1124}]}>Loser of 18</Text>
  <Text style={[s.loserSourceLabel,{left:676,top:1194}]}>Loser of 17</Text>
  {[
   render('U1',0,0),render('U2',0,58),render('U3',0,116),render('U4',0,174),render('U5',0,232),render('U6',0,290),render('U7',0,348),render('U8',0,406),
   render('U9',0,464),render('U10',0,522),render('U11',0,580),render('U12',0,638),render('U13',0,696),render('U14',0,754),render('U15',0,812),render('U16',0,870),
   render('U17',122,29),render('U18',122,145),render('U19',122,261),render('U20',122,377),render('U21',122,493),render('U22',122,609),render('U23',122,725),render('U24',122,841),
   render('U25',244,87),render('U26',244,319),render('U27',244,551),render('U28',244,783),render('U29',366,203),render('U30',366,667),render('U31',488,435),render('GF',610,495,32),render('GFR',610,578,''),
   render('L1',770,820),render('L2',770,890),render('L3',770,960),render('L4',770,1030),render('L5',770,1100),render('L6',770,1170),render('L7',770,1240),render('L8',770,1310),
   render('L9',648,795),render('L10',648,865),render('L11',648,935),render('L12',648,1005),render('L13',648,1075),render('L14',648,1145),render('L15',648,1215),render('L16',648,1285),
   render('L17',526,830),render('L18',526,970),render('L19',526,1110),render('L20',526,1250),render('L21',404,800),render('L22',404,940),render('L23',404,1080),render('L24',404,1220),
   render('L25',282,870),render('L26',282,1150),render('L27',190,920),render('L28',190,1220),render('L29',98,1070),render('L30',0,1120)
  ]}
 </View>;
}

function BracketBox({tournament,match,ready,onWinner,onEdit,onBye,director,readyColor,playerDisplay,settings,presentation=false,finalBox=false,boxStyle,displayNumber}:{tournament:Tournament;match:ResolvedMatch;ready:boolean;onWinner:(match:ResolvedMatch)=>void;onEdit:(match:ResolvedMatch)=>void;onBye:(seed:number)=>void;director:boolean;readyColor:ReadyColor;playerDisplay:PlayerDisplay;settings:AppSettings;presentation?:boolean;finalBox?:boolean;boxStyle?:object;displayNumber?:number|string}){
 const slotInfo=(id:string|null,index:number)=>{
  const player=id?tournament.players.find(item=>item.id===id):null;
  if(player)return {label:displayPlayer(player,playerDisplay),seed:null,isBye:false};
  const seed=sourceSeed(match.slots[index]);
  const isBye=!!seed && tournament.status!=='draft' && !tournament.players.some(player=>player.seed===seed);
  return {label:isBye?'Bye':'',seed,isBye};
 };
 const slotA=slotInfo(match.playerIds[0],0);
 const slotB=slotInfo(match.playerIds[1],1);
 const renderSlot=(slot:{label:string;seed:number|null;isBye:boolean},position:'top'|'bottom')=><Pressable disabled={presentation||!director||!slot.isBye||!slot.seed} onPress={()=>slot.seed&&onBye(slot.seed)} style={[s.slotPressable,position==='top'?s.slotTop:s.slotBottom,slot.isBye&&director&&!presentation&&s.byeSlot]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} ellipsizeMode="clip" style={[s.slotText,fittedNameStyle(slot.label),slot.isBye&&s.byeText]}>{slot.label}</Text></Pressable>;
 const openMatch=()=>{
  if(match.complete){onEdit(match);return;}
  if(ready)onWinner(match);
 };
 return <Pressable disabled={presentation||(!ready&&!match.complete)} onPress={openMatch} style={[s.matchBox,boxStyle,(ready||match.complete)&&s.actionableMatch,ready&&readyStyle(readyColor),finalBox&&s.finalMatch]}>
  <Text style={s.matchNumber}>{displayNumber??match.number}</Text>
  {renderSlot(slotA,'top')}
  {renderSlot(slotB,'bottom')}
 </Pressable>;
}

const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#000'},
 toolbar:{minHeight:26,backgroundColor:'rgba(0,0,0,.92)',flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:8,paddingBottom:8,flexWrap:'wrap',borderBottomColor:'rgba(95,234,40,.22)',borderBottomWidth:1},
 toolbarButton:{width:40,minHeight:38,paddingHorizontal:0,paddingVertical:0,borderRadius:8,backgroundColor:'#061206',borderColor:'rgba(95,234,40,.55)'},
 toolbarPrimaryButton:{backgroundColor:theme.green,borderColor:theme.green},
 toolbarDangerButton:{backgroundColor:'#d94f54',borderColor:'#d94f54'},
 toolbarIconText:{fontSize:19,lineHeight:22,fontWeight:'900'},
 castBar:{minHeight:38,backgroundColor:'#061206',borderBottomColor:theme.green,borderBottomWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,gap:10},
 castTitle:{color:'#fff',fontSize:16,fontWeight:'900',flex:1},
 participantBadge:{backgroundColor:'#061206',borderColor:theme.green,borderWidth:1,color:'#fff',fontSize:12,fontWeight:'900',paddingHorizontal:10,paddingVertical:7},
 syncBadge:{color:theme.green,fontSize:12,fontWeight:'900',paddingHorizontal:8},
 syncRecovery:{backgroundColor:'#1b1200',borderBottomColor:'#e0aa45',borderBottomWidth:1,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:10},
 syncRecoveryText:{color:'#ffd889',fontSize:12,fontWeight:'900',flex:1},
 syncRecoveryButton:{minHeight:32},
 scroller:{flex:1},
 horizontalScroll:{width:'100%',flexGrow:0},
 bracketViewport:{paddingTop:18},
 castViewport:{alignItems:'center',justifyContent:'center',paddingTop:0},
 horizontalScroller:{alignItems:'flex-start'},
 zoomSurface:{backgroundColor:'#000',position:'relative'},
 canvas:{width:1320,minHeight:760,backgroundColor:'#000',position:'relative',paddingTop:150},
 single16Canvas:{width:580,minHeight:620,paddingTop:180},
 single32Canvas:{width:680,minHeight:1160,paddingTop:180},
 doubleCanvas:{width:960,minHeight:1020,paddingTop:190},
 double32Canvas:{width:1080,minHeight:1590,paddingTop:190},
 castCanvas:{paddingTop:8},
 bracketLogo:{position:'absolute',top:60,left:12,width:126,height:82},
 title:{color:'#fff',fontSize:24,fontWeight:'900',margin:18},
 infoPanel:{position:'absolute',top:62,left:160,width:270,backgroundColor:'#061206',borderColor:theme.green,borderWidth:1,borderRadius:10,padding:6,gap:3},
 infoRow:{flexDirection:'row',alignItems:'center',gap:5},
 infoLabel:{color:'#fff',fontSize:10,width:75},
 infoValue:{backgroundColor:'#fff',color:'#000',minHeight:14,flex:1,fontSize:10,paddingHorizontal:3},
 statusPanel:{position:'absolute',top:62,left:612,width:126,height:30,backgroundColor:'#061206',borderColor:theme.green,borderWidth:1,borderRadius:4,alignItems:'center',justifyContent:'center'},
 readyPanel:{position:'absolute',top:100,left:612,width:126,height:32,backgroundColor:'#061206',borderColor:theme.green,borderWidth:1,borderRadius:4,alignItems:'center',justifyContent:'space-around',flexDirection:'row',paddingHorizontal:8},
 statusText:{color:'#fff',fontSize:10},
 readyCount:{backgroundColor:'#f00',color:'#fff',fontWeight:'900',fontSize:18,borderRadius:5,paddingHorizontal:7},
 bracketArea:{paddingLeft:0,paddingTop:8},
 single16Area:{width:580,height:500,position:'relative'},
 single32Area:{width:680,height:1060,position:'relative'},
 templateArea:{width:860,height:820,position:'relative'},
 template32Area:{width:900,height:1380,position:'relative'},
 templateMatch:{position:'absolute',width:102,height:48},
 connectorLine:{position:'absolute',backgroundColor:bracketColors.line,zIndex:0},
 bracketSideLabel:{position:'absolute',height:20,borderColor:bracketColors.source,borderWidth:1,backgroundColor:'#061206',alignItems:'center',justifyContent:'center'},
 bracketSideLabelText:{color:bracketColors.source,fontSize:11,fontWeight:'900',fontFamily:bracketFont},
 placeLabel:{position:'absolute',width:72,height:16,backgroundColor:bracketColors.placement,alignItems:'center',justifyContent:'center'},
 widePlaceLabel:{width:86},
 loserSourceLabel:{position:'absolute',color:bracketColors.source,fontSize:8,fontWeight:'800',fontFamily:bracketFont},
 inlinePlaceLabel:{width:72,height:16,backgroundColor:bracketColors.placement,alignItems:'center',justifyContent:'center',marginTop:8},
 inlineWinnerRow:{flexDirection:'row',alignItems:'center'},
 inlineWinnerLine:{width:72,height:1,backgroundColor:bracketColors.line,marginTop:8},
 placeLabelText:{color:bracketColors.text,fontSize:10,fontWeight:'800',fontFamily:bracketFont},
 rounds:{flexDirection:'row',alignItems:'flex-start',gap:22},
 round:{width:120,gap:14},
 finalRound:{alignItems:'center',width:210},
 lowerRounds:{marginTop:28,marginLeft:90,flexDirection:'row',gap:18,alignItems:'flex-start'},
 lowerRound:{width:118,gap:10},
 matchBox:{width:120,height:58,borderColor:bracketColors.line,borderWidth:1,backgroundColor:'#000',justifyContent:'center',position:'relative'},
 actionableMatch:{zIndex:20},
 finalMatch:{marginTop:60},
 readyMatch:{backgroundColor:bracketColors.ready},
 readyMatchGreen:{backgroundColor:theme.green},
 readyMatchGold:{backgroundColor:bracketColors.gold},
 matchNumber:{position:'absolute',left:0,right:0,top:-14,color:bracketColors.number,fontSize:10,fontWeight:'800',fontFamily:bracketFont,textAlign:'center'},
 slotPressable:{position:'absolute',left:0,width:'100%',height:22,justifyContent:'center'},
 slotTop:{top:4},
 slotBottom:{bottom:4},
 slotText:{color:bracketColors.text,fontSize:11,fontWeight:'700',fontFamily:bracketFont,textAlign:'center',height:18,paddingHorizontal:4,textShadowColor:'#000',textShadowRadius:2,textShadowOffset:{width:0,height:1}},
 slotTextMedium:{fontSize:10},
 slotTextSmall:{fontSize:9},
 slotTextTiny:{fontSize:8,paddingHorizontal:2},
 byeSlot:{backgroundColor:bracketColors.bye},
 byeText:{color:bracketColors.number,fontWeight:'900'},
 modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.62)',alignItems:'center',justifyContent:'center',padding:12},
 playerWindow:{width:'100%',maxWidth:390,borderColor:'#333',borderWidth:1,backgroundColor:'#000'},
 modalTitleBar:{height:31,backgroundColor:'#f3f3f3',alignItems:'center',flexDirection:'row',justifyContent:'space-between',paddingHorizontal:8},
 modalTitle:{color:'#777'},
 close:{color:'#888',fontSize:18},
 playerBody:{padding:28,gap:8},
 playerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 statusPill:{backgroundColor:'#061206',borderColor:theme.green,borderWidth:1,color:'#fff',borderRadius:4,paddingHorizontal:12,paddingVertical:8,fontSize:10},
 count:{color:'#fff',fontSize:12},
 label:{color:'#fff',fontSize:12},
 byeNotice:{color:theme.green,fontSize:12,fontWeight:'900',borderColor:theme.green,borderWidth:1,padding:6,textAlign:'center'},
 nameHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 inlineCount:{color:'#fff',fontSize:11},
 whiteInput:{backgroundColor:'#fff',color:'#000',borderColor:'#777',borderWidth:1,minHeight:20,paddingHorizontal:5},
 skillButtons:{flexDirection:'row',gap:4},
 skillButton:{width:32,height:28,borderColor:'#777',borderWidth:1,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
 skillSelected:{backgroundColor:theme.green,borderColor:theme.green},
 skillText:{color:'#000',fontSize:12,fontWeight:'900'},
 skillSelectedText:{color:'#fff'},
 requiredInput:{borderColor:'#e0aa45',borderWidth:2},
 validationText:{color:'#e0aa45',fontSize:11,fontWeight:'800'},
 playerGrid:{flexDirection:'row',gap:12},
 playerControls:{width:198,gap:5},
 smallButtons:{alignSelf:'flex-end',gap:4,width:80},
 selectBox:{backgroundColor:'#fff',color:'#000',borderColor:'#777',borderWidth:1,padding:4,fontSize:12},
 playerList:{backgroundColor:'#fff',width:128,height:120},
 playerOption:{padding:5},
 playerSelected:{backgroundColor:theme.green},
 playerOptionText:{color:'#000',fontSize:12},
 modalActions:{flexDirection:'row',justifyContent:'flex-end',gap:8,marginTop:8},
 startWindow:{width:'100%',maxWidth:330,backgroundColor:'#071207',borderColor:theme.green,borderWidth:1,padding:18,gap:16},
 startTitle:{color:'#fff',fontSize:14,fontWeight:'900'},
 startQuestion:{color:'#fff',fontSize:14},
 startActions:{flexDirection:'row',gap:8,justifyContent:'space-between'},
 startButton:{flex:1,minHeight:36,borderRadius:0},
 payoutWindow:{width:'100%',maxWidth:430,backgroundColor:'#000',borderColor:theme.green,borderWidth:1,borderRadius:10,padding:14,gap:12},
 directorWindow:{width:'100%',maxWidth:430,backgroundColor:'#000',borderColor:theme.green,borderWidth:1,borderRadius:10,padding:14,gap:12},
 directorInfo:{borderWidth:1,borderRadius:8,padding:10,gap:6},
 directorInfoText:{fontSize:12,fontWeight:'800'},
 directorLink:{fontSize:11,lineHeight:16},
 directorActions:{gap:8},
 payoutHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 payoutTitle:{color:'#fff',fontSize:18,fontWeight:'900'},
 payoutTable:{borderColor:theme.green,borderWidth:1,borderRadius:6,overflow:'hidden'},
 payoutRow:{minHeight:34,flexDirection:'row',alignItems:'center',borderBottomWidth:1,paddingHorizontal:6,gap:6},
 payoutHeadRow:{minHeight:28},
 payoutPlaceHead:{width:70,color:'#fff',fontSize:11,fontWeight:'900'},
 payoutPlayerHead:{flex:1,color:'#fff',fontSize:11,fontWeight:'900'},
 payoutAmountHead:{width:86,color:'#fff',fontSize:11,fontWeight:'900'},
 payoutPlace:{width:70,color:'#fff',fontSize:12,fontWeight:'800'},
 payoutInput:{minHeight:26,borderWidth:1,paddingHorizontal:6,fontSize:12},
 payoutPlayerInput:{flex:1},
 payoutAmountInput:{width:86},
 scoresWindow:{width:'100%',maxWidth:430,maxHeight:'82%',backgroundColor:'#000',borderColor:theme.green,borderWidth:1,borderRadius:10,padding:14,gap:12},
 scoreChoiceList:{gap:10},
 scoreList:{gap:10},
 scoreRows:{maxHeight:420},
 scoreRow:{borderWidth:1,borderRadius:6,padding:10,marginBottom:8,gap:4},
 scoreMatchTitle:{fontSize:12,fontWeight:'900'},
 scorePlayers:{fontSize:13,fontWeight:'800'},
 scoreValue:{color:bracketColors.score,fontSize:18,fontWeight:'900'},
 scoreWinner:{fontSize:11,fontWeight:'800'},
 scoreEmpty:{fontSize:13,textAlign:'center',paddingVertical:16},
 skillsWindow:{width:'100%',maxWidth:430,maxHeight:'82%',backgroundColor:'#000',borderColor:theme.green,borderWidth:1,borderRadius:10,padding:14,gap:12},
 skillsRows:{maxHeight:420},
 skillsList:{gap:8},
 skillLevelRow:{minHeight:42,borderWidth:1,borderRadius:6,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:10},
 skillPlayerName:{flex:1,fontSize:14,fontWeight:'900'},
 skillBadge:{minWidth:58,textAlign:'center',backgroundColor:bracketColors.gold,color:'#071207',fontSize:13,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:4},
 castWindow:{width:'100%',maxWidth:360,backgroundColor:'#071207',borderColor:theme.green,borderWidth:1,padding:18,gap:14},
 castMessage:{color:'#d8ead8',fontSize:13,lineHeight:19},
 castActions:{flexDirection:'row',gap:8},
 castActionButton:{flex:1,minHeight:38,borderRadius:0},
 winnerWindow:{width:'100%',maxWidth:330,backgroundColor:'#071207',borderColor:'#1d2b1d',borderWidth:1,padding:22,gap:12},
 winnerHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 winnerTitle:{color:'#b8cbb8',fontSize:12,fontWeight:'900',letterSpacing:1},
 winnerClose:{color:'#b8cbb8',fontSize:18,lineHeight:18},
 winnerHelp:{color:'#9aa89a',fontSize:10,textAlign:'center',marginBottom:2},
 raceLabel:{color:'#e0aa45',fontSize:12,fontWeight:'900',textAlign:'center'},
 winnerChoice:{height:44,borderColor:'#183018',borderWidth:1,backgroundColor:'#071207',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},
 winnerChoiceSelected:{backgroundColor:'#e0aa45',borderColor:'#e0aa45'},
 crown:{color:'#fff',fontSize:12},
 winnerChoiceText:{color:'#fff',fontSize:13,fontWeight:'900'},
 scoreText:{position:'absolute',right:10,color:bracketColors.score,fontSize:13,fontWeight:'900'},
 winnerChoiceSelectedText:{color:'#071207'},
 addPointButton:{minHeight:30,borderRadius:0,marginTop:4},
 changeScoreButton:{minHeight:34,borderRadius:0,marginTop:4},
 scoreEditRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:5},
 scoreEditButton:{width:30,height:28,borderRadius:14,backgroundColor:theme.green,alignItems:'center',justifyContent:'center',borderColor:'#fff',borderWidth:1},
 scoreEditText:{color:'#fff',fontSize:18,fontWeight:'900',lineHeight:20},
 scoreEditLabel:{color:'#b8cbb8',fontSize:10,fontWeight:'800'},
 vs:{color:'#879487',fontSize:10,textAlign:'center',paddingVertical:8},
 confirmWinner:{marginTop:2,borderRadius:0},
 backToBracketButton:{minHeight:34,borderRadius:0},
 qrWindow:{width:300,backgroundColor:'#000',borderColor:'#333',borderWidth:1,padding:18,gap:12},
 qrTitle:{color:'#fff',fontWeight:'900',fontSize:18},
 qrImage:{width:180,height:180,alignSelf:'center',backgroundColor:'#fff'},
 qrBox:{width:180,height:180,alignSelf:'center',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
 qrCode:{color:'#000',fontSize:20,fontWeight:'900'},
 viewerLink:{fontSize:11,lineHeight:16},
 syncReady:{color:theme.green,fontSize:12,fontWeight:'800'},
 syncWarning:{color:'#e0aa45',fontSize:12,fontWeight:'800'},
 muted:{color:'#bbb',fontSize:12}
});
