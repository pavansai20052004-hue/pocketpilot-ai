import type { DebugSession } from '@pocketpilot/shared-types';

export type WorkPhase = 'ANALYZE' | 'GENERATE' | 'APPLY' | 'TEST';

export interface WorkPhaseContent {
  readonly eyebrow: string;
  readonly footer: string;
  readonly icon: string;
  readonly messages: ReadonlyArray<string>;
  readonly title: string;
}

const CONTENT: Record<WorkPhase, WorkPhaseContent> = {
  ANALYZE: {
    eyebrow: 'LOCAL AI · ANALYSIS', footer: 'Keep PocketPilot open', icon: 'AI', title: 'Tracing the root cause',
    messages: ['Reading the captured error…', 'Selecting bounded repository context…', 'Checking the reported frame against source…', 'Building an evidence-backed explanation…'],
  },
  GENERATE: {
    eyebrow: 'LOCAL AI · PATCH', footer: 'No files are changing yet', icon: '＋', title: 'Designing a safe fix',
    messages: ['Drafting the smallest useful change…', 'Checking file boundaries and current hashes…', 'Reviewing the diff for unsafe operations…', 'Preparing the patch for your approval…'],
  },
  APPLY: {
    eyebrow: 'APPROVED WORKFLOW · LAPTOP', footer: 'Recovery remains available', icon: '↗', title: 'Applying your approved fix',
    messages: ['Confirming the reviewed file versions…', 'Applying only the approved diff…', 'Preparing the project verification step…'],
  },
  TEST: {
    eyebrow: 'VERIFICATION · LAPTOP', footer: 'Results will appear here', icon: '✓', title: 'Running approved tests',
    messages: ['Executing the registered validation command…', 'Collecting the real test output…', 'Checking whether the fix is verified…'],
  },
};

export function resolveWorkPhase(busy: string | null, session: DebugSession | null): WorkPhase | null {
  if (session?.state === 'TESTING') return 'TEST';
  if (session?.state === 'PATCH_APPLYING') return 'APPLY';
  if (busy === 'approve') return 'APPLY';
  if (busy === 'patch') return 'GENERATE';
  if (busy === 'analyze' || busy === 'retry' || session?.state === 'ANALYZING') return 'ANALYZE';
  return null;
}

export function workPhaseContent(phase: WorkPhase): WorkPhaseContent {
  return CONTENT[phase];
}
