import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  AnalysisRecord,
  DebugSession,
  PatchWorkflowView,
  ProviderHealth,
} from '@pocketpilot/shared-types';

import { analyzeText, getAnalysis } from './src/api/analysis';
import { ApiClient, ApiError, normalizeBaseUrl } from './src/api/client';
import { pairDevice } from './src/api/devices';
import { decidePatch, generatePatch, getPatch } from './src/api/patches';
import { captureSession, createSession, getEvents, getSession, listSessions } from './src/api/sessions';
import { getProviderHealth, getWorkspace } from './src/api/workspaces';
import { clearConnection, loadConnection, saveConnection, type StoredConnection } from './src/auth/secureStorage';
import { LocalWebSocketBridge, type DeviceBridge } from './src/bridge/DeviceBridge';
import { initialWorkflowState, pipelineStatus, workflowReducer, type WorkflowState } from './src/state/workflow';

type Tab = 'HOME' | 'DEBUG' | 'SESSIONS' | 'SETTINGS';
const DEMO_ERROR = `Traceback (most recent call last):
  File "tests/test_user_service.py", line 5, in test_missing_user
    assert get_user_name({}) == "Unknown"
  File "user_service.py", line 2, in get_user_name
    return users[user_id]["name"]
KeyError: 42`;

export default function App() {
  const [stored, setStored] = useState<StoredConnection | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void loadConnection().then(setStored).finally(() => setBooting(false));
  }, []);

  if (booting) return <Splash />;
  if (stored === null) return <PairingScreen onPaired={setStored} />;
  return <ConnectedApp connection={stored} onDisconnect={() => setStored(null)} />;
}

