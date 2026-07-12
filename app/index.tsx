import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, ImageBackground, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTournaments } from '@/store/TournamentProvider';
import { AppSettings, eightBallSinglesRaceChart, skillLevels, useAppSettings } from '@/store/AppSettingsProvider';
import { Button } from '@/components/Button';
import { getTheme, theme } from '@/theme';
import { BracketType } from '@/domain/types';
import { labelForBracket } from '@/domain/tournament';

const bracketChoices:BracketType[]=['16-single','16-double','16-modified-single','32-single','32-double','32-modified-single'];

export default function Home(){
 const {items,hydrated,create,remove}=useTournaments();
 const {settings,updateSetting,resetSettings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const [selecting,setSelecting]=useState(false);
 const [opening,setOpening]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [choice,setChoice]=useState<BracketType>('16-single');
 const [pendingDelete,setPendingDelete]=useState<{id:string;name:string}|null>(null);
 if(!hydrated)return <View style={[s.loading,{backgroundColor:colors.bg}]}><ActivityIndicator color={colors.green}/><Text style={[s.muted,{color:colors.muted}]}>Loading tournaments...</Text></View>;
 const running=items.find(item=>item.status==='active');
 const createSelected=()=>{const tournament=create('New Tournament',choice);setSelecting(false);router.push(`/tournament/${tournament.id}`);};
 return <ImageBackground source={require('../assets/screen-background.png')} resizeMode="cover" style={[s.screen,{backgroundColor:colors.bg}]}>
  <View style={[s.neonWash,{backgroundColor:settings.appearance==='light'?'rgba(245,250,241,.62)':'rgba(2,14,3,.55)'}]}/>
  <View style={[s.phoneFrame,{borderColor:colors.border,backgroundColor:settings.appearance==='light'?'rgba(255,255,255,.86)':'rgba(0,0,0,.78)'}]}>
   <View style={s.homeBody}>
    <Image source={require('../assets/dees-place-logo.png')} resizeMode="contain" style={s.logo}/>
    <View style={s.headingBlock}>
     <Text style={[s.headingTop,{color:settings.appearance==='light'?'#172316':'#f0f0f0'}]}>TOURNAMENT</Text>
     <Text style={s.headingBottom}>MANAGER</Text>
    </View>
    <View style={s.homeActions}>
     <Button title="CREATE TOURNAMENT" onPress={()=>setSelecting(true)} style={s.primaryHomeButton} textStyle={s.primaryHomeText}/>
     <Button title="LOAD TOURNAMENT" variant="secondary" onPress={()=>setOpening(true)} style={[s.secondaryHomeButton,{backgroundColor:settings.appearance==='light'?'rgba(255,255,255,.65)':'rgba(0,0,0,.35)',borderColor:colors.green}]} textStyle={[s.secondaryHomeText,{color:colors.text}]}/>
     <Button title="SCAN QR" variant="secondary" onPress={()=>router.push('/scan-qr')} style={[s.secondaryHomeButton,{backgroundColor:settings.appearance==='light'?'rgba(255,255,255,.65)':'rgba(0,0,0,.35)',borderColor:colors.green}]} textStyle={[s.secondaryHomeText,{color:colors.text}]}/>
     {running&&<Button title="RETURN TO RUNNING TOURNAMENT" onPress={()=>router.push(`/tournament/${running.id}`)} style={s.primaryHomeButton} textStyle={s.primaryHomeText}/>}
    </View>
   </View>
   <View style={s.bottomNav}>
    <Pressable onPress={()=>setSettingsOpen(true)} style={s.settingsNav}><Text style={[s.navIcon,{color:colors.green}]}>*</Text><Text style={[s.navText,{color:colors.green}]}>SETTINGS</Text></Pressable>
   </View>
  </View>
  <Modal transparent visible={selecting} animationType="fade" onRequestClose={()=>setSelecting(false)}>
   <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
    <View style={[s.selectWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
     <Text style={[s.modalHeading,{color:colors.text}]}>New Tournament</Text>
     <View style={s.fieldset}>
      <Text style={[s.legend,{backgroundColor:colors.panel,color:colors.green}]}>Brackets</Text>
      <View style={s.choiceGrid}>{bracketChoices.map(type=><Button key={type} title={`${choice===type?'(x)':'( )'} ${labelForBracket(type)}`} variant={choice===type?'primary':'secondary'} onPress={()=>setChoice(type)} style={s.choice} textStyle={choice===type?s.choiceActiveText:s.choiceText}/>)}</View>
     </View>
     <View style={s.modalActions}><Button title="OK" onPress={createSelected}/><Button title="Home" variant="secondary" onPress={()=>setSelecting(false)}/></View>
    </View>
   </View>
  </Modal>
  <Modal transparent visible={opening} animationType="fade" onRequestClose={()=>setOpening(false)}>
   <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
    <View style={[s.openWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
     <Text style={[s.modalHeading,{color:colors.text}]}>Load Tournament</Text>
     <FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={s.savedList} ListEmptyComponent={<Text style={[s.muted,{color:colors.muted}]}>No saved tournaments yet.</Text>} renderItem={({item})=><View style={[s.savedItem,{backgroundColor:colors.panel2,borderColor:colors.green}]}><View style={s.savedText}><Text style={[s.itemTitle,{color:colors.text}]}>{item.name}</Text><Text style={[s.muted,{color:colors.muted}]}>{labelForBracket(item.bracketType??'16-double')} | {item.players.length}/{item.capacity??16} players | {item.status}</Text></View><Button title="Open" variant="secondary" onPress={()=>{setOpening(false);router.push(`/tournament/${item.id}`);}}/><Button title="Delete" variant="danger" onPress={()=>setPendingDelete({id:item.id,name:item.name})}/></View>}/>
     <View style={s.modalActions}><Button title="Close" variant="secondary" onPress={()=>setOpening(false)}/></View>
    </View>
   </View>
  </Modal>
  <Modal transparent visible={!!pendingDelete} animationType="fade" onRequestClose={()=>setPendingDelete(null)}>
   <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
    <View style={[s.confirmWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
     <Text style={[s.modalHeading,{color:colors.text}]}>Delete Tournament?</Text>
     <Text style={[s.confirmText,{color:colors.text}]}>Are you sure you want to delete {pendingDelete?.name ?? 'this tournament'}?</Text>
     <View style={s.modalActions}>
      <Button title="Yes" variant="danger" onPress={()=>{if(pendingDelete) remove(pendingDelete.id);setPendingDelete(null);}}/>
      <Button title="No" variant="secondary" onPress={()=>setPendingDelete(null)}/>
     </View>
    </View>
   </View>
  </Modal>
  <SettingsModal visible={settingsOpen} settings={settings} updateSetting={updateSetting} resetSettings={resetSettings} close={()=>setSettingsOpen(false)}/>
 </ImageBackground>;
}

function SettingsModal({visible,settings,updateSetting,resetSettings,close}:{visible:boolean;settings:AppSettings;updateSetting:<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>void;resetSettings:()=>void;close:()=>void}){
 const colors=getTheme(settings.appearance);
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <View style={[s.modalShade,{backgroundColor:colors.shade}]}>
   <View style={[s.settingsWindow,{backgroundColor:colors.panel,borderColor:colors.green}]}>
    <Text style={[s.modalHeading,{color:colors.text}]}>Settings</Text>
    <FlatList data={[
     {section:'Appearance',rows:[<SettingChoice key="appearance" label="Theme" value={settings.appearance} options={[['dark','Dark'],['light','Light']]} onChange={value=>updateSetting('appearance',value as AppSettings['appearance'])}/>]},
     {section:'Security',rows:[<SettingToggle key="directorLock" label="Tournament director lock" value={settings.directorLock} onChange={value=>updateSetting('directorLock',value)}/>]},
     {section:'Match Flow',rows:[
      <SettingChoice key="participantPermission" label="Participant permissions" value={settings.participantPermission} options={[['report-winners','Report winners'],['view-only','View only'],['director-approval','Director approval']]} onChange={value=>updateSetting('participantPermission',value as AppSettings['participantPermission'])}/>,
      <SettingChoice key="matchConfirmation" label="Match confirmation" value={settings.matchConfirmation} options={[['single-tap','Single tap'],['director-approval','Director approval'],['both-players','Both players']]} onChange={value=>updateSetting('matchConfirmation',value as AppSettings['matchConfirmation'])}/>,
      <SettingChoice key="raceChartMode" label="Match race chart" value={settings.raceChartMode} options={[['off','Off'],['side-race','Side Race'],['8-ball-singles','8-Ball Singles'],['custom','Custom']]} onChange={value=>updateSetting('raceChartMode',value as AppSettings['raceChartMode'])}/>,
      <SettingToggle key="skillLevelsEnabled" label="Custom race skill levels" value={settings.skillLevelsEnabled} onChange={value=>updateSetting('skillLevelsEnabled',value)}/>,
      <RaceChartEditor key="raceChartEditor" settings={settings} updateSetting={updateSetting}/>,
      <SettingChoice key="randomizeDefault" label="Randomize at start" value={settings.randomizeDefault} options={[['ask','Always ask'],['randomize','Randomize'],['keep-order','Keep order']]} onChange={value=>updateSetting('randomizeDefault',value as AppSettings['randomizeDefault'])}/>,
      <SettingChoice key="byeHandling" label="Bye handling" value={settings.byeHandling} options={[['editable','Editable byes'],['auto-advance','Auto advance']]} onChange={value=>updateSetting('byeHandling',value as AppSettings['byeHandling'])}/>
     ]},
     {section:'Bracket Display',rows:[
      <SettingChoice key="playerDisplay" label="Player display" value={settings.playerDisplay} options={[['full-name','Full name'],['initials','Initials'],['seed-name','Seed + name']]} onChange={value=>updateSetting('playerDisplay',value as AppSettings['playerDisplay'])}/>,
      <SettingChoice key="bracketZoomDefault" label="Bracket zoom" value={settings.bracketZoomDefault} options={[['fit','Fit screen'],['last-used','Last used'],['full-size','Full size']]} onChange={value=>updateSetting('bracketZoomDefault',value as AppSettings['bracketZoomDefault'])}/>,
      <SettingChoice key="readyMatchColor" label="Ready match color" value={settings.readyMatchColor} options={[['red','Red'],['green','Green'],['gold','Gold']]} onChange={value=>updateSetting('readyMatchColor',value as AppSettings['readyMatchColor'])}/>
     ]},
     {section:'Tournament Details',rows:[
      <SettingChoice key="autoSave" label="Auto-save" value={settings.autoSave} options={[['every-change','Every change'],['every-match','Every match'],['manual','Manual only']]} onChange={value=>updateSetting('autoSave',value as AppSettings['autoSave'])}/>,
      <SettingChoice key="qrTimeout" label="QR/session timeout" value={settings.qrTimeout} options={[['tournament-end','Tournament end'],['one-hour','1 hour'],['never','Never']]} onChange={value=>updateSetting('qrTimeout',value as AppSettings['qrTimeout'])}/>,
      <SettingChoice key="payoutPreset" label="Payout setup" value={settings.payoutPreset} options={[['top-8','Top 8'],['top-4','Top 4'],['custom','Custom']]} onChange={value=>updateSetting('payoutPreset',value as AppSettings['payoutPreset'])}/>,
      <SettingToggle key="tableLabels" label="Table/location labels" value={settings.tableLabels} onChange={value=>updateSetting('tableLabels',value)}/>,
      <SettingToggle key="notifications" label="Notifications/sounds" value={settings.notifications} onChange={value=>updateSetting('notifications',value)}/>
     ]},
     {section:'Data',rows:[
      <SettingChoice key="exportFormat" label="Export format" value={settings.exportFormat} options={[['json','JSON'],['csv','CSV']]} onChange={value=>updateSetting('exportFormat',value as AppSettings['exportFormat'])}/>,
      <View key="data-actions" style={s.settingsRow}><Button title="Export Soon" variant="secondary" disabled onPress={()=>{}}/><Button title="Reset Settings" variant="danger" onPress={resetSettings}/></View>
     ]}
    ]} keyExtractor={item=>item.section} contentContainerStyle={s.settingsBody} renderItem={({item})=><View style={s.settingsSection}><Text style={[s.settingsLabel,{color:colors.text}]}>{item.section}</Text>{item.rows}</View>}/>
    <View style={s.modalActions}><Button title="Close" variant="secondary" onPress={close}/></View>
   </View>
  </View>
 </Modal>;
}

function SettingToggle({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <View style={[s.settingItem,{borderColor:colors.border}]}><Text style={[s.settingTitle,{color:colors.text}]}>{label}</Text><Button title={value?'On':'Off'} variant={value?'primary':'secondary'} onPress={()=>onChange(!value)} style={s.settingButton}/></View>;
}

function SettingChoice({label,value,options,onChange}:{label:string;value:string;options:[string,string][];onChange:(value:string)=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <View style={[s.settingItem,{borderColor:colors.border}]}><Text style={[s.settingTitle,{color:colors.text}]}>{label}</Text><View style={s.choicePills}>{options.map(([id,text])=><Button key={id} title={text} variant={value===id?'primary':'secondary'} onPress={()=>onChange(id)} style={s.choicePill} textStyle={s.choicePillText}/>)}</View></View>;
}

function RaceChartEditor({settings,updateSetting}:{settings:AppSettings;updateSetting:<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>void}){
 const colors=getTheme(settings.appearance);
 if(settings.raceChartMode==='off') return <Text style={[s.raceHelp,{color:colors.muted}]}>Race chart is off. Matches will not show custom race information.</Text>;
 if(settings.raceChartMode==='side-race'){
  const updateSide=(side:keyof AppSettings['sideRaceTargets'],value:string)=>{
   const number=Number(value.replace(/\D/g,''));
   updateSetting('sideRaceTargets',{...settings.sideRaceTargets,[side]:Number.isFinite(number)&&number>0?Math.min(99,number):1});
  };
  return <View style={[s.raceEditor,{borderColor:colors.border}]}>
   <Text style={[s.raceHelp,{color:colors.muted}]}>Set race lengths by bracket side. Winners side and finals can be longer than the losers side.</Text>
   <View style={s.sideRaceGrid}>
    <SideRaceInput label="Winner side" value={settings.sideRaceTargets.upper} onChange={value=>updateSide('upper',value)}/>
    <SideRaceInput label="Loser side" value={settings.sideRaceTargets.lower} onChange={value=>updateSide('lower',value)}/>
    <SideRaceInput label="Finals" value={settings.sideRaceTargets.final} onChange={value=>updateSide('final',value)}/>
   </View>
  </View>;
 }
 const chart=settings.raceChartMode==='custom'?settings.customRaceChart:eightBallSinglesRaceChart;
 const updateCell=(key:string,value:string)=>updateSetting('customRaceChart',{...settings.customRaceChart,[key]:value});
 return <View style={[s.raceEditor,{borderColor:colors.border}]}>
  <Text style={[s.raceHelp,{color:colors.muted}]}>{settings.raceChartMode==='custom'?'Edit each cell as Player/Opponent games, like 3/4.':'8-Ball Singles preset shown for skill levels 2-7.'}</Text>
  <View style={s.raceRow}><Text style={[s.raceHeader,s.raceCorner,{color:colors.green,borderColor:colors.border}]}>You</Text>{skillLevels.map(level=><Text key={level} style={[s.raceHeader,{color:colors.text,borderColor:colors.border}]}>Opp {level}</Text>)}</View>
  {skillLevels.map(row=><View key={row} style={s.raceRow}>
   <Text style={[s.raceHeader,s.raceCorner,{color:colors.green,borderColor:colors.border}]}>{row}</Text>
   {skillLevels.map(col=>{
    const key=`${row}-${col}`;
    return settings.raceChartMode==='custom'
     ? <TextInput key={key} value={settings.customRaceChart[key]??''} onChangeText={value=>updateCell(key,value)} style={[s.raceInput,{backgroundColor:colors.input,color:colors.inputText,borderColor:colors.border}]}/>
     : <Text key={key} style={[s.raceCell,{color:colors.text,borderColor:colors.border}]}>{chart[key]}</Text>;
   })}
  </View>)}
 </View>;
}

function SideRaceInput({label,value,onChange}:{label:string;value:number;onChange:(value:string)=>void}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 return <View style={s.sideRaceItem}><Text style={[s.settingTitle,{color:colors.text}]}>{label}</Text><TextInput value={String(value)} onChangeText={onChange} keyboardType="number-pad" style={[s.sideRaceInput,{backgroundColor:colors.input,color:colors.inputText,borderColor:colors.border}]}/></View>;
}

const s=StyleSheet.create({
 loading:{flex:1,backgroundColor:'#020502',alignItems:'center',justifyContent:'center',gap:12},
 screen:{flex:1,backgroundColor:'#020502',alignItems:'center',justifyContent:'center',padding:18},
 neonWash:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(2,14,3,.55)'},
 phoneFrame:{width:'100%',maxWidth:420,minHeight:'92%',borderColor:'#384039',borderWidth:2,borderRadius:28,backgroundColor:'rgba(0,0,0,.78)',overflow:'hidden',paddingHorizontal:22,paddingTop:12,paddingBottom:16,justifyContent:'space-between'},
 homeBody:{flex:1,alignItems:'center',justifyContent:'center',gap:18},
 logo:{width:270,height:270,maxWidth:'90%'},
 headingBlock:{alignItems:'center',marginTop:-8},
 headingTop:{color:'#f0f0f0',fontSize:30,fontWeight:'900',letterSpacing:1},
 headingBottom:{color:theme.green,fontSize:30,fontWeight:'900',letterSpacing:2,textShadowColor:theme.green,textShadowRadius:10},
 homeActions:{width:'100%',gap:12,marginTop:8},
 primaryHomeButton:{width:'100%',minHeight:54,borderRadius:6,backgroundColor:theme.green},
 primaryHomeText:{color:'#fff',fontSize:13,fontWeight:'900'},
 secondaryHomeButton:{width:'100%',minHeight:54,borderRadius:6,backgroundColor:'rgba(0,0,0,.35)',borderColor:theme.green,borderWidth:1},
 secondaryHomeText:{color:'#fff',fontSize:13,fontWeight:'900'},
 bottomNav:{height:48,alignItems:'center',justifyContent:'flex-end'},
 settingsNav:{alignItems:'center',gap:2,minWidth:78},
 navIcon:{color:theme.green,fontSize:16,fontWeight:'900'},
 navText:{color:theme.green,fontSize:8,fontWeight:'800'},
 muted:{color:'#bcbcbc'},
 modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.68)',alignItems:'center',justifyContent:'center',padding:14},
 selectWindow:{width:'100%',maxWidth:460,borderColor:theme.green,borderWidth:1,borderRadius:10,backgroundColor:'#020602',overflow:'hidden',paddingBottom:22},
 openWindow:{width:'100%',maxWidth:620,maxHeight:'82%',borderColor:theme.green,borderWidth:1,borderRadius:10,backgroundColor:'#020602',overflow:'hidden',paddingBottom:12},
 confirmWindow:{width:'100%',maxWidth:390,borderColor:theme.green,borderWidth:1,borderRadius:10,backgroundColor:'#020602',overflow:'hidden',paddingBottom:18},
 confirmText:{color:'#fff',fontSize:14,lineHeight:20,paddingHorizontal:18,paddingVertical:18},
 settingsWindow:{width:'100%',maxWidth:560,maxHeight:'86%',borderColor:theme.green,borderWidth:1,borderRadius:10,backgroundColor:'#020602',overflow:'hidden',paddingBottom:18},
 settingsBody:{padding:18,gap:14},
 settingsSection:{gap:8},
 settingsLabel:{color:'#fff',fontSize:13,fontWeight:'900'},
 settingsRow:{flexDirection:'row',gap:10},
 settingItem:{gap:6,borderColor:'rgba(95,234,40,.25)',borderWidth:1,padding:10,borderRadius:6},
 settingTitle:{color:'#fff',fontSize:12,fontWeight:'800'},
 settingButton:{alignSelf:'flex-start',minHeight:34},
 choicePills:{flexDirection:'row',flexWrap:'wrap',gap:6},
 choicePill:{minHeight:32,paddingHorizontal:10,paddingVertical:6,borderRadius:5},
 choicePillText:{fontSize:11},
 raceEditor:{borderColor:'rgba(95,234,40,.25)',borderWidth:1,padding:8,gap:4,borderRadius:6},
 raceHelp:{color:'#bcbcbc',fontSize:11,lineHeight:16},
 raceRow:{flexDirection:'row',alignItems:'center'},
 raceHeader:{width:58,minHeight:30,color:'#fff',fontSize:10,fontWeight:'900',textAlign:'center',textAlignVertical:'center',borderColor:'#244024',borderWidth:1,paddingVertical:7},
 raceCorner:{width:44,color:theme.green},
 raceCell:{width:58,minHeight:30,color:'#fff',fontSize:12,textAlign:'center',textAlignVertical:'center',borderColor:'#244024',borderWidth:1,paddingVertical:6},
 raceInput:{width:58,minHeight:30,backgroundColor:'#fff',color:'#000',fontSize:12,textAlign:'center',borderColor:'#244024',borderWidth:1,padding:3},
 sideRaceGrid:{flexDirection:'row',gap:8,flexWrap:'wrap'},
 sideRaceItem:{minWidth:120,flex:1,gap:5},
 sideRaceInput:{minHeight:38,borderWidth:1,borderRadius:5,paddingHorizontal:10,fontSize:16,fontWeight:'900',textAlign:'center'},
 modalHeading:{color:'#fff',fontSize:20,fontWeight:'900',paddingHorizontal:18,paddingTop:18},
 fieldset:{borderColor:theme.green,borderWidth:1,margin:18,padding:14},
 legend:{position:'absolute',top:-10,left:8,backgroundColor:'#020602',color:theme.green,fontSize:12,paddingHorizontal:4},
 choiceGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 choice:{width:'48%',minHeight:34,paddingVertical:4,borderRadius:4,alignItems:'flex-start'},
 choiceText:{fontSize:11},
 choiceActiveText:{fontSize:11,color:'#fff'},
 modalActions:{flexDirection:'row',justifyContent:'flex-end',gap:8,paddingHorizontal:18},
 savedList:{padding:12,gap:10},
 savedItem:{borderColor:theme.green,borderWidth:1,backgroundColor:'#050505',padding:10,flexDirection:'row',alignItems:'center',gap:8},
 savedText:{flex:1},
 itemTitle:{color:'#fff',fontWeight:'800',fontSize:16}
});
