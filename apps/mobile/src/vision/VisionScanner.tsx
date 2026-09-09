import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { OcrWarningCode, VisionInputSource } from '@pocketpilot/shared-types';

import { AndroidCameraCaptureSource, GalleryCaptureSource } from './captureSources';
import { cleanupVisionFiles } from './cleanup';
import type { CapturedImage, PreparedImage } from './contracts';
import { OnDeviceOcrProvider } from './ocrProvider';
import { preprocessImage } from './preprocess';
import { initialVisionState, visionReducer } from './state';
import { WorkInProgress } from '../ui/WorkInProgress';

const WARNING_COPY: Readonly<Record<OcrWarningCode, string>> = {
  EMPTY_TEXT: 'No readable text was found.',
  SHORT_TEXT: 'Very little text was recognized.',
  LOW_TECHNICAL_SIGNAL: 'This may not contain a complete technical error.',
  NOISY_TEXT: 'Some characters look noisy or corrupted.',
  POSSIBLE_SECRET: 'Possible credential or secret detected. Remove it before analysis.',
  POSSIBLE_PROMPT_INJECTION: 'Instruction-like text detected. Treat it as untrusted and remove anything unrelated to the error.',
  TEXT_TRIMMED_TO_ERROR: 'Non-technical text above the likely error was removed. Compare with Raw OCR.',
};

interface VisionScannerProps {
  readonly onAnalyze: (text: string, source: VisionInputSource) => Promise<boolean>;
  readonly onClose: () => void;
  readonly onReviewText: (text: string, source: VisionInputSource) => void;
  readonly onSpeak: () => void;
}