function ConnectedApp({ connection, onDisconnect }: { connection: StoredConnection; onDisconnect: () => void }) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState);
  const [tab, setTab] = useState<Tab>('HOME');
  const [errorText, setErrorText] = useState('');
  const [languageHint, setLanguageHint] = useState('');
  const [provider, setProvider] = useState<ProviderHealth | null>(null);
  const [history, setHistory] = useState<ReadonlyArray<DebugSession>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const bridgeRef = useRef<DeviceBridge | null>(null);
  const client = useMemo(() => new ApiClient({ baseUrl: connection.serverAddress, token: connection.token }), [connection]);
  const fade = useRef(new Animated.Value(0)).current;

  const reconcile = useCallback(async (sessionId: string) => {
    try {
      const session = await getSession(client, sessionId);
      dispatch({ type: 'SESSION', session });
      if (['ROOT_CAUSE_FOUND', 'PATCH_GENERATED', 'AWAITING_APPROVAL', 'PATCH_APPLYING', 'TESTING', 'SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(session.state)) {
        void getAnalysis(client, sessionId).then((analysis) => dispatch({ type: 'ANALYSIS', analysis })).catch(() => undefined);
      }
      if (['PATCH_GENERATED', 'AWAITING_APPROVAL', 'PATCH_APPLYING', 'TESTING', 'SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(session.state)) {
        void getPatch(client, sessionId).then((patch) => dispatch({ type: 'PATCH', patch })).catch(() => undefined);
      }
    } catch (requestError) {
      handleError(requestError, setError);
    }
  }, [client]);

  useEffect(() => {
    const bridge = new LocalWebSocketBridge(connection.serverAddress, connection.token, {
      onStatus: (status) => {
        dispatch({ type: 'CONNECTION', status });
        if (status === 'UNAUTHORIZED') setError('Device access expired or was revoked. Pair this phone again.');
      },
      onMessage: (message) => {
        if (message.type === 'snapshot') {
          dispatch(message.patch === undefined
            ? { type: 'SNAPSHOT', session: message.session, events: message.events }
            : { type: 'SNAPSHOT', session: message.session, events: message.events, patch: message.patch });
          void reconcile(message.session.id);
        } else {
          dispatch({ type: 'EVENT', event: message.event });
          void reconcile(message.event.session_id);
        }
      },
    });
    bridgeRef.current = bridge;
    return () => { bridge.disconnect(); bridgeRef.current = null; };
  }, [connection, reconcile]);

  const refreshDashboard = useCallback(async () => {
    try {
      const [workspace, health, sessions] = await Promise.all([
        getWorkspace(client), getProviderHealth(client), listSessions(client),
      ]);
      dispatch({ type: 'WORKSPACE', workspace });
      dispatch({ type: 'CONNECTION', status: 'CONNECTED' });
      setProvider(health);
      setHistory(sessions.sessions);
      setError(null);
    } catch (requestError) {
      handleError(requestError, setError);
    }
  }, [client]);

  useEffect(() => { void refreshDashboard(); }, [refreshDashboard]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        bridgeRef.current?.reconnect();
        void refreshDashboard();
        if (state.session !== null) void reconcile(state.session.id);
      }
    });
    return () => subscription.remove();
  }, [reconcile, refreshDashboard, state.session]);
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [fade, state.session?.state]);

  async function startAnalysis() {
    if (!errorText.trim()) { setError('Paste an error or stack trace first.'); return; }
    if (state.workspace === null) { setError('Select an active workspace on the PocketPilot laptop dashboard.'); return; }
    setBusy('analyze'); setError(null); setTab('DEBUG');
    try {
      const created = await createSession(client, conciseTitle(errorText));
      const captured = await captureSession(client, created.session);
      dispatch({ type: 'SESSION', session: captured.session });
      dispatch({ type: 'EVENT', event: captured.event });
      bridgeRef.current?.connect(captured.session.id, captured.event.sequence);
      const result = await analyzeText(client, captured.session, errorText.trim(), languageHint);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'ANALYSIS', analysis: result.analysis });
      await refreshHistory();
    } catch (requestError) { handleError(requestError, setError); }
    finally { setBusy(null); }
  }

  async function requestPatch() {
    if (state.session === null) return;
    setBusy('patch'); setError(null);
    try {
      const result = await generatePatch(client, state.session);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'PATCH', patch: result.workflow });
    } catch (requestError) { handleError(requestError, setError); }
    finally { setBusy(null); }
  }

  async function retryAnalysis() {
    if (state.session === null || state.session.state !== 'FAILED' || state.session.retry_count >= 2) return;
    if (!errorText.trim()) { setError('Paste the original error again before retrying this historical session.'); return; }
    setBusy('retry'); setError(null);
    try {
      const result = await analyzeText(client, state.session, errorText.trim(), languageHint);
      dispatch({ type: 'SNAPSHOT', session: result.session, events: [], patch: null });
      dispatch({ type: 'ANALYSIS', analysis: result.analysis });
      await refreshHistory();
    } catch (requestError) { handleError(requestError, setError); }
    finally { setBusy(null); }
  }

  async function patchAction(action: 'approve' | 'reject' | 'rollback') {
    if (state.session === null || state.patch === null) return;
    setBusy(action); setError(null);
    try {
      const result = await decidePatch(client, state.session, state.patch, action);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'PATCH', patch: result.workflow });
      await refreshHistory();
    } catch (requestError) {
      if (action === 'rollback') {
        const detail = requestError instanceof Error ? requestError.message : 'A newer file change prevents rollback.';
        setError(`ROLLBACK BLOCKED — ${detail}`);
      } else handleError(requestError, setError);
    }
    finally { setBusy(null); }
  }

  function confirmRollback() {
    Alert.alert('Restore the original files?', 'Restore files to their state before this PocketPilot fix?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: () => { void patchAction('rollback'); } },
    ]);
  }

  async function refreshHistory() {
    const sessions = await listSessions(client);
    setHistory(sessions.sessions);
  }

  async function openSession(sessionId: string) {
    setBusy('history'); setError(null); setTab('DEBUG');
    try {
      const [session, events] = await Promise.all([getSession(client, sessionId), getEvents(client, sessionId)]);
      dispatch({ type: 'SNAPSHOT', session, events: events.events });
      bridgeRef.current?.connect(session.id, session.last_event_sequence);
      await reconcile(session.id);
    } catch (requestError) { handleError(requestError, setError); }
    finally { setBusy(null); }
  }

  async function disconnectDevice() {
    bridgeRef.current?.disconnect();
    await clearConnection();
    onDisconnect();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.app}>
        <Header connection={state.connection} />
        {error !== null && <ErrorBanner message={error} onRetry={() => void refreshDashboard()} />}
        <Animated.View style={[styles.content, { opacity: fade }]}>
          {tab === 'HOME' && <HomeScreen state={state} provider={provider} onPaste={() => setTab('DEBUG')} currentSession={state.session} />}
          {tab === 'DEBUG' && (
            <DebugScreen
              analysis={state.analysis}
              busy={busy}
              demoMode={demoMode}
              errorText={errorText}
              languageHint={languageHint}
              onApprove={() => void patchAction('approve')}
              onChangeError={setErrorText}
              onChangeLanguage={setLanguageHint}
              onGenerate={() => void requestPatch()}
              onLoadDemo={() => { setErrorText(DEMO_ERROR); setLanguageHint('Python'); }}
              onReject={() => void patchAction('reject')}
              onRetry={() => void retryAnalysis()}
              onReset={() => { bridgeRef.current?.disconnect(); dispatch({ type: 'RESET' }); void refreshDashboard(); }}
              onRollback={confirmRollback}
              onStart={() => void startAnalysis()}
              patch={state.patch}
              session={state.session}
              steps={pipelineStatus(state)}
              workspaceReady={state.workspace !== null}
            />
          )}
          {tab === 'SESSIONS' && <SessionsScreen sessions={history} busy={busy === 'history'} onOpen={(id) => void openSession(id)} onRefresh={() => void refreshHistory()} />}
          {tab === 'SETTINGS' && <SettingsScreen connection={connection} demoMode={demoMode} onDemoMode={setDemoMode} onDisconnect={() => void disconnectDevice()} />}
        </Animated.View>
        <TabBar active={tab} onSelect={setTab} />
      </View>
    </SafeAreaView>
  );
}

