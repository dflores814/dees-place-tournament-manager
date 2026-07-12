import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tournament } from '@/domain/types';
const KEY='dees-place-tournaments-v1';
export async function loadTournaments():Promise<Tournament[]>{
 try{const raw=await AsyncStorage.getItem(KEY); return raw?JSON.parse(raw) as Tournament[]:[];}catch{return [];}
}
export async function saveTournaments(items:readonly Tournament[]):Promise<void>{await AsyncStorage.setItem(KEY,JSON.stringify(items));}
