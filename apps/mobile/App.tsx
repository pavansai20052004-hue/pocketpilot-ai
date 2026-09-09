import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  ActionSource,
  AnalysisRecord,
  DebugSession,
  DemoProject,
  ErrorInputType,
  PatchWorkflowView,
  PreDemoCheckResult,
  ProviderHealth,
  VisionInputSource,
} from '@pocketpilot/shared-types';

import { analyzeText, getAnalysis } from './src/api/analysis';
import { ApiClient, ApiError, normalizeBaseUrl } from './src/api/client';
import { pairDevice } from './src/api/devices';
import { getDemoReadiness, listDemos, prepareDemo, resetDemo, selectDemo } from './src/api/demos';
import { decidePatch, generatePatch, getPatch } from './src/api/patches';
import { captureSession, createSession, getEvents, getSession, listSessions } from './src/api/sessions';
import { getProviderHealth, getWorkspace } from './src/api/workspaces';
import { clearConnection, loadConnection, saveConnection, type StoredConnection } from './src/auth/secureStorage';
import { LocalWebSocketBridge, type DeviceBridge } from './src/bridge/DeviceBridge';
import { initialWorkflowState, pipelineStatus, workflowReducer, type WorkflowState } from './src/state/workflow';
import { resolveWorkPhase, workPhaseContent, type WorkPhase } from './src/ui/workProgress';
import { VisionScanner } from './src/vision/VisionScanner';
import { VoiceActionExecutor } from './src/voice/actionExecutor';
import type { SpeechCapability, VoiceExecutionResult, VoiceIntent, VoiceSessionContext } from './src/voice/contracts';
import {
  formatFixResponse,
  formatLocationResponse,
  formatRootCauseResponse,
  formatSessionResponse,
  formatTestResponse,
} from './src/voice/responseFormatter';
import { VoiceSheet } from './src/voice/VoiceSheet';

type Tab = 'HOME' | 'DEBUG' | 'SESSIONS' | 'SETTINGS';