function PairingScreen({ onPaired }: { onPaired: (connection: StoredConnection) => void }) {
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState("Pavan's iQOO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true); setError(null);
    try {
      const normalizedAddress = normalizeBaseUrl(address);
      const client = new ApiClient({ baseUrl: normalizedAddress, timeoutMs: 8000 });
      const paired = await pairDevice(client, code, name);
      const connection = { serverAddress: normalizedAddress, token: paired.token, deviceId: paired.device.device_id, displayName: paired.device.display_name };
      await saveConnection(connection);
      onPaired(connection);
    } catch (requestError) { handleError(requestError, setError); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.pairingPage} keyboardShouldPersistTaps="handled">
        <Brand />
        <View style={styles.pairingHero}>
          <Text style={styles.heroTitle}>Your laptop.{`\n`}In your pocket.</Text>
          <Text style={styles.heroCopy}>Connect securely over the same Wi-Fi network. Your repository never leaves the laptop.</Text>
        </View>
        <Card>
          <Eyebrow>CONNECT TO LAPTOP</Eyebrow>
          <Field accessibilityLabel="Laptop address" autoCapitalize="none" keyboardType="url" onChangeText={setAddress} placeholder="192.168.1.23:8000" value={address} />
          <Field accessibilityLabel="Six digit pairing code" keyboardType="number-pad" maxLength={7} onChangeText={setCode} placeholder="482 917" value={code} />
          <Field accessibilityLabel="Device display name" onChangeText={setName} placeholder="My iQOO" value={name} />
          {error !== null && <Text style={styles.inlineError}>{error}</Text>}
          <PrimaryButton accessibilityLabel="Connect to PocketPilot laptop" disabled={busy || !address.trim() || code.replace(/\s/g, '').length !== 6} label={busy ? 'CONNECTING…' : 'CONNECT'} onPress={() => void connect()} />
        </Card>
        <Text style={styles.helper}>On the laptop, open Device Connection and generate a pairing code. Both devices must be on the same network.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ state, provider, onPaste, currentSession }: { state: WorkflowState; provider: ProviderHealth | null; onPaste: () => void; currentSession: DebugSession | null }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollPage}>
      <Text style={styles.homeTitle}>See it. Say it.{`\n`}Fix it.</Text>
      <StatusCard label="LAPTOP" value={state.connection === 'CONNECTED' ? 'CONNECTED' : state.connection} good={state.connection === 'CONNECTED'} />
      <Card>
        <Eyebrow>ACTIVE WORKSPACE</Eyebrow>
        <Text style={styles.cardTitle}>{state.workspace?.name ?? 'Not selected on laptop'}</Text>
        <Text style={styles.cardCopy}>{state.workspace === null ? 'Select a workspace from PocketPilot Desktop Agent.' : `${state.workspace.languages.map((item) => item.name).join(' · ') || 'Project'} · ${state.workspace.detected_commands[0]?.label ?? 'No validation command'}`}</Text>
        <View style={styles.statusRow}><StatusDot good={state.workspace !== null} /><Text style={styles.statusText}>{state.workspace === null ? 'WAITING FOR LAPTOP' : 'READY'}</Text></View>
      </Card>
      <Card>
        <Eyebrow>LOCAL AI</Eyebrow>
        <Text style={styles.cardTitle}>{provider?.provider ?? 'Checking provider'}</Text>
        <View style={styles.statusRow}><StatusDot good={provider?.available === true} /><Text style={styles.statusText}>{provider?.available === true ? 'READY' : 'UNAVAILABLE'}</Text></View>
      </Card>
      <View style={styles.actionGrid}>
        <DisabledAction title="SCAN ERROR" subtitle="Coming in Milestone 6" />
        <Pressable accessibilityLabel="Paste an error" onPress={onPaste} style={styles.actionCard}><Text style={styles.actionIcon}>⌘</Text><Text style={styles.actionTitle}>PASTE ERROR</Text><Text style={styles.actionSubtitle}>Start a real debug session</Text></Pressable>
        <DisabledAction title="SPEAK COMMAND" subtitle="Coming later" />
      </View>
      {currentSession !== null && <Card><Eyebrow>CURRENT SESSION</Eyebrow><Text style={styles.cardTitle}>{currentSession.title}</Text><StateBadge state={currentSession.state} /></Card>}
    </ScrollView>
  );
}

