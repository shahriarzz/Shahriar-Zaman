export type MutationOutcome<T> =
  | { readonly status: 'local_committed'; readonly data: T; readonly cloudStatus: 'pending' | 'offline' }
  | { readonly status: 'cloud_synced'; readonly data: T }
  | { readonly status: 'local_failed'; readonly error: string };

export interface MutationStepLog {
  readonly validated: boolean;
  readonly committedLocal: boolean;
  readonly persistedDisk: boolean;
  readonly cloudDispatched: boolean;
  readonly error?: string;
}

/**
 * Executes a standardized domain mutation through the local-first lifecycle:
 * 1. Validate & sanitize input
 * 2. Commit to local memory state
 * 3. Persist to local disk snapshot
 * 4. Attempt/queue cloud synchronization if authenticated
 */
export async function executeDomainMutation<TInput, TOutput>(params: {
  input: TInput;
  sanitize: (input: TInput) => { success: boolean; data?: TOutput; error?: string };
  commitLocal: (data: TOutput) => void;
  persistLocal: () => Promise<void>;
  syncCloud?: () => Promise<void>;
  isOnline?: boolean;
  isAuthenticated?: boolean;
}): Promise<MutationOutcome<TOutput>> {
  const { input, sanitize, commitLocal, persistLocal, syncCloud, isOnline = true, isAuthenticated = false } = params;

  // 1. Validate & Sanitize
  const validation = sanitize(input);
  if (!validation.success || validation.data === undefined) {
    return {
      status: 'local_failed',
      error: validation.error || 'Input validation failed'
    };
  }
  const cleanData = validation.data;

  // 2. Commit Local
  try {
    commitLocal(cleanData);
  } catch (err: any) {
    return {
      status: 'local_failed',
      error: `Local commit failed: ${err?.message || String(err)}`
    };
  }

  // 3. Persist Local Snapshot
  try {
    await persistLocal();
  } catch (err: any) {
    return {
      status: 'local_failed',
      error: `Local persistence failed: ${err?.message || String(err)}`
    };
  }

  // 4. Cloud Synchronization
  if (!isAuthenticated || !syncCloud) {
    return {
      status: 'local_committed',
      data: cleanData,
      cloudStatus: 'offline'
    };
  }

  if (!isOnline) {
    return {
      status: 'local_committed',
      data: cleanData,
      cloudStatus: 'pending'
    };
  }

  try {
    await syncCloud();
    return {
      status: 'cloud_synced',
      data: cleanData
    };
  } catch (err) {
    // Cloud synchronization failure does NOT fail the local mutation
    return {
      status: 'local_committed',
      data: cleanData,
      cloudStatus: 'pending'
    };
  }
}
