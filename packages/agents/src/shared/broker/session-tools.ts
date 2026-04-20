export type PromptMode = 'default' | 'gemini_native' | 'custom_tools';

export interface SessionToolProfile {
  readonly promptMode: PromptMode;
  readonly requiresPlan: boolean;
  readonly requiresDelegation: boolean;
  readonly requiresBrowserInteraction: boolean;
  readonly requiresSourceTools: boolean;
  readonly continuation: boolean;
  readonly includeCompanyContextTools: boolean;
  readonly includeSourceAdminTools: boolean;
  readonly includeSchedulerTools: boolean;
  readonly includeVigiaTools: boolean;
  readonly includeMarketplaceTools: boolean;
  readonly includeHistoryTools: boolean;
  readonly includeValidationTools: boolean;
  readonly includeSecondaryLlmTools: boolean;
}

export type SessionToolCategory =
  | 'core'
  | 'plan'
  | 'delegation'
  | 'browser'
  | 'source'
  | 'source_admin'
  | 'continuation'
  | 'company_context'
  | 'scheduler'
  | 'vigia'
  | 'marketplace'
  | 'history'
  | 'validation'
  | 'secondary_llm';

export interface SessionToolDescriptor {
  readonly name: string;
  readonly originalName: string;
  readonly description: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly kind: 'session';
  readonly serverName: 'session';
  readonly category: SessionToolCategory;
  readonly priority: number;
}

const CATEGORY_FLAG: Readonly<Record<SessionToolCategory, keyof SessionToolProfile | null>> = {
  core: null,
  plan: 'requiresPlan',
  delegation: 'requiresDelegation',
  browser: 'requiresBrowserInteraction',
  source: 'requiresSourceTools',
  source_admin: 'includeSourceAdminTools',
  continuation: 'continuation',
  company_context: 'includeCompanyContextTools',
  scheduler: 'includeSchedulerTools',
  vigia: 'includeVigiaTools',
  marketplace: 'includeMarketplaceTools',
  history: 'includeHistoryTools',
  validation: 'includeValidationTools',
  secondary_llm: 'includeSecondaryLlmTools',
};

export function shouldExposeSessionTool(
  tool: SessionToolDescriptor,
  profile: SessionToolProfile,
): boolean {
  if (profile.promptMode === 'gemini_native') {
    return false;
  }
  const flag = CATEGORY_FLAG[tool.category];
  if (flag === null) {
    return true;
  }
  return profile[flag] === true;
}

export function filterSessionTools(
  allTools: readonly SessionToolDescriptor[],
  profile: SessionToolProfile,
): SessionToolDescriptor[] {
  const exposed = allTools.filter((t) => shouldExposeSessionTool(t, profile));
  return [...exposed].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.name.localeCompare(b.name);
  });
}
