import { Tournament } from '@/domain/types';

export type SyncStatus = 'unconfigured' | 'connecting' | 'connected' | 'offline';

type SyncEnvelope =
 | {type:'subscribe';tournamentId:string}
 | {type:'publish';tournamentId:string;tournament:Tournament}
 | {type:'snapshot'|'update'|'tournament';tournamentId?:string;tournament:Tournament};

export function syncUrl(){
 return process.env.EXPO_PUBLIC_SYNC_URL?.trim() || '';
}

export function realtimeConfigured(){
 return syncUrl().length>0;
}

export function openTournamentSync(tournamentId:string,onTournament:(tournament:Tournament)=>void,onStatus:(status:SyncStatus)=>void){
 const url=syncUrl();
 if(!url){onStatus('unconfigured');return {publish:()=>{},close:()=>{}};}
 let socket:WebSocket|null=null;
 let open=false;
 const queue:SyncEnvelope[]=[];
 const send=(message:SyncEnvelope)=>{
  if(socket&&open) socket.send(JSON.stringify(message));
  else queue.push(message);
 };
 try{
  onStatus('connecting');
  socket=new WebSocket(url);
  socket.onopen=()=>{
   open=true;
   onStatus('connected');
   send({type:'subscribe',tournamentId});
   while(queue.length) socket?.send(JSON.stringify(queue.shift()));
  };
  socket.onmessage=event=>{
   try{
    const message=JSON.parse(String(event.data)) as SyncEnvelope;
    if(('tournament' in message)&&message.tournament?.id===tournamentId) onTournament(message.tournament);
   }catch{}
  };
  socket.onerror=()=>onStatus('offline');
  socket.onclose=()=>{open=false;onStatus('offline');};
 }catch{
  onStatus('offline');
 }
 return {
  publish:(tournament:Tournament)=>send({type:'publish',tournamentId,tournament}),
  close:()=>{open=false;socket?.close();}
 };
}
