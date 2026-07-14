import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tournament, TournamentHistoryEntry } from '@/domain/types';
const KEY='dees-place-tournaments-v1';
const HISTORY_KEY='dees-place-tournament-history-v1';
export async function loadTournaments():Promise<Tournament[]>{
 try{const raw=await AsyncStorage.getItem(KEY); return raw?JSON.parse(raw) as Tournament[]:[];}catch{return [];}
}
export async function saveTournaments(items:readonly Tournament[]):Promise<void>{await AsyncStorage.setItem(KEY,JSON.stringify(items));}

export async function loadTournamentHistory():Promise<TournamentHistoryEntry[]>{
 try{const raw=await AsyncStorage.getItem(HISTORY_KEY); return raw?JSON.parse(raw) as TournamentHistoryEntry[]:[];}catch{return [];}
}
export async function saveTournamentHistory(items:readonly TournamentHistoryEntry[]):Promise<void>{await AsyncStorage.setItem(HISTORY_KEY,JSON.stringify(items));}
