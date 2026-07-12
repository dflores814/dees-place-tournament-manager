import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TournamentProvider } from '@/store/TournamentProvider';
import { AppSettingsProvider, useAppSettings } from '@/store/AppSettingsProvider';
import { getTheme } from '@/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AppShell(){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <TournamentProvider><StatusBar style={settings.appearance==='light'?'dark':'light'}/><Stack screenOptions={{headerStyle:{backgroundColor:colors.panel},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.bg}}}><Stack.Screen name="index" options={{headerShown:false}}/><Stack.Screen name="scan-qr" options={{headerShown:false}}/><Stack.Screen name="tournament/[id]" options={{headerShown:false}}/></Stack></TournamentProvider>;
}

export default function Root(){return <SafeAreaProvider><AppSettingsProvider><AppShell/></AppSettingsProvider></SafeAreaProvider>;}
