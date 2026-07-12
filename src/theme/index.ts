export const darkTheme={bg:'#050805',panel:'rgba(14,22,16,0.94)',panel2:'rgba(20,32,23,0.96)',text:'#F6FFF7',muted:'#A8B5AA',gold:'#77FF38',green:'#5FEA28',red:'#E25757',border:'#315B2F',input:'#FFFFFF',inputText:'#000000',shade:'rgba(0,0,0,.68)'} as const;
export const lightTheme={bg:'#F5FAF1',panel:'rgba(255,255,255,0.96)',panel2:'rgba(236,246,231,0.98)',text:'#10210F',muted:'#516250',gold:'#45B81F',green:'#2DAA12',red:'#D44747',border:'#8BBD7D',input:'#FFFFFF',inputText:'#10210F',shade:'rgba(18,32,16,.36)'} as const;
export const theme=darkTheme;
export function getTheme(appearance:'dark'|'light'){
 return appearance==='light'?lightTheme:darkTheme;
}
