import type { VoiceExecutionResult, VoiceIntent } from './contracts';

export interface VoiceApplicationActions {
  readonly analyzeError: () => Promise<VoiceExecutionResult>;
  readonly approvePatch: () => Promise<VoiceExecutionResult>;
  readonly explainFix: () => VoiceExecutionResult;
  readonly explainRootCause: () => VoiceExecutionResult;
  readonly generatePatch: () => Promise<VoiceExecutionResult>;
  readonly rejectPatch: () => Promise<VoiceExecutionResult>;
  readonly rollback: () => Promise<VoiceExecutionResult>;
  readonly scanError: () => VoiceExecutionResult;
  readonly showError: () => VoiceExecutionResult;
  readonly showLocation: () => VoiceExecutionResult;
  readonly showPatch: () => VoiceExecutionResult;
  readonly showSessionStatus: () => VoiceExecutionResult;
  readonly showTestResult: () => VoiceExecutionResult;
  readonly tryAnotherFix: () => Promise<VoiceExecutionResult>;
}

export class VoiceActionExecutor {
  constructor(private readonly actions: VoiceApplicationActions) {}

  execute(intent: VoiceIntent): Promise<VoiceExecutionResult> {
    switch (intent) {
      case 'SCAN_ERROR': return Promise.resolve(this.actions.scanError());
      case 'ANALYZE_ERROR': return this.actions.analyzeError();
      case 'EXPLAIN_ROOT_CAUSE': return Promise.resolve(this.actions.explainRootCause());
      case 'GENERATE_PATCH': return this.actions.generatePatch();
      case 'SHOW_PATCH': return Promise.resolve(this.actions.showPatch());
      case 'APPROVE_PATCH': return this.actions.approvePatch();
      case 'REJECT_PATCH': return this.actions.rejectPatch();
      case 'RUN_VALIDATION': return Promise.resolve(this.actions.showTestResult());
      case 'EXPLAIN_FIX': return Promise.resolve(this.actions.explainFix());
      case 'TRY_ANOTHER_FIX': return this.actions.tryAnotherFix();
      case 'ROLLBACK': return this.actions.rollback();
      case 'SHOW_ERROR': return Promise.resolve(this.actions.showError());
      case 'SHOW_LOCATION': return Promise.resolve(this.actions.showLocation());
      case 'SHOW_TEST_RESULT': return Promise.resolve(this.actions.showTestResult());
      case 'SHOW_SESSION_STATUS': return Promise.resolve(this.actions.showSessionStatus());
      case 'CANCEL': return Promise.resolve({ success: true, message: 'Voice request cancelled.', spoken_response: null });
      case 'CONFIRM': return Promise.resolve({ success: false, message: 'There is no action awaiting confirmation.', spoken_response: null });
      case 'UNKNOWN': return Promise.resolve({ success: false, message: 'Unsupported command. Nothing was executed.', spoken_response: null });
    }
  }
}
