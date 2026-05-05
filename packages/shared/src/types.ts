export type ProviderId = 'openai' | 'anthropic' | 'google';

export interface SessionRoles {
  visionProviderId: ProviderId;
  embedProviderId: ProviderId;
  rerankProviderId: ProviderId;
  judgeProviderId: ProviderId;
}

export interface ProviderKeyEntry {
  apiKey: string;
  lastSeenAt: Date;
}

export interface SessionState {
  keys: Partial<Record<ProviderId, ProviderKeyEntry>>;
  roles: Partial<SessionRoles>;
  createdAt: Date;
  lastSeenAt: Date;
}