function DebugScreen(props: {
  analysis: AnalysisRecord | null; busy: string | null; demoMode: boolean; errorText: string; languageHint: string;
  onApprove: () => void; onChangeError: (value: string) => void; onChangeLanguage: (value: string) => void;
  onGenerate: () => void; onLoadDemo: () => void; onReject: () => void; onReset: () => void; onRollback: () => void;
  onRetry: () => void; onStart: () => void; patch: PatchWorkflowView | null; session: DebugSession | null;
  steps: ReadonlyArray<{ label: string; complete: boolean; active: boolean }>; workspaceReady: boolean;
}) {
  if (props.session === null) {
    return (
      <ScrollView contentContainerStyle={styles.scrollPage} keyboardShouldPersistTaps="handled">
        <Eyebrow>DEBUG NEW ISSUE</Eyebrow><Text style={styles.screenTitle}>Paste what went wrong.</Text>
        {!props.workspaceReady && <Text style={styles.warningText}>Workspace controlled by laptop. Select one in PocketPilot Desktop Agent.</Text>}
        <TextInput accessibilityLabel="Error or stack trace" multiline onChangeText={props.onChangeError} placeholder="Paste an exception, traceback, or compiler error…" placeholderTextColor="#586056" style={styles.errorInput} textAlignVertical="top" value={props.errorText} />
        <Field accessibilityLabel="Optional language hint" onChangeText={props.onChangeLanguage} placeholder="Language hint (optional)" value={props.languageHint} />
        {props.demoMode && <SecondaryButton label="LOAD DEMO ERROR" onPress={props.onLoadDemo} />}
        <PrimaryButton accessibilityLabel="Analyze error" disabled={props.busy !== null || !props.workspaceReady} label={props.busy === 'analyze' ? 'ANALYZING…' : 'ANALYZE'} onPress={props.onStart} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scrollPage}>
      <View style={styles.titleRow}><View><Eyebrow>LIVE DEBUG SESSION</Eyebrow><Text style={styles.screenTitle}>{props.session.title}</Text></View><StateBadge state={props.session.state} /></View>
      <Pipeline steps={props.steps} />
      {props.analysis !== null && <RootCause analysis={props.analysis} busy={props.busy !== null} canGenerate={props.session.state === 'ROOT_CAUSE_FOUND'} onGenerate={props.onGenerate} />}
      {props.patch !== null && <PatchPanel busy={props.busy} onApprove={props.onApprove} onReject={props.onReject} onRetry={props.onRetry} onRollback={props.onRollback} patch={props.patch} session={props.session} />}
      {['SUCCESS', 'ROLLED_BACK'].includes(props.session.state) && <SecondaryButton label="DONE" onPress={props.onReset} />}
    </ScrollView>
  );
}

function Pipeline({ steps }: { steps: ReadonlyArray<{ label: string; complete: boolean; active: boolean }> }) {
  return <Card><Eyebrow>PIPELINE</Eyebrow>{steps.map((step) => <View key={step.label} style={styles.pipelineRow}><Text style={[styles.pipelineIcon, step.complete && styles.successText, step.active && styles.activeText]}>{step.complete ? '✓' : step.active ? '●' : '○'}</Text><Text style={[styles.pipelineLabel, (step.complete || step.active) && styles.brightText]}>{step.label}</Text></View>)}</Card>;
}

function RootCause({ analysis, busy, canGenerate, onGenerate }: { analysis: AnalysisRecord; busy: boolean; canGenerate: boolean; onGenerate: () => void }) {
  const result = analysis.result;
  return <Card><View style={styles.titleRow}><Eyebrow>ROOT CAUSE</Eyebrow><Badge label={`${result.confidence} CONFIDENCE`} tone={result.confidence === 'HIGH' ? 'good' : 'warn'} /></View><Text style={styles.cardTitle}>{result.summary}</Text><Text style={styles.rootCause}>{result.root_cause}</Text><Info label="LOCATION" value={`${result.likely_file ?? 'Not established'}${result.likely_line === null ? '' : ` · line ${result.likely_line}`}${result.likely_symbol === null ? '' : ` · ${result.likely_symbol}`}`} /><Info label="WHY" value={result.explanation} /><Info label="REPAIR STRATEGY" value={result.repair_strategy} />{result.evidence.map((item) => <View key={`${item.relative_path}:${item.line ?? 0}`} style={styles.evidence}><Text style={styles.codeText}>{item.relative_path}{item.line === null ? '' : `:${item.line}`}</Text><Text style={styles.evidenceText}>{item.observation}</Text></View>)}{canGenerate && <PrimaryButton accessibilityLabel="Generate fix" disabled={busy} label={busy ? 'GENERATING FIX…' : 'GENERATE FIX'} onPress={onGenerate} />}</Card>;
}

