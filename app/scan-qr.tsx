import { useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { useAppSettings } from '@/store/AppSettingsProvider';
import { getTheme, theme } from '@/theme';

function tournamentPathFromQr(data:string){
 const cleaned=data.trim();
 const patterns=[
  /deesplacetm:\/\/\/tournament\/([^?/#]+)/i,
  /deesplacetm:\/\/tournament\/([^?/#]+)/i,
  /\/tournament\/([^?/#]+)/i
 ];
 const match=patterns.map(pattern=>cleaned.match(pattern)).find(Boolean);
 if(!match?.[1]) return null;
 const token=cleaned.match(/[?&]join=([^&#]+)/i)?.[1];
 if(!token) return null;
 return {pathname:'/tournament/[id]' as const,params:{id:decodeURIComponent(match[1]),role:'participant',joinToken:decodeURIComponent(token)}};
}

export default function ScanQrScreen(){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const [permission,requestPermission]=useCameraPermissions();
 const [scanned,setScanned]=useState(false);
 const [message,setMessage]=useState('Scan a tournament QR code to join the live bracket.');
 const handleScan=({data}:BarcodeScanningResult)=>{
  if(scanned)return;
  const path=tournamentPathFromQr(data);
  if(!path){
   setScanned(true);
   setMessage('That QR code is not an active director join code.');
   return;
  }
  setScanned(true);
  router.replace(path);
 };
 if(!permission){
  return <View style={[s.page,{backgroundColor:colors.bg}]}><Text style={[s.title,{color:colors.text}]}>Scan QR</Text><Text style={[s.message,{color:colors.muted}]}>Checking camera permission...</Text></View>;
 }
 if(!permission.granted){
  return <View style={[s.page,{backgroundColor:colors.bg}]}><Text style={[s.title,{color:colors.text}]}>Scan QR</Text><Text style={[s.message,{color:colors.muted}]}>Camera access is needed to scan tournament QR codes.</Text><Button title="Allow Camera" onPress={requestPermission}/><Button title="Home" variant="secondary" onPress={()=>router.replace('/')}/></View>;
 }
 return <View style={[s.page,{backgroundColor:colors.bg}]}>
  <View style={s.header}><Text style={[s.title,{color:colors.text}]}>Scan QR</Text><Button title="Home" variant="secondary" onPress={()=>router.replace('/')}/></View>
  <View style={s.cameraWrap}>
   <CameraView style={s.camera} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={scanned?undefined:handleScan}/>
   <View style={s.frame}/>
  </View>
  <Text style={[s.message,{color:colors.muted}]}>{message}</Text>
  {scanned&&<Button title="Scan Again" variant="secondary" onPress={()=>{setScanned(false);setMessage('Scan a tournament QR code to join the live bracket.');}}/>}
 </View>;
}

const s=StyleSheet.create({
 page:{flex:1,padding:18,gap:14,justifyContent:'center'},
 header:{position:'absolute',top:18,left:18,right:18,zIndex:2,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 title:{fontSize:24,fontWeight:'900'},
 message:{fontSize:14,textAlign:'center',lineHeight:20},
 cameraWrap:{height:360,borderRadius:12,overflow:'hidden',borderColor:theme.green,borderWidth:2,backgroundColor:'#000'},
 camera:{flex:1},
 frame:{position:'absolute',left:'15%',right:'15%',top:'22%',bottom:'22%',borderColor:theme.green,borderWidth:3,borderRadius:10}
});
