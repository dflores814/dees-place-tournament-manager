import { View,Text,Pressable,StyleSheet } from 'react-native';
import { Player,ResolvedMatch } from '@/domain/types';
import { theme } from '@/theme';
export function MatchCard({match,players,onWinner}:{match:ResolvedMatch;players:readonly Player[];onWinner:(id:string)=>void}){
 const name=(id:string|null)=>players.find(p=>p.id===id)?.name??'TBD';
 return <View style={s.card}><Text style={s.label}>#{match.number} · {match.label}</Text>{match.playerIds.map((id,i)=><Pressable key={i} disabled={!id||match.complete} onPress={()=>id&&onWinner(id)} style={[s.slot,match.winnerId===id&&s.winner]}><Text numberOfLines={1} style={[s.name,!id&&s.tbd]}>{name(id)}</Text>{id&&!match.complete&&<Text style={s.tap}>Tap winner</Text>}</Pressable>)}</View>;
}
const s=StyleSheet.create({card:{backgroundColor:theme.panel,borderColor:theme.border,borderWidth:1,borderRadius:12,padding:10,gap:7},label:{color:theme.muted,fontSize:12,fontWeight:'700'},slot:{backgroundColor:theme.panel2,borderRadius:8,paddingHorizontal:10,paddingVertical:9,flexDirection:'row',justifyContent:'space-between'},winner:{borderColor:theme.green,borderWidth:2},name:{color:theme.text,fontWeight:'700',maxWidth:'70%'},tbd:{color:theme.muted},tap:{color:theme.gold,fontSize:11}});