function PatchPanel({ busy, onApprove, onReject, onRetry, onRollback, patch, session }: { busy: string | null; onApprove: () => void; onReject: () => void; onRetry: () => void; onRollback: () => void; patch: PatchWorkflowView; session: DebugSession }) {
  const [openFiles, setOpenFiles] = useState<ReadonlyArray<string>>(patch.proposal.files.map((file) => file.relative_path));
  const awaiting = patch.status === 'AWAITING_APPROVAL';
  const rollback = patch.rollback_status === 'AVAILABLE' && ['VERIFIED', 'FAILED'].includes(patch.status);
  if (session.state === 'SUCCESS') return <SuccessPanel patch={patch} onRollback={onRollback} />;
  if (session.state === 'FAILED') return <FailurePanel patch={patch} retryCount={session.retry_count} onRetry={onRetry} onRollback={onRollback} />;
  if (session.state === 'ROLLED_BACK') return <Card><Text style={styles.heroStatus}>↩ FIX UNDONE</Text><Text style={styles.cardCopy}>Files restored to their pre-fix state.</Text></Card>;
  return <Card><View style={styles.titleRow}><View><Eyebrow>PATCH REVIEW</Eyebrow><Text style={styles.cardTitle}>{patch.proposal.title}</Text></View><Badge label={`${patch.validation.risk} RISK`} tone={patch.validation.risk === 'LOW' ? 'good' : patch.validation.risk === 'MEDIUM' ? 'warn' : 'bad'} /></View><Text style={styles.cardCopy}>{patch.proposal.summary}</Text><View style={styles.metrics}><Metric label="FILES" value={String(patch.validation.files_changed)} /><Metric label="ADDED" value={`+${patch.validation.additions}`} /><Metric label="REMOVED" value={`-${patch.validation.deletions}`} /></View>{patch.proposal.files.map((file) => { const open = openFiles.includes(file.relative_path); return <View key={file.relative_path} style={styles.diffCard}><Pressable accessibilityLabel={`Toggle diff for ${file.relative_path}`} onPress={() => setOpenFiles(open ? openFiles.filter((path) => path !== file.relative_path) : [...openFiles, file.relative_path])} style={styles.diffHeader}><Text style={styles.codeText}>{file.relative_path}</Text><Text style={styles.diffCount}>+{file.additions} −{file.deletions} {open ? '⌃' : '⌄'}</Text></Pressable>{open && <ScrollView horizontal><View style={styles.diffBody}>{file.unified_diff.split('\n').map((line, index) => <Text key={`${index}-${line}`} style={[styles.diffLine, line.startsWith('+') && styles.diffAdd, line.startsWith('-') && styles.diffRemove]}>{line || ' '}</Text>)}</View></ScrollView>}</View>; })}{awaiting && <><Text style={styles.approvalNote}>PocketPilot will modify {patch.validation.files_changed} file{patch.validation.files_changed === 1 ? '' : 's'} and run the approved project validation command.</Text><PrimaryButton accessibilityLabel="Approve fix" disabled={busy !== null} label={busy === 'approve' ? 'APPLYING & TESTING…' : 'APPROVE FIX'} onPress={onApprove} /><SecondaryButton label="REJECT" onPress={onReject} /></>}{['APPLYING', 'APPLIED'].includes(patch.status) || session.state === 'TESTING' ? <View style={styles.progressBox}><ActivityIndicator color="#C8FF3D" /><Text style={styles.cardCopy}>{session.state === 'TESTING' ? 'Running approved tests…' : 'Applying approved fix…'}</Text></View> : null}{rollback && <SecondaryButton label="UNDO FIX" onPress={onRollback} />}</Card>;
}

function SuccessPanel({ patch, onRollback }: { patch: PatchWorkflowView; onRollback: () => void }) {
  const [detail, setDetail] = useState<'NONE' | 'EXPLANATION' | 'DIFF'>('NONE');
  return <Card accent><Text style={[styles.heroStatus, styles.successText]}>✓ FIX VERIFIED</Text><Text style={styles.cardCopy}>{patch.test_result?.detail ?? 'The approved validation command passed.'}</Text><View style={styles.metrics}><Metric label="TESTS" value="PASSED" /><Metric label="CHANGED" value={`${patch.application?.files_changed ?? patch.validation.files_changed} file${patch.validation.files_changed === 1 ? '' : 's'}`} /><Metric label="TIME" value={`${patch.test_result?.duration_ms ?? 0}ms`} /></View><View style={styles.successActions}><SecondaryButton label="EXPLAIN FIX" onPress={() => setDetail(detail === 'EXPLANATION' ? 'NONE' : 'EXPLANATION')} /><SecondaryButton label="VIEW DIFF" onPress={() => setDetail(detail === 'DIFF' ? 'NONE' : 'DIFF')} /></View>{detail === 'EXPLANATION' && <Info label="WHY THIS FIX WORKS" value={`${patch.proposal.rationale}\n\n${patch.proposal.expected_effect}`} />}{detail === 'DIFF' && patch.proposal.files.map((file) => <View key={file.relative_path} style={styles.diffCard}><View style={styles.diffHeader}><Text style={styles.codeText}>{file.relative_path}</Text></View><ScrollView horizontal><View style={styles.diffBody}>{file.unified_diff.split('\n').map((line, index) => <Text key={`${index}-${line}`} style={[styles.diffLine, line.startsWith('+') && styles.diffAdd, line.startsWith('-') && styles.diffRemove]}>{line || ' '}</Text>)}</View></ScrollView></View>)}<SecondaryButton label="UNDO FIX" onPress={onRollback} /></Card>;
}