export function VisionScanner({ onAnalyze, onClose, onReviewText, onSpeak }: VisionScannerProps) {
  const [state, dispatch] = useReducer(visionReducer, initialVisionState);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [draft, setDraft] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [sending, setSending] = useState(false);
  const camera = useRef<CameraView>(null);
  const files = useRef<{ captured: CapturedImage | null; prepared: PreparedImage | null }>({ captured: null, prepared: null });
  const ocr = useRef(new OnDeviceOcrProvider()).current;

  files.current = { captured: state.captured, prepared: state.prepared };
  useEffect(() => () => cleanupVisionFiles(files.current.captured, files.current.prepared), []);
  useEffect(() => {
    if (state.result !== null) {
      setDraft(state.result.normalized_text);
      onReviewText(state.result.normalized_text, state.result.source);
    }
  }, [onReviewText, state.result]);

  async function openCamera() {
    setCameraReady(false);
    if (cameraPermission?.granted === true) {
      dispatch({ type: 'OPEN_CAMERA' });
      return;
    }
    const next = await requestCameraPermission();
    dispatch({ type: 'OPEN_CAMERA' });
    if (!next.granted) setCameraReady(false);
  }

  async function captureCamera() {
    try {
      const source = new AndroidCameraCaptureSource(async () => camera.current?.takePictureAsync({ quality: 0.92, skipProcessing: false }));
      const image = await source.capture();
      if (image !== null) dispatch({ type: 'CAPTURED', image });
    } catch {
      dispatch({ type: 'FAIL', message: 'The camera could not capture this image. Check storage access and try again.' });
    }
  }

  async function chooseGallery() {
    try {
      const image = await new GalleryCaptureSource().capture();
      if (image !== null) dispatch({ type: 'CAPTURED', image });
    } catch {
      dispatch({ type: 'FAIL', message: 'PocketPilot could not open that image. Choose a local screenshot or photo.' });
    }
  }

  async function recognize(cropToGuide: boolean) {
    if (state.captured === null) return;
    dispatch({ type: 'PROCESS' });
    let prepared: PreparedImage | null = null;
    try {
      prepared = await preprocessImage(state.captured, state.orientation, cropToGuide);
      const result = await ocr.recognize(prepared);
      dispatch({ type: 'RECOGNIZED', image: prepared, result });
    } catch (error) {
      cleanupVisionFiles(null, prepared);
      dispatch({ type: 'FAIL', message: error instanceof Error ? error.message : 'OCR failed safely. No image was uploaded.' });
    }
  }

  function discardAndRetake() {
    cleanupVisionFiles(state.captured, state.prepared);
    dispatch({ type: 'RETAKE' });
  }

  function close() {
    cleanupVisionFiles(state.captured, state.prepared);
    onClose();
  }

  async function analyze() {
    if (state.result === null || !draft.trim()) return;
    setSending(true);
    const accepted = await onAnalyze(draft.trim(), state.result.source);
    setSending(false);
    if (accepted) {
      cleanupVisionFiles(state.captured, state.prepared);
      onClose();
    }
  }

  if (state.phase === 'SOURCE') {
    return <VisionPage title="Scan an error" subtitle="The image stays on this phone. Only text you review and confirm is sent to your paired laptop." onClose={close}>
      <Action label="USE CAMERA" detail="Frame a terminal, traceback, or compiler error" onPress={() => void openCamera()} />
      <Action label="CHOOSE SCREENSHOT" detail="Pick an existing image from your gallery" onPress={() => void chooseGallery()} />
      <PrivacyNote />
    </VisionPage>;
  }

  if (state.phase === 'CAMERA') {
    if (cameraPermission?.granted !== true) {
      const permanent = cameraPermission !== null && !cameraPermission.canAskAgain;
      return <VisionPage title="Camera permission" subtitle="PocketPilot needs camera access only while you scan an error." onClose={close}>
        <Text style={styles.body}>{permanent ? 'Camera access is blocked in Android settings.' : 'Camera access was not granted. You can retry or use a screenshot instead.'}</Text>
        <Action label={permanent ? 'OPEN SETTINGS' : 'TRY CAMERA AGAIN'} detail={permanent ? 'Enable Camera for PocketPilot' : 'Show the Android permission prompt'} onPress={() => { if (permanent) void Linking.openSettings(); else void openCamera(); }} />
        <Action label="CHOOSE SCREENSHOT" detail="Camera permission is not required" onPress={() => void chooseGallery()} />
      </VisionPage>;
    }
    return <View style={styles.cameraPage}>
      <CameraView ref={camera} enableTorch={torch} facing="back" onCameraReady={() => setCameraReady(true)} style={StyleSheet.absoluteFill} />
      <View style={styles.cameraShade} pointerEvents="none"><View style={styles.scanGuide}><Text style={styles.guideText}>ALIGN ERROR TEXT INSIDE</Text></View></View>
      <View style={styles.cameraHeader}><Pressable accessibilityLabel="Close scanner" onPress={close}><Text style={styles.cameraControl}>CLOSE</Text></Pressable><Pressable accessibilityLabel="Toggle flashlight" onPress={() => setTorch(!torch)}><Text style={styles.cameraControl}>{torch ? 'FLASH ON' : 'FLASH OFF'}</Text></Pressable></View>
      <View style={styles.captureBar}><Text style={styles.cameraHint}>Hold steady · fill the guide · avoid glare</Text><Pressable accessibilityLabel="Capture error photo" disabled={!cameraReady} onPress={() => void captureCamera()} style={[styles.shutter, !cameraReady && styles.disabled]}><View style={styles.shutterCore} /></Pressable><Pressable accessibilityLabel="Choose screenshot" onPress={() => void chooseGallery()}><Text style={styles.galleryLink}>GALLERY</Text></Pressable></View>
    </View>;
  }

  if (state.phase === 'PREVIEW' && state.captured !== null) {
    return <VisionPage title="Review image" subtitle="Rotate if needed. The guided crop removes surrounding screen content before OCR." onClose={close}>
      <View style={styles.previewFrame}>
        <Image resizeMode="contain" source={{ uri: state.captured.uri }} style={[styles.previewImage, { transform: [{ rotate: `${state.orientation}deg` }] }]} />
        <View pointerEvents="none" style={styles.previewGuide} />
      </View>
      <View style={styles.row}><SmallAction label="ROTATE 90°" onPress={() => dispatch({ type: 'ROTATE' })} /><SmallAction label="RETAKE" onPress={discardAndRetake} /></View>
      <PrimaryAction label="READ GUIDED AREA" onPress={() => void recognize(true)} />
      <SmallAction label="READ FULL IMAGE" onPress={() => void recognize(false)} />
    </VisionPage>;
  }

  if (state.phase === 'PROCESSING') {
    return <VisionPage title="Reading on device" subtitle="ML Kit is extracting text locally. The image is not sent to the laptop or cloud." onClose={close}>
      <View style={styles.processing}><ActivityIndicator color="#C8FF3D" size="large" /><Text style={styles.body}>PREPROCESSING · OCR · QUALITY CHECK</Text></View>
    </VisionPage>;
  }

  if (state.phase === 'REVIEW' && state.result !== null && sending) {
    return <VisionPage title="Analyzing error" subtitle="Your confirmed text is now being checked against bounded source context on the laptop." onClose={close}>
      <WorkInProgress phase="ANALYZE" />
      <View style={styles.analysisSafety}><Text style={styles.analysisSafetyTitle}>SAFE WHILE YOU WAIT</Text><Text style={styles.analysisSafetyText}>PocketPilot is reading only the selected workspace. No files can change during analysis.</Text></View>
    </VisionPage>;
  }

  if (state.phase === 'REVIEW' && state.result !== null) {
    const quality = state.result.quality;
    return <VisionPage title="Confirm extracted text" subtitle="OCR can be wrong. Edit the text below before analysis." onClose={close}>
      <View style={styles.capturedSummary}><Text style={styles.capturedEyebrow}>ERROR CAPTURED</Text><Text style={styles.detectedType}>Detected: {detectedErrorKind(draft)}</Text><View style={styles.tokenRow}>{criticalIdentifiers(draft).map((token) => <Text key={token} style={styles.token}>{token}</Text>)}</View></View>
      <View style={styles.qualityRow}><Text style={[styles.quality, quality.level === 'GOOD' ? styles.good : quality.level === 'POOR' ? styles.bad : styles.warn]}>{quality.level} · {quality.score}/100</Text><Text style={styles.source}>{state.result.source} · {state.result.duration_ms}ms</Text></View>
      {quality.warnings.map((warning) => <Text key={warning} style={warning === 'POSSIBLE_SECRET' || warning === 'POSSIBLE_PROMPT_INJECTION' ? styles.dangerWarning : styles.warning}>⚠ {WARNING_COPY[warning]}</Text>)}
      <Text style={styles.label}>EDITABLE TEXT SENT TO LAPTOP</Text>
      <TextInput accessibilityLabel="Editable OCR text" autoCapitalize="none" autoCorrect={false} multiline onChangeText={(text) => { setDraft(text); onReviewText(text, state.result!.source); }} style={styles.textArea} textAlignVertical="top" value={draft} />
      <Pressable accessibilityLabel="Toggle raw OCR text" onPress={() => setShowRaw(!showRaw)}><Text style={styles.rawLink}>{showRaw ? 'HIDE RAW OCR' : 'COMPARE RAW OCR'}</Text></Pressable>
      {showRaw && <Text selectable style={styles.rawText}>{state.result.raw_text || '(empty)'}</Text>}
      <PrivacyNote />
      <SmallAction label="SPEAK COMMAND" onPress={onSpeak} />
      <PrimaryAction disabled={sending || !draft.trim()} label={sending ? 'SENDING CONFIRMED TEXT…' : 'ANALYZE ERROR'} onPress={() => void analyze()} />
      <SmallAction label="DISCARD & RETAKE" onPress={discardAndRetake} />
    </VisionPage>;
  }

  return <VisionPage title="Could not read image" subtitle={state.message ?? 'OCR failed safely. No image was uploaded.'} onClose={close}>
    <Action label="TRY ANOTHER IMAGE" detail="Retake the photo or choose a clearer screenshot" onPress={discardAndRetake} />
    <PrivacyNote />
  </VisionPage>;
}

