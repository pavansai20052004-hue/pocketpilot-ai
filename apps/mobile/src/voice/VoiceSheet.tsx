import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  SpeechCapability,
  SpeechOutputProvider,
  SpeechRecognizer,
  VoiceExecutionResult,
  VoiceHistoryEntry,
  VoiceIntent,
  VoiceSessionContext,
} from './contracts';
import { resolveConfirmation, resolveVoiceIntent } from './intentResolver';
import { validateVoiceIntent } from './intentValidator';
import { formatApprovalPrompt, formatRollbackPrompt, type VoiceResponseData } from './responseFormatter';
import { AndroidSpeechRecognizer, openVoiceSettings } from './speechRecognizer';
import { AndroidTextToSpeech } from './speechOutput';
import { initialVoiceState, voiceReducer } from './state';
import { confirmationTarget, VoiceConfirmation } from './confirmation';
import { voiceCommandHints } from './commandHints';

const DEFAULT_LOCALE = 'en-IN';

export function VoiceSheet(props: {
  readonly context: VoiceSessionContext;
  readonly demoMode: boolean;
  readonly onCapability: (capability: SpeechCapability, ttsAvailable: boolean) => void;
  readonly onClose: () => void;
  readonly onExecute: (intent: VoiceIntent) => Promise<VoiceExecutionResult>;
  readonly open: boolean;
  readonly responseData: VoiceResponseData;
  readonly recognizer?: SpeechRecognizer;
  readonly speechOutput?: SpeechOutputProvider;
}) {
  const recognizer = useMemo(() => props.recognizer ?? new AndroidSpeechRecognizer(), [props.recognizer]);
  const speechOutput = useMemo(() => props.speechOutput ?? new AndroidTextToSpeech(), [props.speechOutput]);
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [capability, setCapability] = useState<SpeechCapability | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [confirmationSeconds, setConfirmationSeconds] = useState(0);
  const [history, setHistory] = useState<ReadonlyArray<VoiceHistoryEntry>>([]);
  const confirmation = useRef(new VoiceConfirmation());
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const confirmationListening = useRef(false);
  const active = useRef(true);
  const foreground = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const listenVersion = useRef(0);
  const listenInFlight = useRef(false);

  const cancelListening = useCallback(() => {
    listenVersion.current += 1;
    listenInFlight.current = false;
    recognizer.cancel();
  }, [recognizer]);

  const clearConfirmation = useCallback(() => {
    confirmation.current.clear();
    if (confirmationTimer.current !== null) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = null;
  }, []);

  useEffect(() => {
    if (state.pending_confirmation === null) return;
    const interval = setInterval(() => setConfirmationSeconds(confirmation.current.secondsRemaining()), 250);
    return () => clearInterval(interval);
  }, [state.pending_confirmation]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; cancelListening(); clearConfirmation(); recognizer.dispose(); void speechOutput.stop(); };
  }, [recognizer, speechOutput, clearConfirmation, cancelListening]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      foreground.current = next === 'active';
      if (next === 'active') {
        if (!props.open) return;
        cancelListening();
        recognizer.dispose();
        void speechOutput.stop();
        clearConfirmation();
        confirmationListening.current = false;
        dispatch({ type: 'RESET' });
        return;
      }
      if (!props.open) return;
      cancelListening();
      recognizer.dispose();
      void speechOutput.stop();
      clearConfirmation();
      confirmationListening.current = false;
      dispatch({ type: 'RESET' });
    });
    return () => subscription.remove();
  }, [props.open, recognizer, speechOutput, clearConfirmation, cancelListening]);

  useEffect(() => {
    if (!props.open) return;
    void Promise.all([
      recognizer.getCapability(DEFAULT_LOCALE),
      recognizer.getPermission(),
      speechOutput.getAvailable(DEFAULT_LOCALE),
    ]).then(([nextCapability, permission, speechAvailable]) => {
      if (!active.current) return;
      setCapability(nextCapability);
      setTtsAvailable(speechAvailable);
      dispatch({ type: 'PERMISSION', permission });
      props.onCapability(nextCapability, speechAvailable);
    }).catch(() => {
      const unavailable: SpeechCapability = { available: false, locale: DEFAULT_LOCALE, offline_requested: true, offline_supported: false, offline_verified: false, provider_name: null };
      setCapability(unavailable);
      props.onCapability(unavailable, false);
    });
  }, [props.open, props.onCapability, recognizer, speechOutput]);

  const speak = useCallback(async (text: string | null) => {
    if (!text || !ttsAvailable) return;
    try {
      await speechOutput.speak(text, DEFAULT_LOCALE, () => dispatch({ type: 'TTS_STARTED', at: Date.now() }));
    } catch {
      // The visual result remains available when the phone TTS service fails.
    }
  }, [speechOutput, ttsAvailable]);

  const execute = useCallback(async (intent: VoiceIntent, transcript: string) => {
    const executionVersion = listenVersion.current;
    dispatch({ type: 'EXECUTING', at: Date.now() });
    const freshValidation = validateVoiceIntent(intent, latest.current.context);
    if (!freshValidation.allowed) {
      dispatch({ type: 'FAILED', message: freshValidation.reason, at: Date.now() });
      await speak(freshValidation.reason);
      return;
    }
    try {
      const result = await latest.current.onExecute(intent);
      if (!active.current || !foreground.current || executionVersion !== listenVersion.current) return;
      dispatch({ type: 'COMPLETED', result, at: Date.now() });
      setHistory((current) => [{ transcript, intent, completed_at: new Date().toISOString() }, ...current].slice(0, 5));
      await speak(result.spoken_response);
    } catch (error) {
      if (!active.current || !foreground.current || executionVersion !== listenVersion.current) return;
      const message = error instanceof Error ? error.message : 'The voice action could not complete.';
      dispatch({ type: 'FAILED', message, at: Date.now() });
      await speak(message);
    }
  }, [speak]);

  const handleTranscript = useCallback(async (transcript: string, confidence: number | null, duration: number) => {
    if (!active.current || !foreground.current || !latest.current.open) return;
    dispatch({ type: 'FINAL_RESULT', transcript, confidence, duration });
    if (confirmationListening.current) {
      confirmationListening.current = false;
      const answer = resolveConfirmation(transcript);
      const requested = answer === 'CONFIRM' ? confirmation.current.consume(confirmationTarget(latest.current.responseData)) : null;
      clearConfirmation();
      if (requested !== null) {
        await execute(requested, transcript);
      } else if (answer === 'CANCEL') {
        dispatch({ type: 'COMPLETED', result: { success: true, message: 'Voice action cancelled.', spoken_response: null }, at: Date.now() });
      } else {
        dispatch({ type: 'FAILED', message: 'Confirmation expired, changed, or was not understood. Review the patch and request the action again. Nothing was changed.', at: Date.now() });
      }
      return;
    }

    const resolution = resolveVoiceIntent(transcript, latest.current.context.session_state);
    const validation = validateVoiceIntent(resolution.intent, latest.current.context);
    dispatch({ type: 'RESOLVED', resolution, validation });
    if (!validation.allowed) {
      dispatch({ type: 'FAILED', message: validation.reason, at: Date.now() });
      await speak(validation.reason);
      return;
    }
    if (validation.confirmation_required) {
      clearConfirmation();
      if (!confirmation.current.begin(resolution.intent, confirmationTarget(latest.current.responseData))) {
        dispatch({ type: 'FAILED', message: 'Refresh and review the patch before requesting confirmation.', at: Date.now() });
        return;
      }
      setConfirmationSeconds(confirmation.current.secondsRemaining());
      confirmationTimer.current = setTimeout(() => {
        clearConfirmation();
        cancelListening();
        dispatch({ type: 'FAILED', message: 'Confirmation timed out. Nothing was changed.', at: Date.now() });
      }, 30_000);
      const prompt = resolution.intent === 'APPROVE_PATCH' ? formatApprovalPrompt(latest.current.responseData) : formatRollbackPrompt();
      dispatch({ type: 'AWAIT_CONFIRMATION', resolution, message: prompt });
      await speak(prompt);
      return;
    }
    await execute(resolution.intent, transcript);
  }, [execute, speak, clearConfirmation, cancelListening]);

  const listen = useCallback(async (forConfirmation = false) => {
    if (!active.current || !foreground.current || !latest.current.open) return;
    if (listenInFlight.current) {
      if (state.phase === 'PROCESSING' || state.phase === 'LISTENING') return;
      cancelListening();
    }
    listenInFlight.current = true;
    const version = ++listenVersion.current;
    const isCurrent = () => active.current && foreground.current && latest.current.open && version === listenVersion.current;
    if (!forConfirmation) clearConfirmation();
    const confirmationResolution = forConfirmation ? state.pending_confirmation : null;
    const fail = (code: string, message: string) => {
      if (!isCurrent()) return;
      cancelListening();
      if (
        forConfirmation
        && confirmationResolution !== null
        && ['NO_SPEECH', 'NO_MATCH', 'TIMEOUT', 'RECOGNIZER_BUSY'].includes(code)
        && confirmation.current.isPending(confirmationTarget(latest.current.responseData))
      ) {
        confirmationListening.current = false;
        dispatch({ type: 'AWAIT_CONFIRMATION', resolution: confirmationResolution, message: `${message} Confirmation is still pending; tap SAY YES OR CANCEL and try again.` });
        return;
      }
      dispatch({ type: 'FAILED', message, at: Date.now() });
      void recognizer.getCapability(DEFAULT_LOCALE).then((next) => {
        if (!active.current) return;
        setCapability(next);
        props.onCapability(next, ttsAvailable);
      }).catch(() => undefined);
    };
    try {
      await speechOutput.stop();
      if (!isCurrent()) return;
      if (capability?.available !== true) {
        fail('SPEECH_UNAVAILABLE', 'Speech recognition is unavailable on this phone.');
        return;
      }
      let permission = state.permission;
      if (permission !== 'GRANTED') {
        if (permission === 'PERMANENTLY_DENIED') { cancelListening(); return; }
        dispatch({ type: 'REQUEST_PERMISSION' });
        permission = await recognizer.requestPermission();
        if (!isCurrent()) return;
        dispatch({ type: 'PERMISSION', permission });
        if (permission !== 'GRANTED') {
          fail('MIC_PERMISSION_DENIED', 'Microphone access is required for voice commands.');
          return;
        }
      }
      confirmationListening.current = forConfirmation;
      dispatch({ type: 'START', at: Date.now(), forConfirmation });
      await recognizer.start(DEFAULT_LOCALE, {
        onListening: () => { if (isCurrent()) dispatch({ type: 'LISTENING', at: Date.now() }); },
        onResult: (result) => {
          if (!isCurrent()) return;
          if (result.isFinal) {
            cancelListening();
            void handleTranscript(result.transcript, result.confidence, result.recognition_duration_ms);
          } else dispatch({ type: 'PARTIAL_RESULT', transcript: result.transcript, confidence: result.confidence });
        },
        onError: fail,
        onEnd: () => fail('NO_SPEECH', 'Listening ended without a final transcript. Try again.'),
      }, { contextualStrings: voiceCommandHints(latest.current.context, forConfirmation) });
    } catch (error) {
      fail('UNKNOWN', error instanceof Error ? error.message : 'Speech recognition could not start.');
    }
  }, [capability?.available, handleTranscript, recognizer, speechOutput, state.permission, state.pending_confirmation, state.phase, props.onCapability, ttsAvailable, clearConfirmation, cancelListening]);

  function resetVoice() {
    cancelListening();
    void speechOutput.stop();
    clearConfirmation();
    confirmationListening.current = false;
    dispatch({ type: 'RESET' });
  }

  function close() {
    resetVoice();
    props.onClose();
  }

  async function confirm() {
    const intent = confirmation.current.consume(confirmationTarget(latest.current.responseData));
    clearConfirmation();
    cancelListening();
    if (intent === null) {
      dispatch({ type: 'FAILED', message: 'Confirmation expired or the patch changed. Review it and request the action again.', at: Date.now() });
      return;
    }
    await execute(intent, state.transcript);
  }

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={props.open}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}><View><Text style={styles.eyebrow}>POCKETPILOT VOICE</Text><Text style={styles.title}>Say it safely.</Text></View><Pressable accessibilityLabel="Close voice commands" onPress={close}><Text style={styles.close}>CLOSE</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.content}>
            {capability === null ? <ActivityIndicator color="#C8FF3D" /> : <View style={styles.capability}><Text style={styles.capabilityText}>{capability.available ? 'SPEECH SERVICE AVAILABLE' : 'SPEECH UNAVAILABLE'} · {DEFAULT_LOCALE}</Text><Text style={styles.capabilitySub}>{capability.offline_requested ? 'Offline requested · not verified' : 'Phone speech service · may use internet'}</Text></View>}

            <Pressable accessibilityLabel={state.phase === 'LISTENING' ? 'Stop listening' : 'Tap to speak a PocketPilot command'} accessibilityRole="button" disabled={['PROCESSING', 'REQUESTING_PERMISSION', 'EXECUTING'].includes(state.phase)} onPress={() => state.phase === 'LISTENING' ? recognizer.stop() : void listen(state.phase === 'AWAITING_CONFIRMATION')} style={[styles.mic, state.phase === 'LISTENING' && styles.micListening]}>
              <Text style={styles.micIcon}>●</Text><Text style={styles.micLabel}>{state.phase === 'LISTENING' ? 'SPEAK NOW' : state.phase === 'PROCESSING' ? 'STARTING MIC…' : state.phase === 'REQUESTING_PERMISSION' ? 'ALLOW MICROPHONE' : state.phase === 'EXECUTING' ? 'WORKING…' : 'TAP TO SPEAK'}</Text>
            </Pressable>
            <Text style={styles.privacy}>{state.pending_confirmation !== null ? (state.phase === 'LISTENING' ? 'Listening for “Yes” or “Cancel”.' : 'Tap SAY YES OR CANCEL, wait for SPEAK NOW, then answer.') : state.phase === 'LISTENING' ? 'Listening… Say one short command, then pause.' : 'Tap once and wait for SPEAK NOW before talking.'}</Text>
            {state.pending_confirmation !== null && <Text style={styles.capabilityText}>CONFIRM WITHIN {confirmationSeconds}s</Text>}

            {state.permission === 'PERMANENTLY_DENIED' && <View style={styles.warning}><Text style={styles.warningTitle}>MICROPHONE ACCESS REQUIRED</Text><Text style={styles.body}>Enable microphone access in Android settings. PocketPilot will not repeatedly prompt.</Text><Pressable accessibilityLabel="Open Android settings" onPress={() => void openVoiceSettings()} style={styles.secondary}><Text style={styles.secondaryText}>OPEN SETTINGS</Text></Pressable></View>}

            {state.transcript !== '' && <View style={styles.card}><Text style={styles.eyebrow}>YOU SAID</Text><Text style={styles.transcript}>“{state.transcript}”</Text><Text style={styles.meta}>{state.transcript_confidence === null ? 'Confidence unavailable' : `${Math.round(state.transcript_confidence * 100)}% recognition confidence`}</Text></View>}
            {state.resolution !== null && <View style={styles.card}><Text style={styles.eyebrow}>SAFE INTENT</Text><Text style={styles.intent}>{state.resolution.intent.replaceAll('_', ' ')}</Text><Text style={styles.meta}>{state.resolution.confidence} · {state.resolution.resolution_ms}ms</Text><Text style={styles.meta}>{state.resolution.reason}</Text></View>}
            {state.message !== null && <View style={[styles.card, state.phase === 'FAILED' && styles.errorCard]}><Text style={styles.eyebrow}>{state.phase === 'AWAITING_CONFIRMATION' ? 'CONFIRMATION REQUIRED' : state.phase === 'FAILED' ? 'NOT EXECUTED' : 'POCKETPILOT'}</Text><Text style={styles.body}>{state.message}</Text></View>}

            {state.phase === 'AWAITING_CONFIRMATION' && <View style={styles.actions}><Pressable accessibilityLabel="Confirm voice action" onPress={() => void confirm()} style={styles.primary}><Text style={styles.primaryText}>CONFIRM</Text></Pressable><Pressable accessibilityLabel="Say confirmation" onPress={() => void listen(true)} style={styles.secondary}><Text style={styles.secondaryText}>SAY YES OR CANCEL</Text></Pressable><Pressable accessibilityLabel="Cancel voice action" onPress={resetVoice} style={styles.secondary}><Text style={styles.secondaryText}>CANCEL</Text></Pressable></View>}
            {state.phase === 'LISTENING' && <Pressable accessibilityLabel="Cancel listening" onPress={resetVoice} style={styles.secondary}><Text style={styles.secondaryText}>CANCEL LISTENING</Text></Pressable>}
            {['COMPLETED', 'FAILED'].includes(state.phase) && <Pressable accessibilityLabel="Try another voice command" onPress={resetVoice} style={styles.secondary}><Text style={styles.secondaryText}>NEW COMMAND</Text></Pressable>}
            {state.metrics.total_voice_action_duration_ms !== null && <View style={styles.card}><Text style={styles.eyebrow}>VOICE LATENCY</Text><Text style={styles.meta}>Speech start {state.metrics.speech_start_latency_ms ?? '—'}ms · Recognition {state.metrics.recognition_duration_ms ?? '—'}ms · Intent {state.metrics.intent_resolution_ms ?? '—'}ms · Total {state.metrics.total_voice_action_duration_ms}ms</Text></View>}
            {ttsAvailable && <Pressable accessibilityLabel="Stop speaking" onPress={() => void speechOutput.stop()} style={styles.stopSpeech}><Text style={styles.stopSpeechText}>STOP SPEAKING</Text></Pressable>}

            {props.demoMode && <View style={styles.card}><Text style={styles.eyebrow}>TRY SAYING</Text><Text style={styles.body}>“Analyze this error” · “Generate a fix” · “Explain the problem” · “Approve fix” · “Undo fix”</Text></View>}
            {history.length > 0 && <View style={styles.card}><Text style={styles.eyebrow}>THIS SESSION</Text>{history.map((item) => <Text key={item.completed_at} style={styles.history}>“{item.transcript}” → {item.intent}</Text>)}</View>}
            <Text style={styles.privacy}>Audio is handled by the phone’s selected speech service and is never stored by PocketPilot. Only the transcript is interpreted. Voice can invoke only the same closed, state-checked actions as the visible buttons.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.66)' },
  sheet: { maxHeight: '93%', minHeight: '72%', backgroundColor: '#070A0F', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#33402E', overflow: 'hidden' },
  header: { minHeight: 88, paddingLeft: 20, paddingRight: 92, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222B21', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { padding: 20, paddingBottom: 42, gap: 14 }, eyebrow: { color: '#778172', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, title: { color: '#F4F7F1', fontSize: 27, fontWeight: '800', marginTop: 5 }, close: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  capability: { alignItems: 'center', gap: 4 }, capabilityText: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, capabilitySub: { color: '#778172', fontSize: 10 },
  mic: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: '#C8FF3D', backgroundColor: '#101A0D', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 10 }, micListening: { backgroundColor: '#243615', borderWidth: 5 }, micIcon: { color: '#C8FF3D', fontSize: 36 }, micLabel: { color: '#EAF1E4', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  card: { padding: 16, gap: 8, borderRadius: 15, backgroundColor: '#0E140F', borderWidth: 1, borderColor: '#293427' }, errorCard: { borderColor: '#6A372E', backgroundColor: '#211411' }, transcript: { color: '#F1F5ED', fontSize: 20, lineHeight: 27, fontWeight: '700' }, intent: { color: '#C8FF3D', fontSize: 16, fontWeight: '900', letterSpacing: .7 }, meta: { color: '#778172', fontSize: 10 }, body: { color: '#AAB3A6', fontSize: 13, lineHeight: 20 },
  warning: { padding: 16, gap: 10, borderRadius: 15, backgroundColor: '#211D10', borderWidth: 1, borderColor: '#675421' }, warningTitle: { color: '#F0C96B', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, actions: { gap: 10 }, primary: { minHeight: 54, borderRadius: 13, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#0B1008', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, secondary: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#465043', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#CCD4C8', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  stopSpeech: { minHeight: 40, alignItems: 'center', justifyContent: 'center' }, stopSpeechText: { color: '#F0C96B', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, history: { color: '#98A493', fontSize: 11, lineHeight: 18 }, privacy: { color: '#647060', fontSize: 10, lineHeight: 16, textAlign: 'center' },
});