const ANDROID_STATUS_BAR_INSET = Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 24 : 0;
const DEMO_ERROR = `Traceback (most recent call last):
  File "user_service.py", line 5, in get_user_name
    return user["name"]
TypeError: 'NoneType' object is not subscriptable`;

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
  const [inputSource, setInputSource] = useState<ErrorInputType>('TEXT');
  const [languageHint, setLanguageHint] = useState('');
  const [provider, setProvider] = useState<ProviderHealth | null>(null);
  const [history, setHistory] = useState<ReadonlyArray<DebugSession>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [demoProjects, setDemoProjects] = useState<ReadonlyArray<DemoProject>>([]);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<PreDemoCheckResult | null>(null);
  const [visionOpen, setVisionOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speechCapability, setSpeechCapability] = useState<SpeechCapability | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const bridgeRef = useRef<DeviceBridge | null>(null);
  const authResetting = useRef(false);
  const resumeAttempted = useRef(false);
  const client = useMemo(() => new ApiClient({ baseUrl: connection.serverAddress, token: connection.token }), [connection]);
  const fade = useRef(new Animated.Value(0)).current;

  const expireConnection = useCallback(() => {
    if (authResetting.current) return;
    authResetting.current = true;
    bridgeRef.current?.disconnect();
    void clearConnection().finally(onDisconnect);
  }, [onDisconnect]);

  const reportRequestError = useCallback((requestError: unknown) => {
    handleError(requestError, setError, expireConnection);
  }, [expireConnection]);

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
      reportRequestError(requestError);
    }
  }, [client, reportRequestError]);

  useEffect(() => {
    const bridge = new LocalWebSocketBridge(connection.serverAddress, connection.token, {
      onStatus: (status) => {
        dispatch({ type: 'CONNECTION', status });
        if (status === 'UNAUTHORIZED') expireConnection();
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
  }, [connection, expireConnection, reconcile]);

  const refreshDashboard = useCallback(async () => {
    try {
      const [workspace, health, sessions] = await Promise.all([
        getWorkspace(client), getProviderHealth(client), listSessions(client),
      ]);
      dispatch({ type: 'WORKSPACE', workspace });
      dispatch({ type: 'CONNECTION', status: 'CONNECTED' });
      setProvider(health);
      setHistory(sessions.sessions);
      if (!resumeAttempted.current) {
        resumeAttempted.current = true;
        const resumable = sessions.sessions.find((session) => !['IDLE', 'ROLLED_BACK'].includes(session.state));
        if (resumable !== undefined) {
          dispatch({ type: 'SESSION', session: resumable });
          bridgeRef.current?.connect(resumable.id, resumable.last_event_sequence);
          void reconcile(resumable.id);
        }
      }
      setError(null);
    } catch (requestError) {
      reportRequestError(requestError);
    }
  }, [client, reconcile, reportRequestError]);

  useEffect(() => { void refreshDashboard(); }, [refreshDashboard]);
  useEffect(() => {
    void Promise.all([listDemos(client), getDemoReadiness(client)])
      .then(([result, check]) => { setDemoProjects(result.demos); setReadiness(check); })
      .catch(reportRequestError);
  }, [client, reportRequestError]);
  useEffect(() => {
    const active = demoProjects.find((demo) => demoDirectoryName(demo.id) === state.workspace?.name);
    setActiveDemoId(active?.id ?? null);
  }, [demoProjects, state.workspace?.name]);
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

  async function startAnalysis(text = errorText, source: ErrorInputType = inputSource, actionSource: ActionSource = 'MOBILE_UI'): Promise<boolean> {
    if (!text.trim()) { setError('Paste or scan an error first.'); return false; }
    if (state.workspace === null) { setError('Select an active workspace on the PocketPilot laptop dashboard. Your confirmed OCR text is still on this screen.'); return false; }
    setBusy('analyze'); setError(null); setTab('DEBUG');
    try {
      const created = await createSession(client, conciseTitle(text));
      const captured = await captureSession(client, created.session);
      dispatch({ type: 'SESSION', session: captured.session });
      dispatch({ type: 'EVENT', event: captured.event });
      bridgeRef.current?.connect(captured.session.id, captured.event.sequence);
      const result = await analyzeText(client, captured.session, text.trim(), languageHint, source, actionSource);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'ANALYSIS', analysis: result.analysis });
      setErrorText(text.trim());
      setInputSource(source);
      await refreshHistory();
      return true;
    } catch (requestError) { reportRequestError(requestError); return false; }
    finally { setBusy(null); }
  }

  async function analyzeVisionText(text: string, source: VisionInputSource): Promise<boolean> {
    return startAnalysis(text, source);
  }

  const reviewVisionText = useCallback((text: string, source: VisionInputSource) => {
    setErrorText(text);
    setInputSource(source);
  }, []);

  async function requestPatch(actionSource: ActionSource = 'MOBILE_UI'): Promise<boolean> {
    if (state.session === null) return false;
    setBusy('patch'); setError(null);
    try {
      const result = await generatePatch(client, state.session, actionSource);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'PATCH', patch: result.workflow });
      return true;
    } catch (requestError) { reportRequestError(requestError); return false; }
    finally { setBusy(null); }
  }

  async function retryAnalysis(actionSource: ActionSource = 'MOBILE_UI'): Promise<boolean> {
    if (state.session === null || state.session.state !== 'FAILED' || state.session.retry_count >= 2) return false;
    if (!errorText.trim()) { setError('Paste the original error again before retrying this historical session.'); return false; }
    setBusy('retry'); setError(null);
    try {
      const result = await analyzeText(client, state.session, errorText.trim(), languageHint, inputSource, actionSource);
      dispatch({ type: 'SNAPSHOT', session: result.session, events: [], patch: null });
      dispatch({ type: 'ANALYSIS', analysis: result.analysis });
      await refreshHistory();
      return true;
    } catch (requestError) { reportRequestError(requestError); return false; }
    finally { setBusy(null); }
  }

  async function patchAction(action: 'approve' | 'reject' | 'rollback', actionSource: ActionSource = 'MOBILE_UI'): Promise<boolean> {
    if (state.session === null || state.patch === null) return false;
    setBusy(action); setError(null);
    try {
      const result = await decidePatch(client, state.session, state.patch, action, actionSource);
      dispatch({ type: 'SESSION', session: result.session });
      dispatch({ type: 'PATCH', patch: result.workflow });
      await refreshHistory();
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        reportRequestError(requestError);
      } else if (action === 'rollback') {
        const detail = requestError instanceof Error ? requestError.message : 'A newer file change prevents rollback.';
        setError(`ROLLBACK BLOCKED — ${detail}`);
      } else reportRequestError(requestError);
      return false;
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
    } catch (requestError) { reportRequestError(requestError); }
    finally { setBusy(null); }
  }

  async function disconnectDevice() {
    bridgeRef.current?.disconnect();
    await clearConnection();
    onDisconnect();
  }

  async function chooseDemo(demoId: string) {
    setBusy('demo-select'); setError(null);
    try {
      const selected = await selectDemo(client, demoId);
      dispatch({ type: 'CLEAR_SESSION' });
      dispatch({ type: 'WORKSPACE', workspace: selected.workspace });
      setActiveDemoId(demoId);
      setDemoProjects((items) => items.map((item) => item.id === demoId ? selected.demo : item));
    } catch (requestError) { reportRequestError(requestError); }
    finally { setBusy(null); }
  }

  function confirmDemoReset(demoId: string) {
    Alert.alert(
      'Reset this demo?',
      'Only the registered demo source will be restored to its intentional broken state.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset demo', style: 'destructive', onPress: () => { void performDemoReset(demoId); } },
      ],
    );
  }

  async function performDemoReset(demoId: string) {
    setBusy('demo-reset'); setError(null);
    try {
      const reset = await resetDemo(client, demoId);
      setDemoProjects((items) => items.map((item) => item.id === demoId ? reset.demo : item));
      dispatch({ type: 'CLEAR_SESSION' });
    } catch (requestError) { reportRequestError(requestError); }
    finally { setBusy(null); }
  }

  async function prepareSelectedDemo(demoId: string) {
    setBusy('demo-prepare'); setError(null);
    try {
      const prepared = await prepareDemo(client, demoId);
      bridgeRef.current?.disconnect();
      dispatch({ type: 'CLEAR_SESSION' });
      dispatch({ type: 'WORKSPACE', workspace: prepared.workspace });
      setDemoProjects((items) => items.map((item) => item.id === demoId ? prepared.demo : item));
      setActiveDemoId(demoId);
      setReadiness(prepared.readiness);
    } catch (requestError) { reportRequestError(requestError); }
    finally { setBusy(null); }
  }

  const voiceContext: VoiceSessionContext = {
    session_state: state.session?.state ?? null,
    patch_status: state.patch?.status ?? null,
    has_error_text: errorText.trim().length > 0,
    has_analysis: state.analysis !== null,
    has_patch: state.patch !== null,
    retry_count: state.session?.retry_count ?? 0,
  };
  const voiceResponseData = { analysis: state.analysis, patch: state.patch, session: state.session };

  async function executeVoiceAction(intent: VoiceIntent): Promise<VoiceExecutionResult> {
    const executor = new VoiceActionExecutor({
      analyzeError: async () => {
        const success = await startAnalysis(errorText, inputSource, 'VOICE');
        if (success) { setTab('DEBUG'); setVisionOpen(false); setVoiceOpen(false); }
        return success
          ? { success: true, message: 'Analysis completed.', spoken_response: 'Root cause found. The result is ready on screen.' }
          : { success: false, message: 'Analysis could not complete.', spoken_response: null };
      },
      generatePatch: async () => {
        const success = await requestPatch('VOICE');
        if (success) { setTab('DEBUG'); setVoiceOpen(false); }
        return success
          ? { success: true, message: 'The fix is ready for review.', spoken_response: 'The generated fix is ready. Review the patch before approval.' }
          : { success: false, message: 'A fix could not be generated.', spoken_response: null };
      },
      approvePatch: async () => {
        const success = await patchAction('approve', 'VOICE');
        if (success) { setTab('DEBUG'); setVoiceOpen(false); }
        return success
          ? { success: true, message: 'The approved fix and project validation completed.', spoken_response: 'The fix was applied through the approved workflow. Check the verified test result on screen.' }
          : { success: false, message: 'The fix was not applied. Refresh the session before trying again.', spoken_response: null };
      },
      rejectPatch: async () => {
        const success = await patchAction('reject', 'VOICE');
        return success
          ? { success: true, message: 'The patch was rejected.', spoken_response: 'The patch was rejected. No files were changed.' }
          : { success: false, message: 'The patch could not be rejected.', spoken_response: null };
      },
      rollback: async () => {
        const success = await patchAction('rollback', 'VOICE');
        if (success) { setTab('DEBUG'); setVoiceOpen(false); }
        return success
          ? { success: true, message: 'Rollback completed.', spoken_response: 'The rollback is complete. The original files were restored.' }
          : { success: false, message: 'Rollback was blocked. Review the conflict on screen.', spoken_response: null };
      },
      tryAnotherFix: async () => {
        const success = await retryAnalysis('VOICE');
        return success
          ? { success: true, message: 'A new analysis is ready.', spoken_response: 'PocketPilot completed another safe analysis attempt.' }
          : { success: false, message: 'Another fix is not available.', spoken_response: null };
      },
      scanError: () => {
        setVoiceOpen(false); setVisionOpen(true);
        return { success: true, message: 'Camera opened. Capture remains manual.', spoken_response: null };
      },
      explainRootCause: () => ({ success: true, message: 'Root-cause explanation ready.', spoken_response: formatRootCauseResponse(voiceResponseData) }),
      explainFix: () => ({ success: true, message: 'Fix explanation ready.', spoken_response: formatFixResponse(voiceResponseData) }),
      showLocation: () => ({ success: true, message: 'Problem location ready.', spoken_response: formatLocationResponse(voiceResponseData) }),
      showTestResult: () => ({ success: true, message: 'Validation result ready.', spoken_response: formatTestResponse(voiceResponseData) }),
      showSessionStatus: () => ({ success: true, message: 'Session status ready.', spoken_response: formatSessionResponse(voiceResponseData) }),
      showPatch: () => {
        setTab('DEBUG'); setVoiceOpen(false);
        return { success: true, message: 'Showing the reviewed patch.', spoken_response: 'The current patch is open on screen.' };
      },
      showError: () => {
        setTab('DEBUG'); setVoiceOpen(false);
        return { success: true, message: 'Showing the captured error.', spoken_response: 'The captured error is open on screen.' };
      },
    });
    return executor.execute(intent);
  }

  const recordVoiceCapability = useCallback((capability: SpeechCapability, speechAvailable: boolean) => {
    setSpeechCapability(capability);
    setTtsAvailable(speechAvailable);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <View style={styles.app}>
        <Header connection={state.connection} presentationMode={demoMode} />
        {error !== null && <ErrorBanner message={error} onRetry={() => void refreshDashboard()} />}
        <Animated.View style={[styles.content, { opacity: fade }]}>
          {visionOpen ? <VisionScanner onAnalyze={analyzeVisionText} onClose={() => setVisionOpen(false)} onReviewText={reviewVisionText} onSpeak={() => setVoiceOpen(true)} /> : <>
          {tab === 'HOME' && <HomeScreen activeDemoId={activeDemoId} busy={busy} currentSession={state.session} demoMode={demoMode} demos={demoProjects} onNewSession={() => { bridgeRef.current?.disconnect(); dispatch({ type: 'CLEAR_SESSION' }); setTab('DEBUG'); }} onPaste={() => { setInputSource('TEXT'); setTab('DEBUG'); }} onPrepare={(id) => void prepareSelectedDemo(id)} onResetDemo={confirmDemoReset} onScan={() => setVisionOpen(true)} onSelectDemo={(id) => void chooseDemo(id)} onSpeak={() => setVoiceOpen(true)} provider={provider} readiness={readiness} speechCapability={speechCapability} state={state} />}
          {tab === 'DEBUG' && (
            <DebugScreen
              analysis={state.analysis}
              busy={busy}
              demoMode={demoMode}
              errorText={errorText}
              languageHint={languageHint}
              onApprove={() => void patchAction('approve')}
              onChangeError={(value) => { setErrorText(value); setInputSource('TEXT'); }}
              onChangeLanguage={setLanguageHint}
              onGenerate={() => void requestPatch()}
              onLoadDemo={() => { setErrorText(DEMO_ERROR); setInputSource('TEXT'); setLanguageHint('Python'); }}
              onReject={() => void patchAction('reject')}
              onRetry={() => void retryAnalysis()}
              onReset={() => { bridgeRef.current?.disconnect(); dispatch({ type: 'RESET' }); setInputSource('TEXT'); void refreshDashboard(); }}
              onRollback={confirmRollback}
              onSpeak={() => setVoiceOpen(true)}
              onStart={() => void startAnalysis()}
              patch={state.patch}
              session={state.session}
              steps={pipelineStatus(state)}
              validationCommand={state.workspace?.detected_commands.find((command) => command.category === 'test')?.display_command ?? 'the registered project validation command'}
              workspaceReady={state.workspace !== null}
            />
          )}
          {tab === 'SESSIONS' && <SessionsScreen sessions={history} busy={busy === 'history'} onOpen={(id) => void openSession(id)} onRefresh={() => void refreshHistory()} />}
          {tab === 'SETTINGS' && <SettingsScreen connection={connection} demoMode={demoMode} onDemoMode={setDemoMode} onDisconnect={() => void disconnectDevice()} speechCapability={speechCapability} ttsAvailable={ttsAvailable} />}
          </>}
        </Animated.View>
        <VoiceSheet context={voiceContext} demoMode={demoMode} onCapability={recordVoiceCapability} onClose={() => setVoiceOpen(false)} onExecute={executeVoiceAction} open={voiceOpen} responseData={voiceResponseData} />
        {!visionOpen && <TabBar active={tab} onSelect={setTab} />}
      </View>
    </SafeAreaView>
  );
}