function detectedErrorKind(text: string): string {
  if (/traceback|\.py:\d+|File\s+".*\.py"/i.test(text)) return 'Python traceback';
  if (/at\s+.*\.java:\d+|Exception/i.test(text)) return 'Java exception';
  if (/\.tsx?:\d+|TypeScript|React/i.test(text)) return 'React / TypeScript error';
  return 'technical error';
}

function criticalIdentifiers(text: string): ReadonlyArray<string> {
  const tokens = new Set<string>();
  const errorType = text.match(/\b[A-Z][A-Za-z]+(?:Error|Exception)\b/)?.[0];
  const file = text.match(/\b[\w.-]+\.(?:py|tsx?|java)\b/i)?.[0];
  const line = text.match(/(?:line\s+|:)(\d+)\b/i)?.[1];
  if (errorType) tokens.add(errorType);
  if (file) tokens.add(file);
  if (line) tokens.add(`line ${line}`);
  return [...tokens].slice(0, 3);
}

function VisionPage({ children, title, subtitle, onClose }: { children: React.ReactNode; title: string; subtitle: string; onClose: () => void }) {
  return <View style={styles.page}><View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>VISION DEBUGGER</Text><Text style={styles.title}>{title}</Text></View><Pressable accessibilityLabel="Close vision debugger" onPress={onClose}><Text style={styles.close}>CLOSE</Text></Pressable></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.subtitle}>{subtitle}</Text>{children}</ScrollView></View>;
}

