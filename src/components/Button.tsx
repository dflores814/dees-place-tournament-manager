import { Pressable,Text,StyleSheet,StyleProp,TextStyle,ViewStyle } from 'react-native';
import { getTheme, theme } from '@/theme';
import { useAppSettings } from '@/store/AppSettingsProvider';
export function Button({title,onPress,variant='primary',disabled=false,style,textStyle}:{title:string;onPress:()=>void;variant?:'primary'|'secondary'|'danger';disabled?:boolean;style?:StyleProp<ViewStyle>;textStyle?:StyleProp<TextStyle>}){
 const {settings}=useAppSettings();
 const colors=getTheme(settings.appearance);
 const themedVariant=variant==='primary'?{backgroundColor:colors.gold}:variant==='danger'?{backgroundColor:colors.red}:{backgroundColor:colors.panel2,borderWidth:1,borderColor:colors.border};
 return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[styles.base,themedVariant,disabled&&styles.disabled,pressed&&{opacity:.8},style]}><Text style={[styles.text,{color:variant==='primary'||variant==='danger'?'#fff':colors.text},textStyle]}>{title}</Text></Pressable>;
}
const styles=StyleSheet.create({base:{minHeight:44,paddingHorizontal:16,paddingVertical:11,borderRadius:10,alignItems:'center',justifyContent:'center'},primary:{backgroundColor:theme.gold},secondary:{backgroundColor:theme.panel2,borderWidth:1,borderColor:theme.border},danger:{backgroundColor:theme.red},disabled:{opacity:.4},text:{color:theme.text,fontWeight:'800'}});