function FailurePanel({ patch, retryCount, onRetry, onRollback }: { patch: PatchWorkflowView; retryCount: number; onRetry: () => void; onRollback: () => void }) {
  return <Card><Text style={[styles.heroStatus, styles.failureText]}>✕ FIX NOT VERIFIED</Text><Info label="VALIDATION COMMAND" value={patch.test_result?.command?.display_command ?? 'No safe validation command'} /><Info label="RESULT" value={patch.test_result?.detail ?? 'Validation failed.'} /><Text style={styles.warningText}>{retryCount >= 2 ? 'Maximum retry count reached.' : 'You can undo this fix, then try another analysis.'}</Text>{retryCount < 2 && <SecondaryButton label="TRY ANOTHER FIX" onPress={onRetry} />}{patch.rollback_status === 'AVAILABLE' && <SecondaryButton label="UNDO FIX" onPress={onRollback} />}</Card>;
}

function SessionsScreen({ sessions, busy, onOpen, onRefresh }: { sessions: ReadonlyArray<DebugSession>; busy: boolean; onOpen: (id: string) => void; onRefresh: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollPage}><View style={styles.titleRow}><View><Eyebrow>SESSION HISTORY</Eyebrow><Text style={styles.screenTitle}>Recent debugging</Text></View><Pressable accessibilityLabel="Refresh sessions" onPress={onRefresh}><Text style={styles.link}>REFRESH</Text></Pressable></View>{busy && <ActivityIndicator color="#C8FF3D" />}{sessions.map((session) => <Pressable accessibilityLabel={`Open ${session.title}`} key={session.id} onPress={() => onOpen(session.id)} style={styles.sessionCard}><StateBadge state={session.state} /><View style={styles.sessionCopy}><Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text><Text style={styles.sessionTime}>{relativeTime(session.updated_at)}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}{sessions.length === 0 && <Text style={styles.emptyText}>No debugging sessions yet.</Text>}</ScrollView>;
}

function SettingsScreen({ connection, demoMode, onDemoMode, onDisconnect }: { connection: StoredConnection; demoMode: boolean; onDemoMode: (value: boolean) => void; onDisconnect: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollPage}><Eyebrow>SETTINGS</Eyebrow><Text style={styles.screenTitle}>Device connection</Text><Card><Info label="LAPTOP ADDRESS" value={connection.serverAddress} /><Info label="DEVICE" value={connection.displayName} /><Info label="DEVICE ID" value={connection.deviceId} /><Text style={styles.securityCopy}>The token is stored in Android secure storage. Source code, secrets, and rollback snapshots remain on the laptop.</Text><SecondaryButton label="DISCONNECT PHONE" onPress={onDisconnect} /></Card><Pressable accessibilityLabel="Toggle demo mode" onPress={() => onDemoMode(!demoMode)} style={styles.settingRow}><View><Text style={styles.settingTitle}>Demo Mode</Text><Text style={styles.cardCopy}>Shows a Load Demo Error action. Backend results stay real.</Text></View><Text style={[styles.toggle, demoMode && styles.toggleOn]}>{demoMode ? 'ON' : 'OFF'}</Text></Pressable><Card><Eyebrow>COMING NEXT</Eyebrow><Text style={styles.cardTitle}>Camera Vision Debugger</Text><Text style={styles.cardCopy}>Camera and OCR are intentionally disabled until Milestone 6. Voice remains planned for a later milestone.</Text></Card></ScrollView>;
}

function Header({ connection }: { connection: string }) { return <View style={styles.header}><Brand /><View style={styles.connectionPill}><StatusDot good={connection === 'CONNECTED'} /><Text style={styles.connectionText}>{connection}</Text></View></View>; }
function Brand() { return <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>P</Text></View><View><Text style={styles.brandName}>POCKETPILOT</Text><Text style={styles.brandSub}>PHONE CONTROL</Text></View></View>; }
function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) { const tabs: ReadonlyArray<[Tab, string]> = [['HOME', '⌂'], ['DEBUG', '⌘'], ['SESSIONS', '≡'], ['SETTINGS', '⚙']]; return <View style={styles.tabBar}>{tabs.map(([tab, icon]) => <Pressable accessibilityLabel={tab} key={tab} onPress={() => onSelect(tab)} style={styles.tab}><Text style={[styles.tabIcon, active === tab && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active === tab && styles.tabActive]}>{tab}</Text></Pressable>)}</View>; }
function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) { return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <Text style={styles.eyebrow}>{children}</Text>; }
function Field(props: React.ComponentProps<typeof TextInput>) { return <TextInput {...props} placeholderTextColor="#586056" style={styles.field} />; }
function PrimaryButton({ accessibilityLabel, disabled, label, onPress }: { accessibilityLabel: string; disabled: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryText}>{label}</Text></Pressable>; }
function Badge({ label, tone }: { label: string; tone: 'good' | 'warn' | 'bad' }) { return <Text style={[styles.badge, tone === 'good' ? styles.badgeGood : tone === 'warn' ? styles.badgeWarn : styles.badgeBad]}>{label}</Text>; }
function StateBadge({ state }: { state: DebugSession['state'] }) { const good = ['SUCCESS', 'ROOT_CAUSE_FOUND'].includes(state); const bad = state === 'FAILED'; return <Badge label={state.replaceAll('_', ' ')} tone={good ? 'good' : bad ? 'bad' : 'warn'} />; }
function StatusDot({ good }: { good: boolean }) { return <View style={[styles.dot, good && styles.dotGood]} />; }
function StatusCard({ label, value, good }: { label: string; value: string; good: boolean }) { return <View style={styles.statusCard}><Eyebrow>{label}</Eyebrow><View style={styles.statusRow}><StatusDot good={good} /><Text style={styles.statusLarge}>{value}</Text></View></View>; }
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Eyebrow>{label}</Eyebrow><Text style={styles.infoValue}>{value}</Text></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function DisabledAction({ title, subtitle }: { title: string; subtitle: string }) { return <View accessibilityLabel={`${title}, ${subtitle}`} style={[styles.actionCard, styles.disabledAction]}><Text style={styles.actionIcon}>○</Text><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View>; }
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) { return <View style={styles.errorBanner}><View style={styles.errorCopy}><Text style={styles.errorTitle}>CONNECTION OR REQUEST ISSUE</Text><Text style={styles.errorMessage}>{message}</Text></View><Pressable accessibilityLabel="Try again" onPress={onRetry}><Text style={styles.retry}>TRY AGAIN</Text></Pressable></View>; }
function Splash() { return <SafeAreaView style={styles.splash}><StatusBar style="light" /><Brand /><ActivityIndicator color="#C8FF3D" size="large" /></SafeAreaView>; }

