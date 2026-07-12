import type { PropsWithChildren } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { theme } from '@/theme';

export function BrandedBackground({ children }: PropsWithChildren) {
  return (
    <ImageBackground
      source={require('../../assets/screen-background.png')}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.image}
    >
      <View style={styles.overlay}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: theme.bg },
  image: { opacity: 0.72 },
  overlay: { flex: 1, backgroundColor: 'rgba(8,10,13,0.72)' },
});
