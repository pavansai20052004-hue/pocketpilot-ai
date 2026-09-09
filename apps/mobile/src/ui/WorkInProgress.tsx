import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { workPhaseContent, type WorkPhase } from './workProgress';

export function WorkInProgress({ phase }: { readonly phase: WorkPhase }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const content = workPhaseContent(phase);

  useEffect(() => {
    pulse.setValue(0);
    spin.setValue(0);
    setElapsedSeconds(0);
    setMessageIndex(0);

    const pulseAnimation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: 950, toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 950, toValue: 0, useNativeDriver: true }),
    ]));
    const spinAnimation = Animated.loop(Animated.timing(spin, { duration: 4400, toValue: 1, useNativeDriver: true }));
    const elapsedTimer = setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    const messageTimer = setInterval(() => setMessageIndex((value) => (value + 1) % content.messages.length), 4500);

    pulseAnimation.start();
    spinAnimation.start();
    return () => {
      pulseAnimation.stop();
      spinAnimation.stop();
      clearInterval(elapsedTimer);
      clearInterval(messageTimer);
    };
  }, [content.messages.length, phase, pulse, spin]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.72] });

  return (
    <View accessibilityLabel={`${content.title}. ${content.messages[messageIndex]}`} accessibilityRole="progressbar" accessibilityValue={{ text: `${elapsedSeconds} seconds elapsed` }} style={styles.card}>
      <View style={styles.visual}>
        <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: coreScale }] }]} />
        <Animated.View style={[styles.orbit, { transform: [{ rotate: rotation }] }]}><View style={styles.satellite} /></Animated.View>
        <Animated.View style={[styles.core, { transform: [{ scale: coreScale }] }]}><Text style={styles.coreText}>{content.icon}</Text></Animated.View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{content.eyebrow}</Text>
        <Text style={styles.title}>{content.title}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{content.messages[messageIndex]}</Text>
        <View style={styles.meta}><View style={styles.liveDot} /><Text style={styles.elapsed}>{elapsedSeconds}s elapsed · {content.footer}</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 166, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 17, padding: 18, borderWidth: 1, borderColor: '#526B2E', borderRadius: 20, backgroundColor: '#10180E' },
  visual: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 72, height: 72, borderRadius: 36, backgroundColor: '#C8FF3D' },
  orbit: { position: 'absolute', width: 94, height: 94, borderRadius: 47, borderWidth: 1, borderColor: '#6C8A3B' },
  satellite: { position: 'absolute', top: -4, left: 40, width: 9, height: 9, borderRadius: 5, backgroundColor: '#F0C96B', shadowColor: '#F0C96B', shadowOpacity: 0.65, shadowRadius: 6 },
  core: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C8FF3D', backgroundColor: '#0A1008' },
  coreText: { color: '#C8FF3D', fontSize: 15, fontWeight: '900', letterSpacing: 0.6 },
  copy: { flex: 1, gap: 7 },
  eyebrow: { color: '#C8FF3D', fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  title: { color: '#F2F6EE', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  message: { minHeight: 36, color: '#A0AA9B', fontSize: 11, lineHeight: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C8FF3D' },
  elapsed: { flex: 1, color: '#798474', fontSize: 9, lineHeight: 13 },
});
