/**
 * Block Confirmation Monitor
 * Tracks submitted transactions and updates their status based on blockchain confirmations
 */
import { TransactionDAO, RequestDAO, AuditDAO } from './database.js';

export interface ConfirmationConfig {
  networkId: 'mainnet' | 'preprod' | 'preview';
  blockfrostApiKey: string;
  checkInterval: number; // milliseconds
  requiredConfirmations: number; // number of blocks for confirmation
  maxConfirmationTime: number; // milliseconds before marking as failed
  maxRetries: number; // max API retry attempts
}

export interface TransactionStatus {
  txHash: string;
  requestId: string;
  block?: string;
  blockHeight?: number;
  blockTime?: Date;
  confirmations: number;
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  lastChecked: Date;
  checkAttempts: number;
  submittedAt: Date;
}

const DEFAULT_CONFIG: ConfirmationConfig = {
  networkId: 'mainnet',
  blockfrostApiKey: process.env.BLOCKFROST_API_KEY || '',
  checkInterval: 30000, // 30 seconds
  requiredConfirmations: 3, // 3 block confirmations
  maxConfirmationTime: 24 * 60 * 60 * 1000, // 24 hours
  maxRetries: 3
};

/**
 * Block Confirmation Monitor Service
 * Monitors submitted transactions for blockchain confirmations
 */
export class BlockConfirmationMonitor {
  private config: ConfirmationConfig;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private monitoredTransactions = new Map<string, TransactionStatus>();
  private webSocketHandler: any = null;

  constructor(config?: Partial<ConfirmationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (!this.config.blockfrostApiKey) {
      console.warn('Blockfrost API key not configured for block confirmation monitoring');
    }
  }

  /**
   * Start the confirmation monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Block confirmation monitor is already running');
      return;
    }

    console.log('Starting block confirmation monitor...');

    // Load pending transactions from database
    await this.loadPendingTransactions();

    // Start monitoring interval
    this.intervalId = setInterval(async () => {
      await this.checkAllTransactions();
    }, this.config.checkInterval);

    this.isRunning = true;
    console.log(`Block confirmation monitor started (${this.monitoredTransactions.size} transactions monitored)`);
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.monitoredTransactions.clear();
    console.log('Block confirmation monitor stopped');
  }

  /**
   * Set WebSocket handler for real-time notifications
   */
  setWebSocketHandler(handler: any): void {
    this.webSocketHandler = handler;
  }

  /**
   * Add a transaction to monitoring
   */
  async addTransaction(txHash: string, requestId: string, submittedAt: Date): Promise<void> {
    const transactionStatus: TransactionStatus = {
      txHash,
      requestId,
      confirmations: 0,
      status: 'SUBMITTED',
      lastChecked: new Date(),
      checkAttempts: 0,
      submittedAt
    };

    this.monitoredTransactions.set(txHash, transactionStatus);
    console.log(`Added transaction ${txHash} to confirmation monitoring`);

    // Immediate first check
    await this.checkTransaction(transactionStatus);
  }

  /**
   * Remove a transaction from monitoring
   */
  removeTransaction(txHash: string): void {
    this.monitoredTransactions.delete(txHash);
    console.log(`Removed transaction ${txHash} from monitoring`);
  }

  /**
   * Load pending transactions from database
   */
  private async loadPendingTransactions(): Promise<void> {
    try {
      const pendingTransactions = await TransactionDAO.getPending();
      
      for (const tx of pendingTransactions) {
        if (tx.tx_hash && tx.request_id && tx.submitted_at) {
          const transactionStatus: TransactionStatus = {
            txHash: tx.tx_hash,
            requestId: tx.request_id,
            confirmations: 0,
            status: 'SUBMITTED',
            lastChecked: new Date(),
            checkAttempts: 0,
            submittedAt: new Date(tx.submitted_at)
          };

          this.monitoredTransactions.set(tx.tx_hash, transactionStatus);
        }
      }

      console.log(`Loaded ${pendingTransactions.length} pending transactions for monitoring`);
    } catch (error) {
      console.error('Failed to load pending transactions:', error);
    }
  }

