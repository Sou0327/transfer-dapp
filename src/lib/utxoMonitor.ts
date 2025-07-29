/**
 * UTxO Monitoring Service
 * Monitors UTxO survival and TTL status every 30 seconds
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
import { PreSignedDAO, RequestDAO, AuditDAO } from './database';
import { webSocketService } from './websocket';

interface UTxOInfo {
  txHash: string;
  outputIndex: number;
  address: string;
  amount: string;
  assets: any[];
}

interface MonitoredRequest {
  id: string;
  request_id: string;
  tx_hash: string;
  ttl_slot: number;
  selected_utxos: UTxOInfo[];
  wallet_used: string;
  signed_at: string;
  last_check: Date;
  check_count: number;
}

export class UTxOMonitorService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly BACKUP_INTERVAL = 120000; // 2 minutes for backup checks
  
  private monitoredRequests = new Map<string, MonitoredRequest>();
  private currentSlot = 0;
  private lastSlotUpdate = 0;
  
  /**
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('UTxO Monitor already running');
      return;
    }

    console.log('🔍 Starting UTxO Monitor Service');
    this.isRunning = true;

    // Load existing monitored requests
    await this.loadMonitoredRequests();

    // Start monitoring interval
    this.intervalId = setInterval(() => {
      this.runMonitoringCycle().catch(error => {
        console.error('Monitoring cycle error:', error);
      });
    }, this.MONITORING_INTERVAL);

    // Start current slot tracking
    this.startSlotTracking();

    console.log(`✅ UTxO Monitor started with ${this.monitoredRequests.size} requests`);
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping UTxO Monitor Service');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.monitoredRequests.clear();
    console.log('✅ UTxO Monitor stopped');
  }

  /**
   * Add a request to monitoring
   */
  async addRequest(requestId: string): Promise<void> {
    try {
      const preSignedData = await PreSignedDAO.getByRequestId(requestId);
      if (!preSignedData) {
        console.warn(`No pre-signed data found for request ${requestId}`);
        return;
      }

      // Parse selected UTxOs from metadata
      const metadata = typeof preSignedData.metadata === 'string' 
        ? JSON.parse(preSignedData.metadata) 
        : preSignedData.metadata;
      
      const selectedUtxos = metadata?.selected_utxos || [];

      const monitoredRequest: MonitoredRequest = {
        id: preSignedData.id,
        request_id: requestId,
        tx_hash: preSignedData.tx_hash,
        ttl_slot: preSignedData.ttl_slot,
        selected_utxos: selectedUtxos,
        wallet_used: preSignedData.wallet_used,
        signed_at: preSignedData.signed_at,
        last_check: new Date(),
        check_count: 0
      };

      this.monitoredRequests.set(requestId, monitoredRequest);
      
      console.log(`📍 Added request ${requestId} to monitoring (UTxOs: ${selectedUtxos.length})`);

      // Initial check
      await this.checkRequest(monitoredRequest);

    } catch (error) {
      console.error(`Failed to add request ${requestId} to monitoring:`, error);
    }
  }

  /**
   * Remove a request from monitoring
   */
  removeRequest(requestId: string): void {
    if (this.monitoredRequests.has(requestId)) {
      this.monitoredRequests.delete(requestId);
      console.log(`🗑️ Removed request ${requestId} from monitoring`);
    }
  }

  /**
   * Load existing signed requests that need monitoring
   */
  private async loadMonitoredRequests(): Promise<void> {
    try {
      const signedRequests = await PreSignedDAO.getByStatus('SIGNED', 100);
      
      for (const request of signedRequests) {
        const metadata = typeof request.metadata === 'string' 
          ? JSON.parse(request.metadata) 
          : request.metadata;

        const monitoredRequest: MonitoredRequest = {
          id: request.id,
          request_id: request.request_id,
          tx_hash: request.tx_hash,
          ttl_slot: request.ttl_slot,
          selected_utxos: metadata?.selected_utxos || [],
          wallet_used: request.wallet_used,
          signed_at: request.signed_at,
          last_check: new Date(0), // Force initial check
          check_count: 0
        };

        this.monitoredRequests.set(request.request_id, monitoredRequest);
      }

      console.log(`📋 Loaded ${signedRequests.length} signed requests for monitoring`);

    } catch (error) {
      console.error('Failed to load monitored requests:', error);
    }
  }

  /**
   * Run a complete monitoring cycle
   */
  private async runMonitoringCycle(): Promise<void> {
    if (!this.isRunning || this.monitoredRequests.size === 0) {
      return;
    }

    console.log(`🔄 Running monitoring cycle for ${this.monitoredRequests.size} requests`);

    // Update current slot
    await this.updateCurrentSlot();

    // Check each monitored request
    const checkPromises = Array.from(this.monitoredRequests.values()).map(request => 
      this.checkRequest(request).catch(error => {
        console.error(`Error checking request ${request.request_id}:`, error);
      })
    );

    await Promise.allSettled(checkPromises);

    // Clean up completed/failed requests
    this.cleanupCompletedRequests();
  }

  /**
   * Check individual request for UTxO survival and TTL
   */
  private async checkRequest(request: MonitoredRequest): Promise<void> {
    request.last_check = new Date();
    request.check_count++;

    try {
      // Check TTL first (cheaper operation)
      if (await this.checkTTLExpiration(request)) {
        return; // Request expired, no need to check UTxOs
      }

      // Check UTxO survival
      await this.checkUTxOSurvival(request);

      // Broadcast TTL update if still active
      this.broadcastTTLUpdate(request);

    } catch (error) {
      console.error(`Failed to check request ${request.request_id}:`, error);
      
      // Log monitoring failure
      await AuditDAO.log({
        event_type: 'utxo_monitor_error',
        user_id: 'system',
        resource_type: 'monitoring',
        resource_id: request.request_id,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          check_count: request.check_count,
          last_successful_check: request.last_check
        }
      });
    }
  }

  /**
   * Check if TTL has expired
   */
  private async checkTTLExpiration(request: MonitoredRequest): Promise<boolean> {
    if (this.currentSlot > request.ttl_slot) {
      console.log(`⏰ Request ${request.request_id} TTL expired (current: ${this.currentSlot}, ttl: ${request.ttl_slot})`);
      
      // Update status to EXPIRED
      await RequestDAO.updateStatus(request.request_id, 'EXPIRED');
      
      // Remove from monitoring
      this.removeRequest(request.request_id);
      
      // Broadcast expiration
      this.broadcastRequestUpdate(request.request_id, {
        status: 'EXPIRED',
        details: {
          expired_at_slot: this.currentSlot,
          ttl_slot: request.ttl_slot
        }
      });

      // Log expiration
      await AuditDAO.log({
        event_type: 'request_expired',
        user_id: 'system',
        resource_type: 'request',
        resource_id: request.request_id,
        details: {
          current_slot: this.currentSlot,
          ttl_slot: request.ttl_slot,
          expired_after_checks: request.check_count
        }
      });

      return true; // Expired
    }

    return false; // Still valid
  }

  /**
   * Check UTxO survival using Blockfrost API
   */
  private async checkUTxOSurvival(request: MonitoredRequest): Promise<void> {
    if (!request.selected_utxos || request.selected_utxos.length === 0) {
      return;
    }

    const consumedUtxos: UTxOInfo[] = [];

    for (const utxo of request.selected_utxos) {
      try {
        const isConsumed = await this.checkUTxOConsumed(utxo, request.tx_hash);
        
        if (isConsumed) {
          consumedUtxos.push(utxo);
        }

      } catch (error) {
        console.warn(`Failed to check UTxO ${utxo.txHash}#${utxo.outputIndex}:`, error);
        
        // Try backup method
        try {
          const isConsumed = await this.checkUTxOConsumedBackup(utxo);
          if (isConsumed) {
            consumedUtxos.push(utxo);
          }
        } catch (backupError) {
          console.error(`Backup UTxO check also failed:`, backupError);
        }
      }
    }

    // Handle consumed UTxOs
    if (consumedUtxos.length > 0) {
      await this.handleConsumedUTxOs(request, consumedUtxos);
    }
  }

  /**
   * Check if a specific UTxO is consumed using Blockfrost
   */
  private async checkUTxOConsumed(utxo: UTxOInfo, excludeTxHash: string): Promise<boolean> {
    try {
      const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
      const networkPrefix = process.env.CARDANO_NETWORK === 'mainnet' ? '' : 'preprod-';
      
      if (!blockfrostApiKey) {
        throw new Error('BLOCKFROST_API_KEY not configured');
      }

      // Check if UTxO still exists
      const response = await fetch(
        `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/txs/${utxo.txHash}/utxos`,
        {
          headers: {
            'project_id': blockfrostApiKey
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Transaction not found, UTxO might be consumed
          return true;
        }
        throw new Error(`Blockfrost API error: ${response.status}`);
      }

      const txData = await response.json();
      const outputs = txData.outputs || [];
      
      // Check if our UTxO output still exists
      const utxoExists = outputs.some((output: any, index: number) => 
        index === utxo.outputIndex && output.address === utxo.address
      );

      if (!utxoExists) {
        // UTxO doesn't exist in outputs, check if it's consumed by another transaction
        const consumingTxResponse = await fetch(
          `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/addresses/${utxo.address}/transactions?order=desc&count=10`,
          {
            headers: {
              'project_id': blockfrostApiKey
            }
          }
        );

        if (consumingTxResponse.ok) {
          const transactions = await consumingTxResponse.json();
          
          // Look for a transaction that consumes our UTxO (excluding our own transaction)
          for (const tx of transactions) {
            if (tx.tx_hash === excludeTxHash) continue;
            
            // Check if this transaction spends our UTxO
            const inputResponse = await fetch(
              `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/txs/${tx.tx_hash}/utxos`,
              {
                headers: {
                  'project_id': blockfrostApiKey
                }
              }
            );

            if (inputResponse.ok) {
              const inputData = await inputResponse.json();
              const inputs = inputData.inputs || [];
              
              const isConsumed = inputs.some((input: any) => 
                input.tx_hash === utxo.txHash && input.output_index === utxo.outputIndex
              );

              if (isConsumed) {
                console.log(`💸 UTxO ${utxo.txHash}#${utxo.outputIndex} consumed by ${tx.tx_hash}`);
                return true;
              }
            }
          }
        }
      }

      return false; // UTxO still exists and unspent

    } catch (error) {
      console.error(`Blockfrost UTxO check failed:`, error);
      throw error;
    }
  }

  /**
   * Backup method to check UTxO consumption (fallback to local node if available)
   */
  private async checkUTxOConsumedBackup(utxo: UTxOInfo): Promise<boolean> {
    // This would connect to a local Cardano node
    // For now, we'll implement a conservative approach
    console.warn(`Using backup UTxO check for ${utxo.txHash}#${utxo.outputIndex}`);
    
    // If we can't verify through backup, assume UTxO is still valid
    // This prevents false positives that could unnecessarily fail transactions
    return false;
  }

  /**
   * Handle consumed UTxOs by updating request status
   */
  private async handleConsumedUTxOs(request: MonitoredRequest, consumedUtxos: UTxOInfo[]): Promise<void> {
    console.log(`💥 Request ${request.request_id} has ${consumedUtxos.length} consumed UTxOs`);
    
    // Update status to FAILED
    await RequestDAO.updateStatus(request.request_id, 'FAILED');
    
    // Remove from monitoring
    this.removeRequest(request.request_id);
    
    // Broadcast failure
    this.broadcastRequestUpdate(request.request_id, {
      status: 'FAILED',
      details: {
        failure_reason: 'utxo_consumed',
        consumed_utxos: consumedUtxos.map(u => `${u.txHash}#${u.outputIndex}`),
        total_consumed: consumedUtxos.length,
        total_selected: request.selected_utxos.length
      }
    });

    // Broadcast UTxO update
    this.broadcastUTxOUpdate(request.request_id, {
      utxo_consumed: true,
      consumed_utxos: consumedUtxos,
      consuming_transactions: []
    });

    // Log consumption
    await AuditDAO.log({
      event_type: 'utxo_consumed',
      user_id: 'system',
      resource_type: 'request',
      resource_id: request.request_id,
      details: {
        consumed_utxos: consumedUtxos,
        check_count: request.check_count,
        signed_at: request.signed_at,
        detected_at: new Date().toISOString()
      }
    });
  }

  /**
   * Update current Cardano slot
   */
  private async updateCurrentSlot(): Promise<void> {
    try {
      const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
      const networkPrefix = process.env.CARDANO_NETWORK === 'mainnet' ? '' : 'preprod-';
      
      if (!blockfrostApiKey) {
        console.warn('BLOCKFROST_API_KEY not configured, using estimated slot');
        this.estimateCurrentSlot();
        return;
      }

      const response = await fetch(
        `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/network`,
        {
          headers: {
            'project_id': blockfrostApiKey
          }
        }
      );

      if (response.ok) {
        const networkInfo = await response.json();
        this.currentSlot = networkInfo.supply?.slot || 0;
        this.lastSlotUpdate = Date.now();
      } else {
        console.warn('Failed to fetch current slot from Blockfrost');
        this.estimateCurrentSlot();
      }

    } catch (error) {
      console.warn('Error fetching current slot:', error);
      this.estimateCurrentSlot();
    }
  }

  /**
   * Estimate current slot based on time (fallback method)
   */
  private estimateCurrentSlot(): void {
    if (this.lastSlotUpdate === 0) {
      // No previous slot data, use conservative estimate
      const shelleyStart = 1596059091; // Shelley era start timestamp
      const currentTime = Math.floor(Date.now() / 1000);
      const secondsSinceShelley = currentTime - shelleyStart;
      this.currentSlot = Math.floor(secondsSinceShelley); // 1 slot per second approximation
    } else {
      // Estimate based on last known slot
      const timeSinceUpdate = Date.now() - this.lastSlotUpdate;
      const slotsSinceUpdate = Math.floor(timeSinceUpdate / 1000);
      this.currentSlot += slotsSinceUpdate;
    }
    
    this.lastSlotUpdate = Date.now();
  }

  /**
   * Start tracking current slot
   */
  private startSlotTracking(): void {
    // Update slot every minute
    setInterval(() => {
      this.updateCurrentSlot().catch(error => {
        console.error('Failed to update current slot:', error);
      });
    }, 60000);
  }

  /**
   * Clean up completed or failed requests
   */
  private cleanupCompletedRequests(): void {
    const completedRequests: string[] = [];
    
    for (const [requestId, request] of this.monitoredRequests.entries()) {
      // Remove requests that have been checked many times without changes
      if (request.check_count > 1000) { // ~8.3 hours of monitoring
        completedRequests.push(requestId);
      }
      
      // Remove very old requests (older than 24 hours)
      const signedAt = new Date(request.signed_at);
      const hoursSinceSign = (Date.now() - signedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSign > 24) {
        completedRequests.push(requestId);
      }
    }

    for (const requestId of completedRequests) {
      this.removeRequest(requestId);
    }

    if (completedRequests.length > 0) {
      console.log(`🧹 Cleaned up ${completedRequests.length} old monitoring requests`);
    }
  }

  /**
   * Broadcast request status update
   */
  private broadcastRequestUpdate(requestId: string, update: any): void {
    if (webSocketService.isConnected()) {
      webSocketService.emit('request_updated', {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...update
      });
    }
  }

  /**
   * Broadcast TTL update
   */
  private broadcastTTLUpdate(request: MonitoredRequest): void {
    const timeRemainingSeconds = Math.max(0, request.ttl_slot - this.currentSlot);
    
    if (webSocketService.isConnected()) {
      webSocketService.emit('ttl_update', {
        request_id: request.request_id,
        ttl_slot: request.ttl_slot,
        current_slot: this.currentSlot,
        time_remaining_seconds: timeRemainingSeconds,
        status: timeRemainingSeconds <= 0 ? 'expired' : 
                timeRemainingSeconds <= 300 ? 'critical' : 
                timeRemainingSeconds <= 600 ? 'warning' : 'active',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Broadcast UTxO update
   */
  private broadcastUTxOUpdate(requestId: string, update: any): void {
    if (webSocketService.isConnected()) {
      webSocketService.emit('utxo_update', {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...update
      });
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): any {
    return {
      isRunning: this.isRunning,
      monitoredRequests: this.monitoredRequests.size,
      currentSlot: this.currentSlot,
      lastSlotUpdate: new Date(this.lastSlotUpdate),
      requests: Array.from(this.monitoredRequests.values()).map(req => ({
        request_id: req.request_id,
        ttl_slot: req.ttl_slot,
        time_remaining: Math.max(0, req.ttl_slot - this.currentSlot),
        utxo_count: req.selected_utxos.length,
        check_count: req.check_count,
        last_check: req.last_check
      }))
    };
  }
}

// Singleton instance
export const utxoMonitorService = new UTxOMonitorService();