function handleError(error: unknown, setError: (message: string) => void): void {
  if (error instanceof ApiError && error.status === 401) setError('Device session expired. Pair this phone again from the laptop dashboard.');
  else setError(error instanceof Error ? error.message : 'PocketPilot could not complete the request.');
}
function conciseTitle(text: string): string { const first = text.split('\n').find((line) => line.trim())?.trim() ?? 'Mobile debug issue'; return first.slice(0, 80); }
function relativeTime(value: string): string { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'Now'; if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`; return `${Math.floor(seconds / 86400)} day ago`; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#070A0F' }, app: { flex: 1, backgroundColor: '#070A0F' }, content: { flex: 1 }, splash: { flex: 1, padding: 28, justifyContent: 'space-between', backgroundColor: '#070A0F' },
  header: { minHeight: 68, paddingHorizontal: 20, borderBottomColor: '#202720', borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center' }, markText: { color: '#090D08', fontWeight: '900', fontSize: 18 }, brandName: { color: '#F4F7F1', fontSize: 12, letterSpacing: 1.5, fontWeight: '900' }, brandSub: { color: '#60695D', fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  connectionPill: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: '#2A3327', borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 7 }, connectionText: { color: '#9BA596', fontSize: 9, fontWeight: '800' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#596058' }, dotGood: { backgroundColor: '#C8FF3D' },
  pairingPage: { flexGrow: 1, padding: 24, backgroundColor: '#070A0F' }, pairingHero: { marginTop: 62, marginBottom: 32 }, heroTitle: { color: '#F4F7F1', fontSize: 47, lineHeight: 49, letterSpacing: -2.2, fontWeight: '800' }, heroCopy: { color: '#899287', fontSize: 15, lineHeight: 23, marginTop: 16 }, helper: { color: '#687166', fontSize: 12, lineHeight: 19, textAlign: 'center', margin: 20 },
  scrollPage: { padding: 20, paddingBottom: 42, gap: 14 }, homeTitle: { color: '#F4F7F1', fontSize: 43, lineHeight: 46, letterSpacing: -2, fontWeight: '800', marginVertical: 20 }, screenTitle: { color: '#F4F7F1', fontSize: 29, lineHeight: 34, letterSpacing: -1, fontWeight: '800', marginTop: 7, marginBottom: 10 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  card: { backgroundColor: '#0E140F', borderWidth: 1, borderColor: '#273025', borderRadius: 20, padding: 18, gap: 12 }, cardAccent: { borderColor: '#617D32', backgroundColor: '#10190D' }, statusCard: { minHeight: 82, borderRadius: 18, padding: 17, backgroundColor: '#11170F', borderWidth: 1, borderColor: '#2B3528' }, eyebrow: { color: '#778172', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, cardTitle: { color: '#EEF2EA', fontSize: 20, lineHeight: 25, fontWeight: '700' }, cardCopy: { color: '#869083', fontSize: 12, lineHeight: 18 }, rootCause: { color: '#BCC6B7', fontSize: 14, lineHeight: 22 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 }, statusText: { color: '#AAB4A4', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, statusLarge: { color: '#E7ECE3', fontSize: 17, fontWeight: '800' },
  field: { minHeight: 52, borderWidth: 1, borderColor: '#30392D', borderRadius: 12, backgroundColor: '#080C09', color: '#E5EAE1', paddingHorizontal: 15, fontSize: 14 }, errorInput: { minHeight: 220, borderWidth: 1, borderColor: '#30392D', borderRadius: 14, backgroundColor: '#080C09', color: '#DCE3D8', padding: 16, fontSize: 13, lineHeight: 20, fontFamily: 'monospace' }, inlineError: { color: '#FF9A85', fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center', marginTop: 2 }, primaryText: { color: '#0B1008', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, secondaryButton: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#465043', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#CCD4C8', fontSize: 11, fontWeight: '800', letterSpacing: 1 }, disabled: { opacity: 0.42 }, pressed: { transform: [{ scale: 0.99 }] },
  actionGrid: { gap: 10 }, actionCard: { minHeight: 104, borderRadius: 17, borderWidth: 1, borderColor: '#30402A', backgroundColor: '#11180F', padding: 16, justifyContent: 'center' }, disabledAction: { opacity: 0.48, backgroundColor: '#0B0F0C' }, actionIcon: { color: '#C8FF3D', fontSize: 20, marginBottom: 7 }, actionTitle: { color: '#EEF2EA', fontSize: 12, letterSpacing: 1, fontWeight: '900' }, actionSubtitle: { color: '#727B6E', fontSize: 11, marginTop: 4 },
  pipelineRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#222A20' }, pipelineIcon: { color: '#586056', width: 26, fontSize: 15 }, pipelineLabel: { color: '#697266', fontSize: 12 }, brightText: { color: '#D3DACF' }, successText: { color: '#C8FF3D' }, activeText: { color: '#F0C96B' }, failureText: { color: '#FF8B75' },
  badge: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, fontSize: 8, fontWeight: '900', letterSpacing: .7 }, badgeGood: { backgroundColor: '#203118', color: '#C8FF3D' }, badgeWarn: { backgroundColor: '#352B15', color: '#F0C96B' }, badgeBad: { backgroundColor: '#351B17', color: '#FF8B75' },
  info: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#252D23' }, infoValue: { color: '#AEB8AA', fontSize: 12, lineHeight: 19 }, evidence: { borderRadius: 10, backgroundColor: '#080C09', padding: 12, gap: 6 }, codeText: { color: '#C8FF3D', fontSize: 11, fontFamily: 'monospace' }, evidenceText: { color: '#808A7C', fontSize: 11, lineHeight: 17 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#273024', paddingVertical: 13 }, metric: { flex: 1 }, metricValue: { color: '#E9EEE5', fontSize: 13, fontWeight: '800' }, metricLabel: { color: '#657060', fontSize: 8, marginTop: 4, letterSpacing: 1 }, successActions: { gap: 9 },
  diffCard: { borderWidth: 1, borderColor: '#2B3428', borderRadius: 12, overflow: 'hidden', backgroundColor: '#070A08' }, diffHeader: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, diffCount: { color: '#A9C481', fontSize: 10 }, diffBody: { minWidth: 600, paddingVertical: 10 }, diffLine: { color: '#A6B0A1', fontSize: 10, lineHeight: 17, fontFamily: 'monospace', paddingHorizontal: 12 }, diffAdd: { color: '#C9EFB0', backgroundColor: '#182615' }, diffRemove: { color: '#F0A99E', backgroundColor: '#2A1714' }, approvalNote: { color: '#929B8E', fontSize: 11, lineHeight: 17 }, progressBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#111A0E' }, heroStatus: { color: '#EEF2EA', fontSize: 27, fontWeight: '900', letterSpacing: -.5 }, warningText: { color: '#E4BF6A', fontSize: 12, lineHeight: 19 },
  sessionCard: { minHeight: 76, padding: 14, borderWidth: 1, borderColor: '#283126', borderRadius: 15, backgroundColor: '#0E130F', flexDirection: 'row', alignItems: 'center', gap: 12 }, sessionCopy: { flex: 1 }, sessionTitle: { color: '#E4E9E0', fontSize: 13, fontWeight: '700' }, sessionTime: { color: '#687166', fontSize: 10, marginTop: 5 }, chevron: { color: '#87917F', fontSize: 25 }, link: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, emptyText: { color: '#687166', textAlign: 'center', marginTop: 60 },
  settingRow: { padding: 18, borderWidth: 1, borderColor: '#283126', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingTitle: { color: '#E8ECE4', fontSize: 15, fontWeight: '700' }, toggle: { color: '#7A8476', fontSize: 11, fontWeight: '900' }, toggleOn: { color: '#C8FF3D' }, securityCopy: { color: '#737D70', fontSize: 11, lineHeight: 18 },
  errorBanner: { margin: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#6A372E', backgroundColor: '#251512', flexDirection: 'row', alignItems: 'center', gap: 10 }, errorCopy: { flex: 1 }, errorTitle: { color: '#FF8B75', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, errorMessage: { color: '#D5A89F', fontSize: 10, lineHeight: 15, marginTop: 4 }, retry: { color: '#F0C96B', fontSize: 9, fontWeight: '900' },
  tabBar: { minHeight: 72, paddingBottom: 5, borderTopWidth: 1, borderTopColor: '#202720', backgroundColor: '#090D0A', flexDirection: 'row' }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }, tabIcon: { color: '#596258', fontSize: 17 }, tabLabel: { color: '#596258', fontSize: 8, fontWeight: '800', letterSpacing: .8 }, tabActive: { color: '#C8FF3D' },
});
