import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import {
  AGENT_EVENT_NAMES,
  DEBUG_STATES,
  type SystemStatus,
} from '@pocketpilot/shared-types';

const foundationStatus: SystemStatus = {
  service: 'PocketPilot Agent',
  version: '0.1.0',
  environment: 'foundation',
  components: {
    api: 'ready',
    workspace: 'not_configured',
    model: 'not_configured',
  },
};

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={styles.markText}>P</Text>
          </View>
          <Text style={styles.eyebrow}>POCKETPILOT AI</Text>
          <View style={styles.phasePill}>
            <Text style={styles.phaseText}>FOUNDATION</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.title}>See it. Say it.{`\n`}Fix it.</Text>
          <Text style={styles.subtitle}>
            Your phone-first engineering copilot, designed to inspect, approve, and verify fixes on your laptop.
          </Text>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionLabel}>PHASE A READY</Text>
          <Text style={styles.actionTitle}>Product shell is running</Text>
          <Text style={styles.actionCopy}>
            Error capture and debugging controls unlock after the safety foundations are approved.
          </Text>
          <View style={styles.contractRow}>
            <Text style={styles.contractValue}>{DEBUG_STATES.length}</Text>
            <Text style={styles.contractLabel}>workflow states</Text>
            <View style={styles.divider} />
            <Text style={styles.contractValue}>{AGENT_EVENT_NAMES.length}</Text>
            <Text style={styles.contractLabel}>typed events</Text>
          </View>
        </View>

        <View style={styles.statusPanel}>
          <Text style={styles.panelLabel}>SYSTEM STATUS</Text>
          <StatusLine label="Mobile client" value="Ready" active />
          <StatusLine label={foundationStatus.service} value="Awaiting connection" />
          <StatusLine label="Selected workspace" value="Not configured" />
          <StatusLine label="Local AI" value="Not configured" />
        </View>

        <Text style={styles.footer}>Local-first • Approval-gated • Built for Android</Text>
      </View>
    </SafeAreaView>
  );
}

function StatusLine({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <View style={styles.statusLine}>
      <View style={[styles.dot, active && styles.dotActive]} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, active && styles.statusValueActive]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#070A0F' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#0A0D0A', fontWeight: '900', fontSize: 17 },
  eyebrow: { color: '#F5F7F2', letterSpacing: 1.4, fontWeight: '800', fontSize: 13, flex: 1 },
  phasePill: { borderWidth: 1, borderColor: '#293126', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  phaseText: { color: '#8D9A88', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  hero: { marginTop: 58, marginBottom: 34 },
  title: { color: '#F5F7F2', fontSize: 52, lineHeight: 55, letterSpacing: -2.5, fontWeight: '800' },
  subtitle: { color: '#929A91', fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 340 },
  actionCard: { backgroundColor: '#11160F', borderColor: '#273220', borderWidth: 1, borderRadius: 24, padding: 22 },
  actionLabel: { color: '#C8FF3D', letterSpacing: 1.2, fontSize: 11, fontWeight: '800' },
  actionTitle: { color: '#F5F7F2', fontSize: 23, fontWeight: '700', marginTop: 9 },
  actionCopy: { color: '#899084', fontSize: 14, lineHeight: 21, marginTop: 8 },
  contractRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 22, paddingTop: 18, borderTopColor: '#242A21', borderTopWidth: 1 },
  contractValue: { color: '#F5F7F2', fontWeight: '800', fontSize: 20, marginRight: 6 },
  contractLabel: { color: '#7E8779', fontSize: 12 },
  divider: { width: 1, height: 18, backgroundColor: '#30372D', marginHorizontal: 14 },
  statusPanel: { marginTop: 20, paddingHorizontal: 4 },
  panelLabel: { color: '#5F695B', letterSpacing: 1.3, fontSize: 10, fontWeight: '800', marginBottom: 8 },
  statusLine: { minHeight: 36, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3C433A', marginRight: 10 },
  dotActive: { backgroundColor: '#C8FF3D' },
  statusLabel: { color: '#A5ADA1', fontSize: 13, flex: 1 },
  statusValue: { color: '#60695C', fontSize: 12 },
  statusValueActive: { color: '#C8FF3D' },
  footer: { color: '#4F574B', fontSize: 11, textAlign: 'center', marginTop: 'auto' },
});