  /**
   * Check all monitored transactions
   */
  private async checkAllTransactions(): Promise<void> {
    if (!this.isRunning || this.monitoredTransactions.size === 0) {
      return;
    }

    const currentTime = Date.now();
    const transactionsToCheck = Array.from(this.monitoredTransactions.values());

    // Check for timeouts first
    for (const tx of transactionsToCheck) {
      const timeSinceSubmission = currentTime - tx.submittedAt.getTime();
      if (timeSinceSubmission > this.config.maxConfirmationTime) {
        await this.markTransactionFailed(tx, 'Confirmation timeout exceeded');
        continue;
      }
    }

    // Check transactions in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < transactionsToCheck.length; i += batchSize) {
      const batch = transactionsToCheck.slice(i, i + batchSize);
      
      const promises = batch.map(tx => this.checkTransaction(tx));
      await Promise.allSettled(promises);

      // Brief pause between batches
      if (i + batchSize < transactionsToCheck.length) {
        await this.sleep(1000);
      }
    }
  }

  /**
   * Check a specific transaction for confirmations
   */
  private async checkTransaction(tx: TransactionStatus): Promise<void> {
    if (!this.config.blockfrostApiKey) {
      return;
    }

    try {
      tx.checkAttempts++;
      tx.lastChecked = new Date();

      // Get transaction info from Blockfrost
      const txInfo = await this.getTransactionInfo(tx.txHash);
      
      if (!txInfo) {
        // Transaction not found - might still be in mempool or failed
        const timeSinceSubmission = Date.now() - tx.submittedAt.getTime();
        
        if (timeSinceSubmission > 10 * 60 * 1000) { // 10 minutes
          // If it's been more than 10 minutes and still not found, likely failed
          await this.markTransactionFailed(tx, 'Transaction not found on blockchain after 10 minutes');
        }
        return;
      }

      // Calculate confirmations
      const currentTip = await this.getCurrentBlockHeight();
      const confirmations = currentTip - txInfo.blockHeight + 1;

      // Update transaction status
      tx.block = txInfo.blockHash;
      tx.blockHeight = txInfo.blockHeight;
      tx.blockTime = txInfo.blockTime;
      tx.confirmations = confirmations;

      // Check if transaction is confirmed
      if (confirmations >= this.config.requiredConfirmations) {
        await this.markTransactionConfirmed(tx);
      } else {
        // Still waiting for more confirmations
        console.log(`Transaction ${tx.txHash} has ${confirmations}/${this.config.requiredConfirmations} confirmations`);
        
        // Notify about confirmation progress
        this.notifyConfirmationProgress(tx);
      }

    } catch (error) {
      console.error(`Failed to check transaction ${tx.txHash}:`, error);
      
      // If too many failed attempts, mark as failed
      if (tx.checkAttempts >= this.config.maxRetries * 5) {
        await this.markTransactionFailed(tx, `Too many check failures: ${error.message}`);
      }
    }
  }

  /**
   * Get transaction information from Blockfrost
   */
  private async getTransactionInfo(txHash: string): Promise<{
    blockHash: string;
    blockHeight: number;
    blockTime: Date;
    confirmations: number;
  } | null> {
    const networkPrefix = this.config.networkId === 'mainnet' ? '' : `${this.config.networkId}-`;
    const url = `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/txs/${txHash}`;

    const response = await fetch(url, {
      headers: {
        'project_id': this.config.blockfrostApiKey
      }
    });

    if (response.status === 404) {
      return null; // Transaction not found
    }

    if (!response.ok) {
      throw new Error(`Blockfrost API error: ${response.status} ${response.statusText}`);
    }

    const txData = await response.json();
    
    return {
      blockHash: txData.block,
      blockHeight: txData.block_height,
      blockTime: new Date(txData.block_time * 1000),
      confirmations: 0 // Will be calculated separately
    };
  }

  /**
   * Get current blockchain tip height
   */
  private async getCurrentBlockHeight(): Promise<number> {
    const networkPrefix = this.config.networkId === 'mainnet' ? '' : `${this.config.networkId}-`;
    const url = `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/blocks/latest`;

    const response = await fetch(url, {
      headers: {
        'project_id': this.config.blockfrostApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get current block height: ${response.status}`);
    }

    const blockData = await response.json();
    return blockData.height;
  }

  /**
   * Mark transaction as confirmed
   */
  private async markTransactionConfirmed(tx: TransactionStatus): Promise<void> {
    try {
      // Update database
      await TransactionDAO.updateStatusByHash(tx.txHash, 'CONFIRMED');
      await RequestDAO.updateStatus(tx.requestId, 'CONFIRMED');

      // Update local status
      tx.status = 'CONFIRMED';

      // Log audit event
      await AuditDAO.log({
        event_type: 'transaction_confirmed',
        user_id: 'system',
        resource_type: 'transaction',
        resource_id: tx.requestId,
        details: {
          tx_hash: tx.txHash,
          request_id: tx.requestId,
          block_height: tx.blockHeight,
          block_hash: tx.block,
          confirmations: tx.confirmations,
          confirmed_at: new Date().toISOString()
        }
      });

      console.log(`✅ Transaction ${tx.txHash} confirmed with ${tx.confirmations} confirmations`);

      // Remove from monitoring
      this.monitoredTransactions.delete(tx.txHash);

      // Notify via WebSocket
      this.notifyTransactionConfirmed(tx);

    } catch (error) {
      console.error(`Failed to mark transaction as confirmed:`, error);
    }
  }

  /**
   * Mark transaction as failed
   */
  private async markTransactionFailed(tx: TransactionStatus, reason: string): Promise<void> {
    try {
      // Update database
      await TransactionDAO.updateStatusByHash(tx.txHash, 'FAILED', reason);
      await RequestDAO.updateStatus(tx.requestId, 'FAILED');

      // Update local status
      tx.status = 'FAILED';

      // Log audit event
      await AuditDAO.log({
        event_type: 'transaction_failed',
        user_id: 'system',
        resource_type: 'transaction',
        resource_id: tx.requestId,
        details: {
          tx_hash: tx.txHash,
          request_id: tx.requestId,
          failure_reason: reason,
          check_attempts: tx.checkAttempts,
          failed_at: new Date().toISOString()
        }
      });

      console.log(`❌ Transaction ${tx.txHash} marked as failed: ${reason}`);

      // Remove from monitoring
      this.monitoredTransactions.delete(tx.txHash);

      // Notify via WebSocket
      this.notifyTransactionFailed(tx, reason);

    } catch (error) {
      console.error(`Failed to mark transaction as failed:`, error);
    }
  }

  /**
   * Notify confirmation progress via WebSocket
   */
  private notifyConfirmationProgress(tx: TransactionStatus): void {
    if (!this.webSocketHandler) return;

    try {
      this.webSocketHandler.broadcastRequestUpdate(tx.requestId, {
        status: 'SUBMITTED',
        tx_hash: tx.txHash,
        confirmations: tx.confirmations,
        required_confirmations: this.config.requiredConfirmations,
        block_height: tx.blockHeight,
        block_hash: tx.block
      });
    } catch (error) {
      console.warn('Failed to notify confirmation progress:', error);
    }
  }

  /**
   * Notify transaction confirmed via WebSocket
   */
  private notifyTransactionConfirmed(tx: TransactionStatus): void {
    if (!this.webSocketHandler) return;

    try {
      this.webSocketHandler.broadcastRequestUpdate(tx.requestId, {
        status: 'CONFIRMED',
        tx_hash: tx.txHash,
        confirmations: tx.confirmations,
        block_height: tx.blockHeight,
        block_hash: tx.block,
        confirmed_at: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to notify transaction confirmed:', error);
    }
  }

  /**
   * Notify transaction failed via WebSocket
   */
  private notifyTransactionFailed(tx: TransactionStatus, reason: string): void {
    if (!this.webSocketHandler) return;

    try {
      this.webSocketHandler.broadcastRequestUpdate(tx.requestId, {
        status: 'FAILED',
        tx_hash: tx.txHash,
        failure_reason: reason,
        failed_at: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to notify transaction failed:', error);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    isRunning: boolean;
    monitoredTransactions: number;
    checkInterval: number;
    requiredConfirmations: number;
    transactions: TransactionStatus[];
  } {
    return {
      isRunning: this.isRunning,
      monitoredTransactions: this.monitoredTransactions.size,
      checkInterval: this.config.checkInterval,
      requiredConfirmations: this.config.requiredConfirmations,
      transactions: Array.from(this.monitoredTransactions.values())
    };
  }

  /**
   * Get status of a specific transaction
   */
  getTransactionStatus(txHash: string): TransactionStatus | null {
    return this.monitoredTransactions.get(txHash) || null;
  }

  /**
   * Manually trigger check for a specific transaction
   */
  async forceCheckTransaction(txHash: string): Promise<void> {
    const tx = this.monitoredTransactions.get(txHash);
    if (tx) {
      await this.checkTransaction(tx);
    } else {
      throw new Error(`Transaction ${txHash} is not being monitored`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConfirmationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Block confirmation monitor configuration updated');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all monitored transactions
   */
  getAllMonitoredTransactions(): TransactionStatus[] {
    return Array.from(this.monitoredTransactions.values());
  }

  /**
   * Clear all monitoring data (for maintenance)
   */
  clearAll(): void {
    this.monitoredTransactions.clear();
    console.log('All monitoring data cleared');
  }
}

// Singleton instance
export const blockConfirmationMonitor = new BlockConfirmationMonitor();