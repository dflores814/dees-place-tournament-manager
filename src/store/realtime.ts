import { Tournament } from '@/domain/types';

export type SyncStatus = 'unconfigured' | 'connecting' | 'connected' | 'offline';

type SyncEnvelope =
 | {type:'subscribe';tournamentId:string;joinToken?:string}
 | {type:'publish';tournamentId:string;tournament:Tournament;joinToken?:string}
 | {type:'snapshot'|'update'|'tournament';tournamentId?:string;tournament:Tournament};

export function syncUrl(){
 return process.env.EXPO_PUBLIC_SYNC_URL?.trim() || '';
}

export function realtimeConfigured(){
 return syncUrl().length>0;
}

export function openTournamentSync(tournamentId:string,onTournament:(tournament:Tournament)=>void,onStatus:(status:SyncStatus)=>void,joinToken?:string){
 const url=syncUrl();
 if(!url){onStatus('unconfigured');return {publish:()=>{},close:()=>{}};}
 let socket:WebSocket|null=null;
 let open=false;
 let closed=false;
 let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
 let reconnectAttempts=0;
 const queue:SyncEnvelope[]=[];
 const send=(message:SyncEnvelope)=>{
  if(socket&&open) socket.send(JSON.stringify(message));
  else queue.push(message);
 };
 const clearReconnect=()=>{
  if(reconnectTimer){
   clearTimeout(reconnectTimer);
   reconnectTimer=null;
  }
 };
 const scheduleReconnect=()=>{
  if(closed||reconnectTimer)return;
  const delay=Math.min(30000,1000*Math.pow(2,Math.min(reconnectAttempts,5)));
  reconnectAttempts+=1;
  reconnectTimer=setTimeout(()=>{
   reconnectTimer=null;
   connect();
  },delay);
 };
 const connect=()=>{
 try{
  onStatus('connecting');
  socket=new WebSocket(url);
  socket.onopen=()=>{
   open=true;
   reconnectAttempts=0;
   clearReconnect();
   onStatus('connected');
   send({type:'subscribe',tournamentId,joinToken});
   while(queue.length) socket?.send(JSON.stringify(queue.shift()));
  };
  socket.onmessage=event=>{
   try{
    const message=JSON.parse(String(event.data)) as SyncEnvelope;
    if(('tournament' in message)&&message.tournament?.id===tournamentId) onTournament(message.tournament);
   }catch{}
  };
  socket.onerror=()=>onStatus('offline');
  socket.onclose=()=>{open=false;socket=null;if(!closed){onStatus('offline');scheduleReconnect();}};
 }catch{
  onStatus('offline');
  scheduleReconnect();
 }
 };
 connect();
 return {
  publish:(tournament:Tournament)=>send({type:'publish',tournamentId,tournament,joinToken:tournament.settings.joinToken}),
  reconnect:()=>{
   if(closed)return;
   clearReconnect();
   open=false;
   const current=socket;
   socket=null;
   if(current){
    current.onclose=null;
    current.onerror=null;
    current.close();
   }
   connect();
  },
  close:()=>{closed=true;clearReconnect();open=false;socket?.close();}
 };
}