function PresentationHome({ activeDemo, busy, currentSession, demos, onNewSession, onPaste, onPrepare, onResetDemo, onScan, onSelectDemo, onSpeak, provider, readiness, speechCapability, state }: { activeDemo: DemoProject | undefined; busy: string | null; currentSession: DebugSession | null; demos: ReadonlyArray<DemoProject>; onNewSession: () => void; onPaste: () => void; onPrepare: (id: string) => void; onResetDemo: (id: string) => void; onScan: () => void; onSelectDemo: (id: string) => void; onSpeak: () => void; provider: ProviderHealth | null; readiness: PreDemoCheckResult | null; speechCapability: SpeechCapability | null; state: WorkflowState }) {
  const overall = readiness?.overall === 'READY' ? 'READY' : readiness?.overall?.startsWith('READY') ? 'READY WITH WARNINGS' : 'CHECK REQUIRED';
  const workspace = activeDemo?.name ?? state.workspace?.name ?? 'Select on laptop';
  const voiceReady = speechCapability?.available === true;
  return <ScrollView contentContainerStyle={styles.presentationPage}>
    <View style={styles.presentationIntro}><Eyebrow>PHONE-CONTROLLED DEVELOPER ASSISTANT</Eyebrow><Text style={styles.presentationTitle}>See it. Say it.{`\n`}Fix it.</Text><Text style={styles.presentationCopy}>Turn a visible error into a reviewed patch and a real verified test result.</Text></View>
    <Card accent>
      <View style={styles.titleRow}><View><Eyebrow>DEMO READINESS</Eyebrow><Text style={styles.cardTitle}>{overall}</Text></View><Badge label="PRESENTATION" tone={overall === 'READY' ? 'good' : 'warn'} /></View>
      <View style={styles.readinessGrid}>
        <ReadinessItem label="LAPTOP" value={state.connection === 'CONNECTED' ? 'Connected' : state.connection} good={state.connection === 'CONNECTED'} />
        <ReadinessItem label="WORKSPACE" value={workspace} good={state.workspace !== null} />
        <ReadinessItem label="AI" value={providerLabel(provider)} good={provider?.available === true} />
        <ReadinessItem label="CAMERA" value="Ready" good />
        <ReadinessItem label="VOICE" value={voiceReady ? 'Ready' : 'Check once'} good={voiceReady} />
      </View>
      {activeDemo !== undefined && <PrimaryButton accessibilityLabel={`Prepare ${activeDemo.name} demo`} disabled={busy !== null || activeDemo.status === 'TOOL_MISSING'} label={busy === 'demo-prepare' ? 'PREPARING DEMO…' : 'PREPARE DEMO'} onPress={() => onPrepare(activeDemo.id)} />}
    </Card>
    <Pressable accessibilityLabel="Scan an error" accessibilityRole="button" onPress={onScan} style={({ pressed }) => [styles.scanHero, pressed && styles.pressed]}><Text style={styles.scanHeroIcon}>▣</Text><View style={styles.titleCopy}><Text style={styles.scanHeroTitle}>SCAN ERROR</Text><Text style={styles.scanHeroCopy}>Camera → on-device OCR → review</Text></View><Text style={styles.scanHeroArrow}>›</Text></Pressable>
    <View style={styles.secondaryActionRow}><Pressable accessibilityLabel="Speak a PocketPilot command" accessibilityRole="button" onPress={onSpeak} style={styles.presentationAction}><Text style={styles.presentationActionLabel}>SPEAK COMMAND</Text><Text style={styles.presentationActionCopy}>Safe actions only</Text></Pressable><Pressable accessibilityLabel="Paste an error" accessibilityRole="button" onPress={onPaste} style={styles.presentationAction}><Text style={styles.presentationActionLabel}>PASTE ERROR</Text><Text style={styles.presentationActionCopy}>Camera fallback</Text></Pressable></View>
    {currentSession !== null && <Card><View style={styles.titleRow}><View style={styles.titleCopy}><Eyebrow>CURRENT SESSION</Eyebrow><Text numberOfLines={2} style={styles.cardTitle}>{currentSession.title}</Text></View><StateBadge state={currentSession.state} /></View><SecondaryButton label="NEW SESSION" onPress={onNewSession} /></Card>}
    <Card><Eyebrow>REGISTERED DEMOS</Eyebrow>{demos.map((demo) => <View key={demo.id} style={styles.demoMobileRow}><View style={styles.titleCopy}><Text style={styles.sessionTitle}>{demo.name}</Text><Text style={styles.cardCopy}>{demo.status.replaceAll('_', ' ')} · {demo.language}</Text></View><Pressable accessibilityLabel={`Select ${demo.name}`} disabled={busy !== null || demo.status === 'TOOL_MISSING'} onPress={() => onSelectDemo(demo.id)}><Text style={styles.link}>{activeDemo?.id === demo.id ? 'ACTIVE' : 'SELECT'}</Text></Pressable>{activeDemo?.id === demo.id && <Pressable accessibilityLabel={`Reset ${demo.name}`} disabled={busy !== null} onPress={() => onResetDemo(demo.id)}><Text style={styles.link}>RESET</Text></Pressable>}</View>)}</Card>
    <Text style={styles.networkTruth}>IMAGE · ON DEVICE   SOURCE · LAPTOP   VOICE · ANDROID SERVICE{`\n`}AI · {providerLabel(provider)}</Text>
  </ScrollView>;
}

