import type { AnalysisRecord, DebugSession, PatchWorkflowView } from '@pocketpilot/shared-types';

export interface VoiceResponseData {
  readonly analysis: AnalysisRecord | null;
  readonly patch: PatchWorkflowView | null;
  readonly session: DebugSession | null;
}

export function formatRootCauseResponse(data: VoiceResponseData): string {
  const result = data.analysis?.result;
  if (result === undefined) return 'There is no root cause to explain yet.';
  const location = result.likely_file === null ? '' : ` in ${result.likely_file}${result.likely_line === null ? '' : ` line ${result.likely_line}`}`;
  return limitSpeech(`${result.summary}${location}. ${result.repair_strategy}`);
}

export function formatFixResponse(data: VoiceResponseData): string {
  const patch = data.patch;
  if (patch === null) return 'There is no completed fix to explain yet.';
  const files = patch.validation.files_changed;
  const verification = patch.test_result?.passed === true ? ` The fix was verified by the approved tests.` : '';
  return limitSpeech(`${patch.proposal.summary} It changes ${files} file${files === 1 ? '' : 's'}.${verification}`);
}

export function formatLocationResponse(data: VoiceResponseData): string {
  const result = data.analysis?.result;
  if (result?.likely_file === null || result?.likely_file === undefined) return 'PocketPilot could not establish a specific file location.';
  return `The reported problem is in ${result.likely_file}${result.likely_line === null ? '' : ` at line ${result.likely_line}`}.`;
}

export function formatTestResponse(data: VoiceResponseData): string {
  const test = data.patch?.test_result;
  if (test === null || test === undefined) return 'There is no completed test result yet.';
  return test.passed ? `The approved validation passed in ${test.duration_ms} milliseconds.` : `The approved validation failed. ${test.detail}`;
}

export function formatSessionResponse(data: VoiceResponseData): string {
  return data.session === null ? 'There is no active debug session.' : `The current session is ${data.session.state.toLocaleLowerCase('en').replaceAll('_', ' ')}.`;
}

export function formatApprovalPrompt(data: VoiceResponseData): string {
  const files = data.patch?.validation.files_changed ?? 0;
  return `This will modify ${files} file${files === 1 ? '' : 's'} and run the approved project tests. Confirm?`;
}

export function formatRollbackPrompt(): string {
  return 'This will restore the files to their state before the fix. Confirm?';
}

function limitSpeech(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= 360 ? compact : `${compact.slice(0, 357).trimEnd()}...`;
}