function Action({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.action}><Text style={styles.actionLabel}>{label}</Text><Text style={styles.actionDetail}>{detail}</Text></Pressable>;
}
function PrimaryAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}
function SmallAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.smallAction}><Text style={styles.smallText}>{label}</Text></Pressable>;
}
function PrivacyNote() { return <View style={styles.privacy}><Text style={styles.privacyTitle}>PRIVATE BY DEFAULT</Text><Text style={styles.privacyText}>OCR runs on this device. Photos and screenshots are never uploaded. Temporary camera and processed files are deleted after use; gallery originals are never deleted.</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#070A0F' }, header: { minHeight: 78, paddingLeft: 18, paddingRight: 92, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222B21', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerCopy: { flex: 1 }, eyebrow: { color: '#778172', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, title: { color: '#F4F7F1', fontSize: 24, fontWeight: '800', marginTop: 4 }, close: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, content: { padding: 20, paddingBottom: 48, gap: 14 }, subtitle: { color: '#929C8E', fontSize: 14, lineHeight: 21, marginBottom: 5 }, body: { color: '#AAB3A6', fontSize: 13, lineHeight: 20 },
  action: { minHeight: 92, padding: 18, borderRadius: 17, borderWidth: 1, borderColor: '#34412E', backgroundColor: '#11180F', justifyContent: 'center' }, actionLabel: { color: '#ECF2E7', fontSize: 13, fontWeight: '900', letterSpacing: 1 }, actionDetail: { color: '#7F897A', fontSize: 12, marginTop: 7 }, primary: { minHeight: 54, borderRadius: 13, backgroundColor: '#C8FF3D', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#0B1008', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, disabled: { opacity: 0.4 }, smallAction: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#465043', alignItems: 'center', justifyContent: 'center', flex: 1 }, smallText: { color: '#CCD4C8', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, row: { flexDirection: 'row', gap: 10 },
  privacy: { padding: 15, borderRadius: 13, backgroundColor: '#0C1511', borderWidth: 1, borderColor: '#244333' }, privacyTitle: { color: '#79D9A2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, privacyText: { color: '#82A08C', fontSize: 11, lineHeight: 17, marginTop: 6 },
  cameraPage: { flex: 1, backgroundColor: '#000' }, cameraShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.22)' }, scanGuide: { width: '92%', height: '54%', borderWidth: 2, borderColor: '#C8FF3D', borderRadius: 14, justifyContent: 'flex-start', alignItems: 'center' }, guideText: { color: '#0B1008', backgroundColor: '#C8FF3D', paddingHorizontal: 10, paddingVertical: 5, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, cameraHeader: { position: 'absolute', left: 0, right: 0, top: 0, minHeight: 72, paddingLeft: 20, paddingRight: 92, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.55)' }, cameraControl: { color: '#F3F6F0', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, captureBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 150, padding: 20, alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.72)' }, cameraHint: { color: '#C5CDC1', fontSize: 11 }, shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: '#F5F7F2', alignItems: 'center', justifyContent: 'center' }, shutterCore: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#C8FF3D' }, galleryLink: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  previewFrame: { height: 390, overflow: 'hidden', borderRadius: 16, backgroundColor: '#020302', alignItems: 'center', justifyContent: 'center' }, previewImage: { width: '100%', height: '100%' }, previewGuide: { position: 'absolute', width: '90%', height: '62%', borderWidth: 2, borderColor: '#C8FF3D', borderRadius: 10 }, processing: { minHeight: 300, gap: 24, alignItems: 'center', justifyContent: 'center' },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, quality: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, good: { color: '#C8FF3D', backgroundColor: '#203118' }, warn: { color: '#F0C96B', backgroundColor: '#352B15' }, bad: { color: '#FF8B75', backgroundColor: '#351B17' }, source: { color: '#697266', fontSize: 9, fontWeight: '800' }, warning: { color: '#D9B968', backgroundColor: '#211D10', padding: 10, borderRadius: 9, fontSize: 11, lineHeight: 17 }, dangerWarning: { color: '#FF9A85', backgroundColor: '#251512', padding: 10, borderRadius: 9, fontSize: 11, lineHeight: 17 }, label: { color: '#778172', fontSize: 9, letterSpacing: 1.2, fontWeight: '800', marginTop: 5 }, textArea: { minHeight: 260, borderWidth: 1, borderColor: '#3A4437', borderRadius: 13, backgroundColor: '#080C09', color: '#E1E7DD', padding: 15, fontSize: 12, lineHeight: 19, fontFamily: 'monospace' }, rawLink: { color: '#C8FF3D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, rawText: { color: '#859080', backgroundColor: '#080C09', padding: 13, borderRadius: 10, fontSize: 10, lineHeight: 16, fontFamily: 'monospace' },
  capturedSummary: { padding: 14, borderWidth: 1, borderColor: '#33422D', borderRadius: 13, backgroundColor: '#10180E' }, capturedEyebrow: { color: '#C8FF3D', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, detectedType: { color: '#EEF2EA', fontSize: 16, fontWeight: '800', marginTop: 8 }, tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 }, token: { overflow: 'hidden', color: '#C8FF3D', backgroundColor: '#080C09', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontFamily: 'monospace' },
  analysisSafety: { padding: 15, borderRadius: 13, backgroundColor: '#0C1511', borderWidth: 1, borderColor: '#244333' }, analysisSafetyTitle: { color: '#79D9A2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, analysisSafetyText: { color: '#82A08C', fontSize: 11, lineHeight: 17, marginTop: 6 },
});