function ReadinessItem({ good, label, value }: { good: boolean; label: string; value: string }) {
  return <View style={styles.readinessItem}><View style={styles.readinessLabel}><StatusDot good={good} /><Text style={styles.eyebrow}>{label}</Text></View><Text numberOfLines={2} style={styles.readinessValue}>{value}</Text></View>;
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
      <ExpoStatusBar style="light" />
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

function HomeScreen({ activeDemoId, busy, currentSession, demoMode, demos, onNewSession, onPaste, onPrepare, onResetDemo, onScan, onSelectDemo, onSpeak, provider, readiness, speechCapability, state }: { activeDemoId: string | null; busy: string | null; currentSession: DebugSession | null; demoMode: boolean; demos: ReadonlyArray<DemoProject>; onNewSession: () => void; onPaste: () => void; onPrepare: (id: string) => void; onResetDemo: (id: string) => void; onScan: () => void; onSelectDemo: (id: string) => void; onSpeak: () => void; provider: ProviderHealth | null; readiness: PreDemoCheckResult | null; speechCapability: SpeechCapability | null; state: WorkflowState }) {
  const activeDemo = demos.find((demo) => demo.id === activeDemoId);
  if (demoMode) return <PresentationHome activeDemo={activeDemo} busy={busy} currentSession={currentSession} demos={demos} onNewSession={onNewSession} onPaste={onPaste} onPrepare={onPrepare} onResetDemo={onResetDemo} onScan={onScan} onSelectDemo={onSelectDemo} onSpeak={onSpeak} provider={provider} readiness={readiness} speechCapability={speechCapability} state={state} />;
  return (
    <ScrollView contentContainerStyle={styles.scrollPage}>
      <Text style={styles.homeTitle}>See it. Say it.{`\n`}Fix it.</Text>
      <StatusCard label="LAPTOP" value={state.connection === 'CONNECTED' ? 'CONNECTED' : state.connection} good={state.connection === 'CONNECTED'} />
      <Card>
        <Eyebrow>ACTIVE WORKSPACE</Eyebrow>
        {activeDemoId !== null && <Badge label="DEMO WORKSPACE" tone="good" />}
        <Text style={styles.cardTitle}>{activeDemo?.name ?? state.workspace?.name ?? 'Not selected on laptop'}</Text>
        <Text style={styles.cardCopy}>{state.workspace === null ? 'Select a workspace from PocketPilot Desktop Agent.' : `${state.workspace.languages.map((item) => item.name).join(' · ') || 'Project'} · ${state.workspace.detected_commands[0]?.label ?? 'No validation command'}`}</Text>
        <View style={styles.statusRow}><StatusDot good={state.workspace !== null} /><Text style={styles.statusText}>{state.workspace === null ? 'WAITING FOR LAPTOP' : 'READY'}</Text></View>
      </Card>
      {demoMode && <Card accent>
        <Eyebrow>DEMO PROJECTS</Eyebrow>
        <Text style={styles.cardTitle}>Choose a registered scenario</Text>
        <Text style={styles.cardCopy}>The phone sends only a safe demo ID. The laptop owns every project path.</Text>
        {demos.map((demo) => <View key={demo.id} style={styles.demoMobileRow}>
          <View style={styles.titleCopy}><Text style={styles.sessionTitle}>{demo.name}</Text><Text style={styles.cardCopy}>{demo.status.replaceAll('_', ' ')} · {demo.language}</Text></View>
          <Pressable accessibilityLabel={`Select ${demo.name}`} disabled={busy !== null} onPress={() => onSelectDemo(demo.id)}><Text style={styles.link}>{activeDemoId === demo.id ? 'ACTIVE' : 'SELECT'}</Text></Pressable>
          <Pressable accessibilityLabel={`Reset ${demo.name}`} disabled={busy !== null} onPress={() => onResetDemo(demo.id)}><Text style={styles.link}>RESET</Text></Pressable>
        </View>)}
      </Card>}
      <Card>
        <Eyebrow>LOCAL AI</Eyebrow>
        <Text style={styles.cardTitle}>{provider?.provider ?? 'Checking provider'}</Text>
        <View style={styles.statusRow}><StatusDot good={provider?.available === true} /><Text style={styles.statusText}>{provider?.available === true ? 'READY' : 'UNAVAILABLE'}</Text></View>
      </Card>
      <View style={styles.actionGrid}>
        <Pressable accessibilityLabel="Scan an error" onPress={onScan} style={styles.actionCard}><Text style={styles.actionIcon}>▣</Text><Text style={styles.actionTitle}>SCAN ERROR</Text><Text style={styles.actionSubtitle}>Camera or screenshot · on-device OCR</Text></Pressable>
        <Pressable accessibilityLabel="Speak a PocketPilot command" onPress={onSpeak} style={[styles.actionCard, styles.voiceAction]}><Text style={styles.actionIcon}>●</Text><Text style={styles.actionTitle}>SPEAK COMMAND</Text><Text style={styles.actionSubtitle}>Push to talk · safe actions only</Text></Pressable>
        <Pressable accessibilityLabel="Paste an error" onPress={onPaste} style={styles.actionCard}><Text style={styles.actionIcon}>⌘</Text><Text style={styles.actionTitle}>PASTE ERROR</Text><Text style={styles.actionSubtitle}>Start a real debug session</Text></Pressable>
      </View>
      {currentSession !== null && <Card><Eyebrow>CURRENT SESSION</Eyebrow><Text style={styles.cardTitle}>{currentSession.title}</Text><StateBadge state={currentSession.state} /></Card>}
    </ScrollView>
  );
}

function DebugScreen(props: {
  analysis: AnalysisRecord | null; busy: string | null; demoMode: boolean; errorText: string; languageHint: string;
  onApprove: () => void; onChangeError: (value: string) => void; onChangeLanguage: (value: string) => void;
  onGenerate: () => void; onLoadDemo: () => void; onReject: () => void; onReset: () => void; onRollback: () => void;
  onRetry: () => void; onSpeak: () => void; onStart: () => void; patch: PatchWorkflowView | null; session: DebugSession | null;
  steps: ReadonlyArray<{ label: string; complete: boolean; active: boolean }>; validationCommand: string; workspaceReady: boolean;
}) {
  const workPhase = resolveWorkPhase(props.busy, props.session);
  if (props.session === null) {
    return (
      <ScrollView contentContainerStyle={styles.scrollPage} keyboardShouldPersistTaps="handled">
        <Eyebrow>DEBUG NEW ISSUE</Eyebrow><Text style={styles.screenTitle}>Paste what went wrong.</Text>
        {!props.workspaceReady && <Text style={styles.warningText}>Workspace controlled by laptop. Select one in PocketPilot Desktop Agent.</Text>}
        <TextInput accessibilityLabel="Error or stack trace" multiline onChangeText={props.onChangeError} placeholder="Paste an exception, traceback, or compiler error…" placeholderTextColor="#586056" style={styles.errorInput} textAlignVertical="top" value={props.errorText} />
        <Field accessibilityLabel="Optional language hint" onChangeText={props.onChangeLanguage} placeholder="Language hint (optional)" value={props.languageHint} />
        {props.demoMode && <SecondaryButton label="LOAD DEMO ERROR" onPress={props.onLoadDemo} />}
        <PrimaryButton accessibilityLabel="Analyze error" disabled={props.busy !== null || !props.workspaceReady} label={props.busy === 'analyze' ? 'ANALYZING…' : 'ANALYZE'} onPress={props.onStart} />
        {workPhase !== null && <WorkInProgress phase={workPhase} />}
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scrollPage}>
      <View style={styles.titleRow}><View style={styles.titleCopy}><Eyebrow>LIVE DEBUG SESSION</Eyebrow><Text style={styles.screenTitle}>{sessionDisplayTitle(props.session, props.analysis)}</Text></View><View style={styles.sessionActions}><Pressable accessibilityLabel="Speak a contextual command" accessibilityRole="button" onPress={props.onSpeak} style={styles.voiceMini}><Text style={styles.voiceMiniText}>●</Text></Pressable><StateBadge state={props.session.state} /></View></View>
      <Pipeline steps={props.steps} />
      {workPhase !== null && <WorkInProgress phase={workPhase} />}
      {props.analysis !== null && <RootCause analysis={props.analysis} busy={props.busy !== null} canGenerate={props.session.state === 'ROOT_CAUSE_FOUND'} onGenerate={props.onGenerate} />}
      {props.session.state === 'ROOT_CAUSE_FOUND' && props.patch === null && props.busy === null && <SecondaryButton label="REVIEW ERROR TEXT" onPress={props.onReset} />}
      {props.session.state === 'FAILED' && props.patch === null && <Card>
        <Text style={[styles.heroStatus, styles.failureText]}>PATCH NOT GENERATED</Text>
        <Text style={styles.cardCopy}>The error did not resolve to a safe repository file. Retry analysis after reviewing the captured text.</Text>
        {props.session.retry_count < 2 && <SecondaryButton label="TRY ANALYSIS AGAIN" onPress={props.onRetry} />}
        <SecondaryButton label="START OVER" onPress={props.onReset} />
      </Card>}
      {props.patch !== null && <PatchPanel busy={props.busy} onApprove={props.onApprove} onReject={props.onReject} onRetry={props.onRetry} onRollback={props.onRollback} patch={props.patch} session={props.session} validationCommand={props.validationCommand} />}
      {['SUCCESS', 'ROLLED_BACK'].includes(props.session.state) && <SecondaryButton label="DONE" onPress={props.onReset} />}
    </ScrollView>
  );
}

function Pipeline({ steps }: { steps: ReadonlyArray<{ label: string; complete: boolean; active: boolean }> }) {
  return <Card><Eyebrow>PIPELINE</Eyebrow>{steps.map((step) => <View key={step.label} style={styles.pipelineRow}><Text style={[styles.pipelineIcon, step.complete && styles.successText, step.active && styles.activeText]}>{step.complete ? '✓' : step.active ? '●' : '○'}</Text><Text style={[styles.pipelineLabel, (step.complete || step.active) && styles.brightText]}>{step.label}</Text></View>)}</Card>;
}

function WorkInProgress({ phase }: { phase: WorkPhase }) {
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
    <View accessibilityLabel={`${content.title}. ${content.messages[messageIndex]}`} accessibilityRole="progressbar" accessibilityValue={{ text: `${elapsedSeconds} seconds elapsed` }} style={styles.workCard}>
      <View style={styles.workVisual}>
        <Animated.View style={[styles.workHalo, { opacity: haloOpacity, transform: [{ scale: coreScale }] }]} />
        <Animated.View style={[styles.workOrbit, { transform: [{ rotate: rotation }] }]}><View style={styles.workSatellite} /></Animated.View>
        <Animated.View style={[styles.workCore, { transform: [{ scale: coreScale }] }]}><Text style={styles.workCoreText}>{content.icon}</Text></Animated.View>
      </View>
      <View style={styles.workCopy}>
        <Text style={styles.workEyebrow}>{content.eyebrow}</Text>
        <Text style={styles.workTitle}>{content.title}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.workMessage}>{content.messages[messageIndex]}</Text>
        <View style={styles.workMeta}><View style={styles.workLiveDot} /><Text style={styles.workElapsed}>{elapsedSeconds}s elapsed · {content.footer}</Text></View>
      </View>
    </View>
  );
}

