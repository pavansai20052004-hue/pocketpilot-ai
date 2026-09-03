import type { AnalysisExecutionResponse, AnalysisRecord, DebugSession, ErrorInputType } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export function analyzeText(
  client: ApiClient,
  session: DebugSession,
  rawText: string,
  languageHint?: string,
  inputType: ErrorInputType = 'TEXT',
): Promise<AnalysisExecutionResponse> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ input_type: inputType, raw_text: rawText, language_hint: languageHint?.trim() || null, file_hint: null, framework_hint: null, expected_revision: session.revision }),
  });
}

export const getAnalysis = (client: ApiClient, id: string): Promise<AnalysisRecord> => client.request(`/api/v1/sessions/${encodeURIComponent(id)}/analysis`);
