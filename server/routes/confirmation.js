/**
 * Block Confirmation Monitoring API Routes
 * Manages block confirmation monitoring for submitted transactions
 */
import { blockConfirmationMonitor } from '../../src/lib/blockConfirmationMonitor.js';
import { TransactionDAO, AuditDAO } from '../../src/lib/database.js';

export async function confirmationRoutes(fastify, options) {

  // Get block confirmation monitoring status
  fastify.get('/confirmation/status', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            service_status: { type: 'string' },
            stats: { type: 'object' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const stats = blockConfirmationMonitor.getStats();
      
      return {
        service_status: stats.isRunning ? 'running' : 'stopped',
        stats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Failed to get confirmation monitoring status:', error);
      return reply.code(500).send({
        error: 'Failed to get confirmation monitoring status'
      });
    }
  });

  // Start block confirmation monitoring
  fastify.post('/confirmation/start', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await blockConfirmationMonitor.start();

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_monitoring_started',
        user_id: request.user?.id || 'unknown',
        resource_type: 'confirmation_monitor',
        details: {
          started_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info('Block confirmation monitoring started by admin');

      return {
        success: true,
        message: 'Block confirmation monitoring started successfully'
      };

    } catch (error) {
      fastify.log.error('Failed to start confirmation monitoring:', error);
      return reply.code(500).send({
        error: 'Failed to start confirmation monitoring'
      });
    }
  });

  // Stop block confirmation monitoring
  fastify.post('/confirmation/stop', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      blockConfirmationMonitor.stop();

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_monitoring_stopped',
        user_id: request.user?.id || 'unknown',
        resource_type: 'confirmation_monitor',
        details: {
          stopped_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info('Block confirmation monitoring stopped by admin');

      return {
        success: true,
        message: 'Block confirmation monitoring stopped successfully'
      };

    } catch (error) {
      fastify.log.error('Failed to stop confirmation monitoring:', error);
      return reply.code(500).send({
        error: 'Failed to stop confirmation monitoring'
      });
    }
  });

  // Get all monitored transactions
  fastify.get('/confirmation/transactions', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tx_hash: { type: 'string' },
                  request_id: { type: 'string' },
                  confirmations: { type: 'integer' },
                  status: { type: 'string' },
                  block_height: { type: 'integer' },
                  block_hash: { type: 'string' },
                  submitted_at: { type: 'string' },
                  last_checked: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const transactions = blockConfirmationMonitor.getAllMonitoredTransactions();

      return {
        total: transactions.length,
        transactions: transactions.map(tx => ({
          tx_hash: tx.txHash,
          request_id: tx.requestId,
          confirmations: tx.confirmations,
          status: tx.status,
          block_height: tx.blockHeight,
          block_hash: tx.block,
          submitted_at: tx.submittedAt.toISOString(),
          last_checked: tx.lastChecked.toISOString(),
          check_attempts: tx.checkAttempts
        }))
      };

    } catch (error) {
      fastify.log.error('Failed to get monitored transactions:', error);
      return reply.code(500).send({
        error: 'Failed to get monitored transactions'
      });
    }
  });

  // Get specific transaction confirmation status
  fastify.get('/confirmation/transactions/:tx_hash', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          tx_hash: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tx_hash: { type: 'string' },
            is_monitored: { type: 'boolean' },
            confirmation_info: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tx_hash } = request.params;
      const transactionStatus = blockConfirmationMonitor.getTransactionStatus(tx_hash);

      if (!transactionStatus) {
        return reply.code(404).send({
          error: 'Transaction not found in monitoring'
        });
      }

      return {
        tx_hash,
        is_monitored: true,
        confirmation_info: {
          request_id: transactionStatus.requestId,
          confirmations: transactionStatus.confirmations,
          status: transactionStatus.status,
          block_height: transactionStatus.blockHeight,
          block_hash: transactionStatus.block,
          block_time: transactionStatus.blockTime?.toISOString(),
          submitted_at: transactionStatus.submittedAt.toISOString(),
          last_checked: transactionStatus.lastChecked.toISOString(),
          check_attempts: transactionStatus.checkAttempts
        }
      };

    } catch (error) {
      fastify.log.error('Failed to get transaction confirmation status:', error);
      return reply.code(500).send({
        error: 'Failed to get transaction confirmation status'
      });
    }
  });

  // Force check a specific transaction
  fastify.post('/confirmation/transactions/:tx_hash/check', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          tx_hash: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            confirmation_info: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tx_hash } = request.params;

      // Force check the transaction
      await blockConfirmationMonitor.forceCheckTransaction(tx_hash);

      // Get updated status  
      const transactionStatus = blockConfirmationMonitor.getTransactionStatus(tx_hash);

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_force_check',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: transactionStatus?.requestId,
        details: {
          tx_hash,
          triggered_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: `Force check completed for transaction ${tx_hash}`,
        confirmation_info: transactionStatus ? {
          confirmations: transactionStatus.confirmations,
          status: transactionStatus.status,
          block_height: transactionStatus.blockHeight,
          last_checked: transactionStatus.lastChecked.toISOString()
        } : null
      };

    } catch (error) {
      if (error.message.includes('not being monitored')) {
        return reply.code(404).send({
          error: error.message
        });
      }

      fastify.log.error('Failed to force check transaction:', error);
      return reply.code(500).send({
        error: 'Failed to force check transaction'
      });
    }
  });

  // Add transaction to monitoring manually
  fastify.post('/confirmation/transactions/:tx_hash/add', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          tx_hash: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['request_id'],
        properties: {
          request_id: { type: 'string' },
          submitted_at: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tx_hash } = request.params;
      const { request_id, submitted_at } = request.body;

      const submittedDate = submitted_at ? new Date(submitted_at) : new Date();

      await blockConfirmationMonitor.addTransaction(tx_hash, request_id, submittedDate);

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_monitoring_added',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: request_id,
        details: {
          tx_hash,
          request_id,
          added_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: `Transaction ${tx_hash} added to confirmation monitoring`
      };

    } catch (error) {
      fastify.log.error('Failed to add transaction to monitoring:', error);
      return reply.code(500).send({
        error: 'Failed to add transaction to monitoring'
      });
    }
  });

  // Remove transaction from monitoring
  fastify.delete('/confirmation/transactions/:tx_hash', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          tx_hash: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tx_hash } = request.params;

      // Get transaction info before removing
      const transactionStatus = blockConfirmationMonitor.getTransactionStatus(tx_hash);

      blockConfirmationMonitor.removeTransaction(tx_hash);

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_monitoring_removed',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: transactionStatus?.requestId,
        details: {
          tx_hash,
          removed_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: `Transaction ${tx_hash} removed from confirmation monitoring`
      };

    } catch (error) {
      fastify.log.error('Failed to remove transaction from monitoring:', error);
      return reply.code(500).send({
        error: 'Failed to remove transaction from monitoring'
      });
    }
  });

  // Update monitoring configuration
  fastify.patch('/confirmation/config', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          check_interval: { type: 'integer', minimum: 10000, maximum: 300000 }, // 10s to 5min
          required_confirmations: { type: 'integer', minimum: 1, maximum: 10 },
          max_confirmation_time: { type: 'integer', minimum: 3600000 } // min 1 hour
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            new_config: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const updates = request.body;

      // Map API fields to internal config
      const configUpdates = {};
      if (updates.check_interval) configUpdates.checkInterval = updates.check_interval;
      if (updates.required_confirmations) configUpdates.requiredConfirmations = updates.required_confirmations;
      if (updates.max_confirmation_time) configUpdates.maxConfirmationTime = updates.max_confirmation_time;

      blockConfirmationMonitor.updateConfig(configUpdates);

      // Log audit event
      await AuditDAO.log({
        event_type: 'confirmation_config_updated',
        user_id: request.user?.id || 'unknown',
        resource_type: 'confirmation_monitor',
        details: {
          config_updates: configUpdates,
          updated_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      const stats = blockConfirmationMonitor.getStats();

      return {
        success: true,
        message: 'Confirmation monitoring configuration updated',
        new_config: {
          check_interval: stats.checkInterval,
          required_confirmations: stats.requiredConfirmations
        }
      };

    } catch (error) {
      fastify.log.error('Failed to update confirmation config:', error);
      return reply.code(500).send({
        error: 'Failed to update confirmation config'
      });
    }
  });

  // Get confirmation statistics
  fastify.get('/confirmation/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            service_stats: { type: 'object' },
            transaction_stats: { type: 'object' },
            recent_confirmations: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const serviceStats = blockConfirmationMonitor.getStats();
      const transactionStats = await TransactionDAO.getStats(24); // 24 hours

      // Get recent confirmed/failed transactions
      const recentConfirmed = await TransactionDAO.getByStatus('CONFIRMED', 10);
      const recentFailed = await TransactionDAO.getByStatus('FAILED', 5);

      return {
        service_stats: serviceStats,
        transaction_stats: transactionStats,
        recent_confirmations: {
          confirmed: recentConfirmed,
          failed: recentFailed
        }
      };

    } catch (error) {
      fastify.log.error('Failed to get confirmation stats:', error);
      return reply.code(500).send({
        error: 'Failed to get confirmation stats'
      });
    }
  });

  // Health check for confirmation monitoring
  fastify.get('/confirmation/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            healthy: { type: 'boolean' },
            service_running: { type: 'boolean' },
            monitored_transactions: { type: 'integer' },
            last_activity: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const stats = blockConfirmationMonitor.getStats();
      const healthy = stats.isRunning;

      return {
        healthy,
        service_running: stats.isRunning,
        monitored_transactions: stats.monitoredTransactions,
        last_activity: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Confirmation health check failed:', error);
      return {
        healthy: false,
        service_running: false,
        monitored_transactions: 0,
        last_activity: null
      };
    }
  });
}