function RootCause({ analysis, busy, canGenerate, onGenerate }: { analysis: AnalysisRecord; busy: boolean; canGenerate: boolean; onGenerate: () => void }) {
  const result = analysis.result;
  return <Card accent><View style={styles.titleRow}><View><Eyebrow>ROOT CAUSE FOUND</Eyebrow><Text style={styles.sourceNote}>{analysis.input_source} INPUT · {providerLabelFromRecord(analysis)}</Text></View><Badge label={`${result.confidence} CONFIDENCE`} tone={result.confidence === 'HIGH' ? 'good' : 'warn'} /></View><Text style={styles.judgeLocation}>{result.likely_file ?? 'Location not established'}{result.likely_line === null ? '' : ` · LINE ${result.likely_line}`}</Text><Info label="PROBLEM" value={result.root_cause} /><Info label="EVIDENCE" value={result.explanation} /><Info label="REPAIR STRATEGY" value={result.repair_strategy} />{result.evidence.slice(0, 2).map((item) => <View key={`${item.relative_path}:${item.line ?? 0}`} style={styles.evidence}><Text style={styles.codeText}>{item.relative_path}{item.line === null ? '' : `:${item.line}`}</Text><Text style={styles.evidenceText}>{item.observation}</Text></View>)}{canGenerate && <PrimaryButton accessibilityLabel="Generate fix" disabled={busy} label={busy ? 'GENERATING FIX…' : 'GENERATE FIX'} onPress={onGenerate} />}</Card>;
}

function PatchPanel({ busy, onApprove, onReject, onRetry, onRollback, patch, session, validationCommand }: { busy: string | null; onApprove: () => void; onReject: () => void; onRetry: () => void; onRollback: () => void; patch: PatchWorkflowView; session: DebugSession; validationCommand: string }) {
  const [openFiles, setOpenFiles] = useState<ReadonlyArray<string>>(patch.proposal.files.map((file) => file.relative_path));
  const [approvalOpen, setApprovalOpen] = useState(false);
  const awaiting = patch.status === 'AWAITING_APPROVAL';
  const rollback = patch.rollback_status === 'AVAILABLE' && ['VERIFIED', 'FAILED'].includes(patch.status);
  if (session.state === 'SUCCESS') return <SuccessPanel patch={patch} onRollback={onRollback} />;
  if (session.state === 'FAILED') return <FailurePanel patch={patch} retryCount={session.retry_count} onRetry={onRetry} onRollback={onRollback} />;
  if (session.state === 'ROLLED_BACK') return <Card><Text style={styles.heroStatus}>↩ FIX UNDONE</Text><Text style={styles.cardCopy}>Files restored to their pre-fix state.</Text></Card>;
  return <Card><View style={styles.titleRow}><View><Eyebrow>PROPOSED FIX</Eyebrow><Text style={styles.cardTitle}>{patch.proposal.title}</Text></View><Badge label={`${patch.validation.risk} RISK`} tone={patch.validation.risk === 'LOW' ? 'good' : patch.validation.risk === 'MEDIUM' ? 'warn' : 'bad'} /></View><Text style={styles.cardCopy}>{patch.proposal.summary}</Text><View style={styles.metrics}><Metric label="FILES" value={String(patch.validation.files_changed)} /><Metric label="ADDED" value={`+${patch.validation.additions}`} /><Metric label="REMOVED" value={`-${patch.validation.deletions}`} /></View>{patch.proposal.files.map((file) => { const open = openFiles.includes(file.relative_path); return <View key={file.relative_path} style={styles.diffCard}><Pressable accessibilityLabel={`Toggle diff for ${file.relative_path}`} onPress={() => setOpenFiles(open ? openFiles.filter((path) => path !== file.relative_path) : [...openFiles, file.relative_path])} style={styles.diffHeader}><Text style={styles.codeText}>{file.relative_path}</Text><Text style={styles.diffCount}>+{file.additions} −{file.deletions} {open ? '⌃' : '⌄'}</Text></Pressable>{open && <ScrollView horizontal><View style={styles.diffBody}>{file.unified_diff.split('\n').map((line, index) => <Text key={`${index}-${line}`} style={[styles.diffLine, line.startsWith('+') && styles.diffAdd, line.startsWith('-') && styles.diffRemove]}>{line || ' '}</Text>)}</View></ScrollView>}</View>; })}<Info label="WHY THIS FIX" value={patch.proposal.rationale} /><Info label="EXPECTED EFFECT" value={patch.proposal.expected_effect} />{awaiting && !approvalOpen && <><Text style={styles.approvalNote}>Human approval is required before any file changes.</Text><PrimaryButton accessibilityLabel="Review approval for fix" disabled={busy !== null} label="APPROVE FIX" onPress={() => setApprovalOpen(true)} /><SecondaryButton label="REJECT" onPress={onReject} /></>}{awaiting && approvalOpen && <View style={styles.confirmationCard}><Eyebrow>READY TO APPLY</Eyebrow><Text style={styles.cardTitle}>{patch.validation.files_changed} source file{patch.validation.files_changed === 1 ? '' : 's'} will change.</Text><Text style={styles.cardCopy}>PocketPilot will then run:</Text><Text style={styles.confirmationCommand}>{validationCommand}</Text><Text style={styles.voiceFallback}>Noisy venue? Tap CONFIRM. Voice maps to this exact same secure action.</Text><PrimaryButton accessibilityLabel="Confirm and apply fix" disabled={busy !== null} label={busy === 'approve' ? 'APPLYING & TESTING…' : 'CONFIRM'} onPress={onApprove} /><SecondaryButton label="CANCEL" onPress={() => setApprovalOpen(false)} /></View>}{['APPLYING', 'APPLIED'].includes(patch.status) || session.state === 'TESTING' ? <View style={styles.progressBox}><ActivityIndicator color="#C8FF3D" /><View><Text style={styles.progressTitle}>{session.state === 'TESTING' ? 'RUNNING APPROVED TESTS' : 'APPLYING APPROVED FIX'}</Text><Text style={styles.cardCopy}>Session remains recoverable if the phone disconnects.</Text></View></View> : null}{rollback && <SecondaryButton label="UNDO FIX" onPress={onRollback} />}</Card>;
}

