/**
 * Transaction Submission Service
 * Handles both server-side and wallet-side transaction submission with retry logic
 */
import { RequestDAO, PreSignedDAO, TransactionDAO, AuditDAO } from './database.js';

export interface SubmissionConfig {
  mode: 'server' | 'wallet';
  maxRetries: number;
  retryDelay: number; // milliseconds
  networkId: 'mainnet' | 'preprod' | 'preview';
  blockfrostApiKey?: string;
}

export interface SubmissionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  attempts: number;
  mode: 'server' | 'wallet';
  submittedAt?: Date;
  confirmedAt?: Date;
}

export interface RetryContext {
  attempt: number;
  lastError: string;
  nextRetryAt: Date;
  totalAttempts: number;
}

const DEFAULT_CONFIG: SubmissionConfig = {
  mode: 'server',
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  networkId: 'mainnet'
};

/**
 * Transaction Submission Service
 * Manages the submission of pre-signed transactions to the Cardano network
 */
export class TransactionSubmitter {
  private config: SubmissionConfig;
  private activeSubmissions = new Map<string, Promise<SubmissionResult>>();
  private retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(config?: Partial<SubmissionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.mode === 'server' && !this.config.blockfrostApiKey) {
      this.config.blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
    }
  }

  /**
   * Submit a transaction for a given request
   */
  async submitTransaction(requestId: string, options?: {
    mode?: 'server' | 'wallet';
    priority?: 'normal' | 'high';
    walletApi?: any; // CIP-30 API for wallet mode
  }): Promise<SubmissionResult> {
    // Check if submission is already in progress
    if (this.activeSubmissions.has(requestId)) {
      return await this.activeSubmissions.get(requestId)!;
    }

    // Create submission promise
    const submissionPromise = this._executeSubmission(requestId, options);
    this.activeSubmissions.set(requestId, submissionPromise);

    try {
      const result = await submissionPromise;
      return result;
    } finally {
      this.activeSubmissions.delete(requestId);
    }
  }

  /**
   * Cancel a pending submission
   */
  cancelSubmission(requestId: string): boolean {
    const timer = this.retryTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(requestId);
    }

    if (this.activeSubmissions.has(requestId)) {
      this.activeSubmissions.delete(requestId);
      return true;
    }

    return false;
  }

  /**
   * Get submission status
   */
  getSubmissionStatus(requestId: string): {
    isActive: boolean;
    hasRetryScheduled: boolean;
  } {
    return {
      isActive: this.activeSubmissions.has(requestId),
      hasRetryScheduled: this.retryTimers.has(requestId)
    };
  }

  /**
   * Execute transaction submission with retry logic
   */
  private async _executeSubmission(
    requestId: string, 
    options?: {
      mode?: 'server' | 'wallet';
      priority?: 'normal' | 'high';
      walletApi?: any;
    }
  ): Promise<SubmissionResult> {
    const mode = options?.mode || this.config.mode;
    let attempts = 0;
    let lastError = '';

    // Get pre-signed data
    const preSignedData = await PreSignedDAO.getCompleteData(requestId);
    if (!preSignedData) {
      return {
        success: false,
        error: 'Pre-signed data not found',
        attempts: 0,
        mode
      };
    }

    // Update request status to SUBMITTING
    await RequestDAO.updateStatus(requestId, 'SUBMITTING');

    // Log submission start
    await AuditDAO.log({
      event_type: 'transaction_submission_started',
      user_id: 'system',
      resource_type: 'transaction',
      resource_id: requestId,
      details: {
        request_id: requestId,
        tx_hash: preSignedData.tx_hash,
        mode,
        priority: options?.priority || 'normal'
      }
    });

    // Retry loop
    while (attempts < this.config.maxRetries) {
      attempts++;

      try {
        let txHash: string;

        if (mode === 'server') {
          txHash = await this._submitViaServer(preSignedData);
        } else {
          if (!options?.walletApi) {
            throw new Error('Wallet API required for wallet submission mode');
          }
          txHash = await this._submitViaWallet(preSignedData, options.walletApi);
        }

        // Success - record transaction
        const submittedAt = new Date();
        await TransactionDAO.create({
          request_id: requestId,
          tx_hash: txHash,
          tx_body_hex: preSignedData.tx_body_hex,
          witness_set_hex: preSignedData.witness_set_hex,
          fee_lovelace: preSignedData.fee_lovelace,
          submission_mode: mode,
          submitted_at: submittedAt,
          status: 'SUBMITTED'
        });

        // Update request status
        await RequestDAO.updateStatus(requestId, 'SUBMITTED');

        // Start block confirmation monitoring
        try {
          const { blockConfirmationMonitor } = await import('./blockConfirmationMonitor.js');
          await blockConfirmationMonitor.addTransaction(txHash, requestId, submittedAt);
        } catch (monitorError) {
          console.warn('Failed to add transaction to block confirmation monitoring:', monitorError);
          // Don't fail the submission if monitoring fails
        }

        // Log success
        await AuditDAO.log({
          event_type: 'transaction_submitted',
          user_id: 'system',
          resource_type: 'transaction',
          resource_id: requestId,
          details: {
            request_id: requestId,
            tx_hash: txHash,
            mode,
            attempts,
            submitted_at: submittedAt.toISOString()
          }
        });

        return {
          success: true,
          txHash,
          attempts,
          mode,
          submittedAt
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        console.error(`Submission attempt ${attempts} failed for request ${requestId}:`, error);

        // Log attempt failure
        await AuditDAO.log({
          event_type: 'transaction_submission_attempt_failed',
          user_id: 'system',
          resource_type: 'transaction',
          resource_id: requestId,
          details: {
            request_id: requestId,
            attempt: attempts,
            error: lastError,
            mode
          }
        });

        // If not the last attempt, wait before retrying
        if (attempts < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempts - 1); // Exponential backoff
          await this._sleep(delay);
        }
      }
    }

    // All attempts failed
    await RequestDAO.updateStatus(requestId, 'FAILED');

    // Log final failure
    await AuditDAO.log({
      event_type: 'transaction_submission_failed',
      user_id: 'system',
      resource_type: 'transaction',
      resource_id: requestId,
      details: {
        request_id: requestId,
        total_attempts: attempts,
        final_error: lastError,
        mode
      }
    });

    return {
      success: false,
      error: `Submission failed after ${attempts} attempts: ${lastError}`,
      attempts,
      mode
    };
  }

  /**
   * Submit transaction via server using Blockfrost API
   */
  private async _submitViaServer(preSignedData: {
    signed_tx_hex: string;
    tx_hash: string;
  }): Promise<string> {
    if (!this.config.blockfrostApiKey) {
      throw new Error('Blockfrost API key not configured for server submission');
    }

    const networkPrefix = this.config.networkId === 'mainnet' ? '' : `${this.config.networkId}-`;
    const url = `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/tx/submit`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'project_id': this.config.blockfrostApiKey
      },
      body: Buffer.from(preSignedData.signed_tx_hex, 'hex')
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        if (errorText.trim()) {
          errorMessage = errorText;
        }
      }

      throw new Error(`Blockfrost submission failed: ${errorMessage}`);
    }

    // Blockfrost returns the transaction hash as a string
    const txHash = await response.text();
    
    // Validate returned hash matches expected hash
    if (txHash.replace(/['"]/g, '') !== preSignedData.tx_hash) {
      console.warn(`Hash mismatch: expected ${preSignedData.tx_hash}, got ${txHash}`);
    }

    return preSignedData.tx_hash;
  }

  /**
   * Submit transaction via wallet using CIP-30 API
   */
  private async _submitViaWallet(
    preSignedData: {
      signed_tx_hex: string;
      tx_hash: string;
    },
    walletApi: any
  ): Promise<string> {
    try {
      // Submit transaction through wallet
      const txHash = await walletApi.submitTx(preSignedData.signed_tx_hex);
      
      // Validate returned hash
      if (txHash !== preSignedData.tx_hash) {
        console.warn(`Hash mismatch: expected ${preSignedData.tx_hash}, got ${txHash}`);
      }

      return preSignedData.tx_hash;

    } catch (error) {
      throw new Error(`Wallet submission failed: ${error}`);
    }
  }

  /**
   * Schedule a retry for a failed submission
   */
  scheduleRetry(requestId: string, delayMs: number): void {
    if (this.retryTimers.has(requestId)) {
      clearTimeout(this.retryTimers.get(requestId)!);
    }

    const timer = setTimeout(async () => {
      this.retryTimers.delete(requestId);
      try {
        await this.submitTransaction(requestId);
      } catch (error) {
        console.error(`Scheduled retry failed for request ${requestId}:`, error);
      }
    }, delayMs);

    this.retryTimers.set(requestId, timer);
  }

  /**
   * Get retry context for a request
   */
  async getRetryContext(requestId: string): Promise<RetryContext | null> {
    try {
      // This would query the database for retry information
      // For now, return a placeholder
      return null;
    } catch (error) {
      console.error('Failed to get retry context:', error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    // Cancel all active submissions
    this.activeSubmissions.clear();

    // Clear all retry timers
    for (const [requestId, timer] of this.retryTimers.entries()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    console.log('TransactionSubmitter shutdown complete');
  }

  /**
   * Sleep utility
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get submission statistics
   */
  getStats(): {
    activeSubmissions: number;
    pendingRetries: number;
    config: SubmissionConfig;
  } {
    return {
      activeSubmissions: this.activeSubmissions.size,
      pendingRetries: this.retryTimers.size,
      config: { ...this.config }
    };
  }
}

// Singleton instance
export const transactionSubmitter = new TransactionSubmitter();

/**
 * Batch submission utility for multiple requests
 */
export class BatchSubmissionManager {
  private submitter: TransactionSubmitter;
  private maxConcurrency: number;

  constructor(submitter: TransactionSubmitter, maxConcurrency = 3) {
    this.submitter = submitter;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Submit multiple transactions in batches
   */
  async submitBatch(
    requestIds: string[], 
    options?: {
      mode?: 'server' | 'wallet';
      walletApi?: any;
    }
  ): Promise<Map<string, SubmissionResult>> {
    const results = new Map<string, SubmissionResult>();
    const batches = this._createBatches(requestIds, this.maxConcurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (requestId) => {
        try {
          const result = await this.submitter.submitTransaction(requestId, options);
          return { requestId, result };
        } catch (error) {
          return {
            requestId,
            result: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              attempts: 0,
              mode: options?.mode || 'server'
            } as SubmissionResult
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { requestId, result } of batchResults) {
        results.set(requestId, result);
      }

      // Brief pause between batches to avoid overwhelming the network
      if (batches.indexOf(batch) < batches.length - 1) {
        await this._sleep(1000);
      }
    }

    return results;
  }

  private _createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Submission queue for handling high-volume scenarios
 */
export class SubmissionQueue {
  private queue: Array<{
    requestId: string;
    options?: any;
    priority: 'normal' | 'high';
    createdAt: Date;
  }> = [];
  
  private processing = false;
  private submitter: TransactionSubmitter;

  constructor(submitter: TransactionSubmitter) {
    this.submitter = submitter;
  }

  /**
   * Add request to submission queue
   */
  enqueue(
    requestId: string, 
    options?: any, 
    priority: 'normal' | 'high' = 'normal'
  ): void {
    const item = {
      requestId,
      options,
      priority,
      createdAt: new Date()
    };

    if (priority === 'high') {
      // Insert high priority items at the beginning
      const firstNormalIndex = this.queue.findIndex(item => item.priority === 'normal');
      if (firstNormalIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(firstNormalIndex, 0, item);
      }
    } else {
      this.queue.push(item);
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process submission queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        
        try {
          await this.submitter.submitTransaction(item.requestId, item.options);
        } catch (error) {
          console.error(`Queue submission failed for ${item.requestId}:`, error);
        }

        // Brief pause between submissions
        await this._sleep(500);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    processing: boolean;
    highPriorityCount: number;
  } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      highPriorityCount: this.queue.filter(item => item.priority === 'high').length
    };
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}