function SuccessPanel({ patch, onRollback }: { patch: PatchWorkflowView; onRollback: () => void }) {
  const [detail, setDetail] = useState<'NONE' | 'EXPLANATION' | 'DIFF'>('NONE');
  return <Card accent><Text style={[styles.heroStatus, styles.successText]}>✓ FIX VERIFIED</Text><Text style={styles.successStatement}>Tests passed after the patch.</Text><View style={styles.metrics}><Metric label="TESTS PASSED" value={testCount(patch)} /><Metric label="FILE CHANGED" value={String(patch.application?.files_changed ?? patch.validation.files_changed)} /><Metric label="PROVIDER" value={providerLabelForPatch(patch)} /></View><View style={styles.successActions}><SecondaryButton label="WHAT CHANGED?" onPress={() => setDetail(detail === 'EXPLANATION' ? 'NONE' : 'EXPLANATION')} /><SecondaryButton label="VIEW DIFF" onPress={() => setDetail(detail === 'DIFF' ? 'NONE' : 'DIFF')} /></View>{detail === 'EXPLANATION' && <Info label="WHAT CHANGED" value={`${patch.proposal.rationale}\n\n${patch.proposal.expected_effect}`} />}{detail === 'DIFF' && patch.proposal.files.map((file) => <View key={file.relative_path} style={styles.diffCard}><View style={styles.diffHeader}><Text style={styles.codeText}>{file.relative_path}</Text></View><ScrollView horizontal><View style={styles.diffBody}>{file.unified_diff.split('\n').map((line, index) => <Text key={`${index}-${line}`} style={[styles.diffLine, line.startsWith('+') && styles.diffAdd, line.startsWith('-') && styles.diffRemove]}>{line || ' '}</Text>)}</View></ScrollView></View>)}<SecondaryButton label="UNDO FIX" onPress={onRollback} /><Text style={styles.finalTagline}>See it. Say it. Fix it. · PocketPilot AI</Text></Card>;
}

function FailurePanel({ patch, retryCount, onRetry, onRollback }: { patch: PatchWorkflowView; retryCount: number; onRetry: () => void; onRollback: () => void }) {
  return <Card><Text style={[styles.heroStatus, styles.failureText]}>✕ FIX NOT VERIFIED</Text><Info label="VALIDATION COMMAND" value={patch.test_result?.command?.display_command ?? 'No safe validation command'} /><Info label="RESULT" value={patch.test_result?.detail ?? 'Validation failed.'} /><Text style={styles.warningText}>{retryCount >= 2 ? 'Maximum retry count reached.' : 'You can undo this fix, then try another analysis.'}</Text>{retryCount < 2 && <SecondaryButton label="TRY ANOTHER FIX" onPress={onRetry} />}{patch.rollback_status === 'AVAILABLE' && <SecondaryButton label="UNDO FIX" onPress={onRollback} />}</Card>;
}

function SessionsScreen({ sessions, busy, onOpen, onRefresh }: { sessions: ReadonlyArray<DebugSession>; busy: boolean; onOpen: (id: string) => void; onRefresh: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollPage}><View style={styles.titleRow}><View><Eyebrow>SESSION HISTORY</Eyebrow><Text style={styles.screenTitle}>Recent debugging</Text></View><Pressable accessibilityLabel="Refresh sessions" onPress={onRefresh}><Text style={styles.link}>REFRESH</Text></Pressable></View>{busy && <ActivityIndicator color="#C8FF3D" />}{sessions.map((session) => <Pressable accessibilityLabel={`Open ${session.title}`} key={session.id} onPress={() => onOpen(session.id)} style={styles.sessionCard}><StateBadge state={session.state} /><View style={styles.sessionCopy}><Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text><Text style={styles.sessionTime}>{relativeTime(session.updated_at)}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}{sessions.length === 0 && <Text style={styles.emptyText}>No debugging sessions yet.</Text>}</ScrollView>;
}

function SettingsScreen({ connection, demoMode, onDemoMode, onDisconnect, speechCapability, ttsAvailable }: { connection: StoredConnection; demoMode: boolean; onDemoMode: (value: boolean) => void; onDisconnect: () => void; speechCapability: SpeechCapability | null; ttsAvailable: boolean }) {
  return <ScrollView contentContainerStyle={styles.scrollPage}><Eyebrow>SETTINGS</Eyebrow><Text style={styles.screenTitle}>Device connection</Text><Card><Info label="LAPTOP ADDRESS" value={connection.serverAddress} /><Info label="DEVICE" value={connection.displayName} /><Info label="DEVICE ID" value={connection.deviceId} /><Text style={styles.securityCopy}>The token is stored in Android secure storage. Source code, secrets, and rollback snapshots remain on the laptop.</Text><SecondaryButton label="DISCONNECT PHONE" onPress={onDisconnect} /></Card><Pressable accessibilityLabel="Toggle presentation mode" accessibilityRole="switch" accessibilityState={{ checked: demoMode }} onPress={() => onDemoMode(!demoMode)} style={styles.settingRow}><View style={styles.titleCopy}><Text style={styles.settingTitle}>Presentation Mode</Text><Text style={styles.cardCopy}>Prioritizes judge-facing states while keeping every backend action and safety check real.</Text></View><Text style={[styles.toggle, demoMode && styles.toggleOn]}>{demoMode ? 'ON' : 'OFF'}</Text></Pressable><Card><Eyebrow>VOICE</Eyebrow><Text style={styles.cardTitle}>Push-to-talk commands</Text><Info label="MICROPHONE / RECOGNITION" value={speechCapability === null ? 'Open Speak Command to detect' : speechCapability.available ? 'READY' : 'UNAVAILABLE'} /><Info label="LOCALE" value={speechCapability?.locale ?? 'English (India)'} /><Info label="RECOGNITION SERVICE" value={speechCapability?.provider_name ?? 'Not detected'} /><Info label="OFFLINE SPEECH" value={speechCapability?.offline_verified ? 'VERIFIED' : speechCapability?.offline_supported ? 'SUPPORTED · NOT VERIFIED' : 'NOT VERIFIED / UNAVAILABLE'} /><Info label="TEXT TO SPEECH" value={ttsAvailable ? 'READY' : 'NOT DETECTED'} /><Text style={styles.securityCopy}>PocketPilot does not retain microphone audio. The selected Android speech service may use a network unless on-device recognition is verified.</Text></Card><Card><Eyebrow>VISION PRIVACY</Eyebrow><Text style={styles.cardTitle}>On-device OCR</Text><Text style={styles.cardCopy}>Camera and gallery images remain on the phone. Only text you inspect and confirm is sent to the paired laptop.</Text></Card></ScrollView>;
}

function Header({ connection, presentationMode }: { connection: string; presentationMode: boolean }) { return <View style={styles.header}><Brand /><View style={styles.headerStatus}>{presentationMode && <Text numberOfLines={1} style={styles.presentationPill}>PRESENTATION</Text>}<View style={styles.connectionPill}><StatusDot good={connection === 'CONNECTED'} /><Text style={styles.connectionText}>{connection}</Text></View></View></View>; }
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
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) { return <View style={styles.errorBanner}><View style={styles.errorCopy}><Text style={styles.errorTitle}>CONNECTION OR REQUEST ISSUE</Text><Text style={styles.errorMessage}>{message}</Text></View><Pressable accessibilityLabel="Try again" accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={styles.retry}>TRY AGAIN</Text></Pressable></View>; }
function Splash() { return <SafeAreaView style={styles.splash}><ExpoStatusBar style="light" /><Brand /><ActivityIndicator color="#C8FF3D" size="large" /></SafeAreaView>; }

function handleError(error: unknown, setError: (message: string) => void, onUnauthorized?: () => void): void {
  if (error instanceof ApiError && error.status === 401) {
    setError('Device session expired. Opening secure pairing…');
    onUnauthorized?.();
  }
  else {
    const raw = error instanceof Error ? error.message : 'PocketPilot could not complete the request.';
    if (/revision|stale|outdated/i.test(raw)) setError('THIS FIX IS OUTDATED — The file changed after this patch was created. Generate a fresh fix before applying it.');
    else if (/timeout|timed out/i.test(raw)) setError('THE REQUEST TOOK TOO LONG — Your session is safe. Try the same action again.');
    else if (/provider|ollama/i.test(raw)) setError('AI PROVIDER UNAVAILABLE — Your session is safe. Restore the configured provider, then try again.');
    else setError(raw);
  }
}
function conciseTitle(text: string): string { const first = text.split('\n').find((line) => line.trim())?.trim() ?? 'Mobile debug issue'; return first.slice(0, 80); }
function sessionDisplayTitle(session: DebugSession, analysis: AnalysisRecord | null): string { const result = analysis?.result; if (result?.likely_file === undefined || result.likely_file === null) return session.title; return `${result.likely_file}${result.likely_line === null ? '' : `:${result.likely_line}`}`; }
function demoDirectoryName(demoId: string): string { return demoId === 'python-null-user' ? 'python-broken-app' : demoId === 'java-null-user' ? 'java-broken-app' : 'react-broken-app'; }
function relativeTime(value: string): string { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'Now'; if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`; return `${Math.floor(seconds / 86400)} day ago`; }
function providerLabel(provider: ProviderHealth | null): string { if (provider === null) return 'Checking'; if (provider.provider.toLowerCase() === 'mock') return 'Deterministic Demo Provider'; if (provider.provider.toLowerCase() === 'ollama') return provider.available ? `Local Ollama · ${provider.model}` : 'Local Ollama unavailable'; return `${provider.provider} · ${provider.model}`; }
function providerLabelFromRecord(analysis: AnalysisRecord): string { return analysis.provider.toLowerCase() === 'mock' ? 'DETERMINISTIC DEMO PROVIDER' : analysis.provider.toLowerCase() === 'ollama' ? `LOCAL OLLAMA · ${analysis.model}` : `${analysis.provider.toUpperCase()} · ${analysis.model}`; }
function providerLabelForPatch(patch: PatchWorkflowView): string { return patch.proposal.provider.toLowerCase() === 'mock' ? 'DEMO' : patch.proposal.provider.toUpperCase(); }
function testCount(patch: PatchWorkflowView): string { const output = `${patch.test_result?.command?.stdout ?? ''}\n${patch.test_result?.command?.stderr ?? ''}`; const match = output.match(/(\d+)\s+passed/i); return match === null ? 'PASSED' : `${match[1]} / ${match[1]}`; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: ANDROID_STATUS_BAR_INSET, backgroundColor: '#070A0F' }, app: { flex: 1, backgroundColor: '#070A0F' }, content: { flex: 1 }, splash: { flex: 1, padding: 28, paddingTop: 28 + ANDROID_STATUS_BAR_INSET, justifyContent: 'space-between', backgroundColor: '#070A0F' },
  header: { minHeight: 80, paddingHorizontal: 18, paddingVertical: 9, borderBottomColor: '#202720', borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, headerStatus: { flexShrink: 0, alignItems: 'flex-end', gap: 5 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }, mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center' }, markText: { color: '#090D08', fontWeight: '900', fontSize: 18 }, brandName: { color: '#F4F7F1', fontSize: 12, letterSpacing: 1.35, fontWeight: '900' }, brandSub: { color: '#60695D', fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  connectionPill: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: '#2A3327', borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 7 }, connectionText: { color: '#9BA596', fontSize: 9, fontWeight: '800' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#596058' }, dotGood: { backgroundColor: '#C8FF3D' },
  pairingPage: { flexGrow: 1, padding: 24, backgroundColor: '#070A0F' }, pairingHero: { marginTop: 62, marginBottom: 32 }, heroTitle: { color: '#F4F7F1', fontSize: 47, lineHeight: 49, letterSpacing: -2.2, fontWeight: '800' }, heroCopy: { color: '#899287', fontSize: 15, lineHeight: 23, marginTop: 16 }, helper: { color: '#687166', fontSize: 12, lineHeight: 19, textAlign: 'center', margin: 20 },
  scrollPage: { padding: 20, paddingBottom: 42, gap: 14 }, homeTitle: { color: '#F4F7F1', fontSize: 43, lineHeight: 46, letterSpacing: -2, fontWeight: '800', marginVertical: 20 }, screenTitle: { color: '#F4F7F1', fontSize: 29, lineHeight: 34, letterSpacing: -1, fontWeight: '800', marginTop: 7, marginBottom: 10 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, titleCopy: { flex: 1 }, sessionActions: { alignItems: 'flex-end', gap: 8 }, voiceMini: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#526636', backgroundColor: '#162010', alignItems: 'center', justifyContent: 'center' }, voiceMiniText: { color: '#C8FF3D', fontSize: 18 },
  card: { backgroundColor: '#0E140F', borderWidth: 1, borderColor: '#273025', borderRadius: 20, padding: 18, gap: 12 }, cardAccent: { borderColor: '#617D32', backgroundColor: '#10190D' }, statusCard: { minHeight: 82, borderRadius: 18, padding: 17, backgroundColor: '#11170F', borderWidth: 1, borderColor: '#2B3528' }, eyebrow: { color: '#778172', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, sourceNote: { color: '#70806C', fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 5 }, cardTitle: { color: '#EEF2EA', fontSize: 20, lineHeight: 25, fontWeight: '700' }, cardCopy: { color: '#869083', fontSize: 12, lineHeight: 18 }, rootCause: { color: '#BCC6B7', fontSize: 14, lineHeight: 22 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 }, statusText: { color: '#AAB4A4', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, statusLarge: { color: '#E7ECE3', fontSize: 17, fontWeight: '800' },
  field: { minHeight: 52, borderWidth: 1, borderColor: '#30392D', borderRadius: 12, backgroundColor: '#080C09', color: '#E5EAE1', paddingHorizontal: 15, fontSize: 14 }, errorInput: { minHeight: 220, borderWidth: 1, borderColor: '#30392D', borderRadius: 14, backgroundColor: '#080C09', color: '#DCE3D8', padding: 16, fontSize: 13, lineHeight: 20, fontFamily: 'monospace' }, inlineError: { color: '#FF9A85', fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center', marginTop: 2 }, primaryText: { color: '#0B1008', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, secondaryButton: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#465043', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#CCD4C8', fontSize: 11, fontWeight: '800', letterSpacing: 1 }, disabled: { opacity: 0.42 }, pressed: { transform: [{ scale: 0.99 }] },
  actionGrid: { gap: 10 }, actionCard: { minHeight: 104, borderRadius: 17, borderWidth: 1, borderColor: '#30402A', backgroundColor: '#11180F', padding: 16, justifyContent: 'center' }, voiceAction: { borderColor: '#637E35', backgroundColor: '#14200F' }, actionIcon: { color: '#C8FF3D', fontSize: 20, marginBottom: 7 }, actionTitle: { color: '#EEF2EA', fontSize: 12, letterSpacing: 1, fontWeight: '900' }, actionSubtitle: { color: '#727B6E', fontSize: 11, marginTop: 4 },
  pipelineRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#222A20' }, pipelineIcon: { color: '#586056', width: 26, fontSize: 15 }, pipelineLabel: { color: '#697266', fontSize: 12 }, brightText: { color: '#D3DACF' }, successText: { color: '#C8FF3D' }, activeText: { color: '#F0C96B' }, failureText: { color: '#FF8B75' },
  workCard: { minHeight: 166, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 17, padding: 18, borderWidth: 1, borderColor: '#526B2E', borderRadius: 20, backgroundColor: '#10180E' }, workVisual: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }, workHalo: { position: 'absolute', width: 72, height: 72, borderRadius: 36, backgroundColor: '#C8FF3D' }, workOrbit: { position: 'absolute', width: 94, height: 94, borderRadius: 47, borderWidth: 1, borderColor: '#6C8A3B' }, workSatellite: { position: 'absolute', top: -4, left: 40, width: 9, height: 9, borderRadius: 5, backgroundColor: '#F0C96B', shadowColor: '#F0C96B', shadowOpacity: .65, shadowRadius: 6 }, workCore: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C8FF3D', backgroundColor: '#0A1008' }, workCoreText: { color: '#C8FF3D', fontSize: 15, fontWeight: '900', letterSpacing: .6 }, workCopy: { flex: 1, gap: 7 }, workEyebrow: { color: '#C8FF3D', fontSize: 8, fontWeight: '900', letterSpacing: 1.25 }, workTitle: { color: '#F2F6EE', fontSize: 18, lineHeight: 22, fontWeight: '800' }, workMessage: { minHeight: 36, color: '#A0AA9B', fontSize: 11, lineHeight: 17 }, workMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 }, workLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C8FF3D' }, workElapsed: { flex: 1, color: '#798474', fontSize: 9, lineHeight: 13 },
  badge: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, fontSize: 8, fontWeight: '900', letterSpacing: .7 }, badgeGood: { backgroundColor: '#203118', color: '#C8FF3D' }, badgeWarn: { backgroundColor: '#352B15', color: '#F0C96B' }, badgeBad: { backgroundColor: '#351B17', color: '#FF8B75' },
  info: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#252D23' }, infoValue: { color: '#AEB8AA', fontSize: 12, lineHeight: 19 }, evidence: { borderRadius: 10, backgroundColor: '#080C09', padding: 12, gap: 6 }, codeText: { color: '#C8FF3D', fontSize: 11, fontFamily: 'monospace' }, evidenceText: { color: '#808A7C', fontSize: 11, lineHeight: 17 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#273024', paddingVertical: 13 }, metric: { flex: 1 }, metricValue: { color: '#E9EEE5', fontSize: 13, fontWeight: '800' }, metricLabel: { color: '#657060', fontSize: 8, marginTop: 4, letterSpacing: 1 }, successActions: { gap: 9 },
  diffCard: { borderWidth: 1, borderColor: '#2B3428', borderRadius: 12, overflow: 'hidden', backgroundColor: '#070A08' }, diffHeader: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, diffCount: { color: '#A9C481', fontSize: 10 }, diffBody: { minWidth: 600, paddingVertical: 10 }, diffLine: { color: '#A6B0A1', fontSize: 10, lineHeight: 17, fontFamily: 'monospace', paddingHorizontal: 12 }, diffAdd: { color: '#C9EFB0', backgroundColor: '#182615' }, diffRemove: { color: '#F0A99E', backgroundColor: '#2A1714' }, approvalNote: { color: '#929B8E', fontSize: 11, lineHeight: 17 }, progressBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#111A0E' }, heroStatus: { color: '#EEF2EA', fontSize: 27, fontWeight: '900', letterSpacing: -.5 }, warningText: { color: '#E4BF6A', fontSize: 12, lineHeight: 19 },
  sessionCard: { minHeight: 76, padding: 14, borderWidth: 1, borderColor: '#283126', borderRadius: 15, backgroundColor: '#0E130F', flexDirection: 'row', alignItems: 'center', gap: 12 }, sessionCopy: { flex: 1 }, sessionTitle: { color: '#E4E9E0', fontSize: 13, fontWeight: '700' }, sessionTime: { color: '#687166', fontSize: 10, marginTop: 5 }, chevron: { color: '#87917F', fontSize: 25 }, link: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, emptyText: { color: '#687166', textAlign: 'center', marginTop: 60 },
  demoMobileRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: '#273025', paddingTop: 10 },
  settingRow: { padding: 18, borderWidth: 1, borderColor: '#283126', borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingTitle: { color: '#E8ECE4', fontSize: 15, fontWeight: '700' }, toggle: { color: '#7A8476', fontSize: 11, fontWeight: '900' }, toggleOn: { color: '#C8FF3D' }, securityCopy: { color: '#737D70', fontSize: 11, lineHeight: 18 },
  errorBanner: { margin: 12, padding: 13, paddingRight: 80, borderRadius: 12, borderWidth: 1, borderColor: '#6A372E', backgroundColor: '#251512', gap: 10 }, errorCopy: { alignSelf: 'stretch' }, errorTitle: { color: '#FF8B75', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, errorMessage: { color: '#D5A89F', fontSize: 10, lineHeight: 15, marginTop: 4 }, retry: { color: '#F0C96B', fontSize: 9, fontWeight: '900' },
  presentationPill: { color: '#0B1008', backgroundColor: '#C8FF3D', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5, fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  presentationPage: { padding: 18, paddingBottom: 42, gap: 13 }, presentationIntro: { paddingVertical: 20 }, presentationTitle: { color: '#F4F7F1', fontSize: 42, lineHeight: 44, letterSpacing: -2, fontWeight: '900', marginTop: 9 }, presentationCopy: { color: '#8C9688', fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 420 },
  readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, readinessItem: { width: '48%', minHeight: 68, padding: 10, borderWidth: 1, borderColor: '#2A3427', borderRadius: 10, backgroundColor: '#090D0A' }, readinessLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 }, readinessValue: { color: '#E4EAE0', fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 8 },
  scanHero: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 18, backgroundColor: '#C8FF3D' }, scanHeroIcon: { color: '#0A0E08', fontSize: 27 }, scanHeroTitle: { color: '#0A0E08', fontSize: 18, fontWeight: '900', letterSpacing: .8 }, scanHeroCopy: { color: '#364321', fontSize: 11, marginTop: 5 }, scanHeroArrow: { color: '#0A0E08', fontSize: 32, fontWeight: '400' },
  secondaryActionRow: { flexDirection: 'row', gap: 10 }, presentationAction: { flex: 1, minHeight: 86, padding: 14, justifyContent: 'center', borderWidth: 1, borderColor: '#394433', borderRadius: 14, backgroundColor: '#0E140F' }, presentationActionLabel: { color: '#EEF2EA', fontSize: 10, fontWeight: '900', letterSpacing: .7 }, presentationActionCopy: { color: '#737D70', fontSize: 9, marginTop: 5 }, networkTruth: { color: '#667061', textAlign: 'center', fontSize: 8, lineHeight: 14, letterSpacing: .4 },
  judgeLocation: { color: '#C8FF3D', fontSize: 18, lineHeight: 24, fontWeight: '800', fontFamily: 'monospace' }, confirmationCard: { gap: 12, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#7A6130', backgroundColor: '#17140B' }, confirmationCommand: { color: '#C8FF3D', backgroundColor: '#080C09', padding: 12, borderRadius: 9, fontSize: 11, lineHeight: 17, fontFamily: 'monospace' }, voiceFallback: { color: '#D3B867', fontSize: 10, lineHeight: 16 }, progressTitle: { color: '#DCE5D7', fontSize: 11, fontWeight: '900', letterSpacing: .6 }, successStatement: { color: '#DDE5D8', fontSize: 16, lineHeight: 23 }, finalTagline: { color: '#C8FF3D', textAlign: 'center', fontSize: 11, fontWeight: '800', letterSpacing: .4, paddingTop: 5 },
  tabBar: { minHeight: 72, paddingBottom: 5, borderTopWidth: 1, borderTopColor: '#202720', backgroundColor: '#090D0A', flexDirection: 'row' }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }, tabIcon: { color: '#596258', fontSize: 17 }, tabLabel: { color: '#596258', fontSize: 8, fontWeight: '800', letterSpacing: .8 }, tabActive: { color: '#C8FF3D' },
});
