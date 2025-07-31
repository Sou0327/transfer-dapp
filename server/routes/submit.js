/**
 * Transaction Submission API Routes
 * Handles transaction submission with retry logic and status monitoring
 */
import { transactionSubmitter, BatchSubmissionManager, SubmissionQueue } from '../../src/lib/transactionSubmitter.ts';
import { RequestDAO, TransactionDAO, AuditDAO } from '../../src/lib/database.ts';

// Initialize batch manager and queue
const batchManager = new BatchSubmissionManager(transactionSubmitter);
const submissionQueue = new SubmissionQueue(transactionSubmitter);

export async function submitRoutes(fastify, options) {

  // Submit a single transaction
  fastify.post('/submit/:request_id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          request_id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['server', 'wallet'] },
          priority: { type: 'string', enum: ['normal', 'high'] },
          force: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tx_hash: { type: 'string' },
            message: { type: 'string' },
            attempts: { type: 'integer' },
            mode: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;
      const { mode = 'server', priority = 'normal', force = false } = request.body;

      // Validate request exists and is in correct state
      const otcRequest = await RequestDAO.getById(request_id);
      if (!otcRequest) {
        return reply.code(400).send({
          error: 'Request not found'
        });
      }

      // Check if request is ready for submission
      if (otcRequest.status !== 'SIGNED' && !force) {
        return reply.code(400).send({
          error: `Request is in ${otcRequest.status} state. Only SIGNED requests can be submitted.`
        });
      }

      // Check if already submitted (unless forced)
      const existingTx = await TransactionDAO.getByRequestId(request_id);
      if (existingTx && existingTx.status === 'SUBMITTED' && !force) {
        return reply.code(409).send({
          error: 'Transaction already submitted'
        });
      }

      // Check if submission is already in progress
      const submissionStatus = transactionSubmitter.getSubmissionStatus(request_id);
      if (submissionStatus.isActive && !force) {
        return reply.code(409).send({
          error: 'Submission already in progress'
        });
      }

      // Cancel existing submission if forced
      if (force) {
        transactionSubmitter.cancelSubmission(request_id);
      }

      // Submit transaction
      const result = await transactionSubmitter.submitTransaction(request_id, {
        mode,
        priority
      });

      // Log admin action
      await AuditDAO.log({
        event_type: 'manual_submission_triggered',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: request_id,
        details: {
          request_id,
          mode,
          priority,
          force,
          success: result.success,
          tx_hash: result.txHash
        },
        ip_address: request.ip
      });

      if (result.success) {
        // Notify via WebSocket
        try {
          fastify.io?.emit('request_updated', {
            request_id,
            status: 'SUBMITTED',
            tx_hash: result.txHash,
            timestamp: new Date().toISOString()
          });
        } catch (wsError) {
          fastify.log.warn('WebSocket notification failed:', wsError);
        }

        return {
          success: true,
          tx_hash: result.txHash,
          message: 'Transaction submitted successfully',
          attempts: result.attempts,
          mode: result.mode
        };
      } else {
        return reply.code(500).send({
          error: result.error
        });
      }

    } catch (error) {
      fastify.log.error('Transaction submission failed:', error);
      return reply.code(500).send({
        error: error.message || 'Transaction submission failed'
      });
    }
  });

  // Submit multiple transactions in batch
  fastify.post('/submit/batch', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['request_ids'],
        properties: {
          request_ids: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10 // Limit batch size
          },
          mode: { type: 'string', enum: ['server', 'wallet'] },
          max_concurrency: { type: 'integer', minimum: 1, maximum: 5 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  tx_hash: { type: 'string' },
                  error: { type: 'string' },
                  attempts: { type: 'integer' }
                }
              }
            },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                successful: { type: 'integer' },
                failed: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_ids, mode = 'server', max_concurrency = 3 } = request.body;

      // Validate all requests exist and are ready for submission
      const validationErrors = [];
      for (const request_id of request_ids) {
        const otcRequest = await RequestDAO.getById(request_id);
        if (!otcRequest) {
          validationErrors.push(`Request ${request_id} not found`);
        } else if (otcRequest.status !== 'SIGNED') {
          validationErrors.push(`Request ${request_id} is not in SIGNED state`);
        }
      }

      if (validationErrors.length > 0) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: validationErrors
        });
      }

      // Create batch manager with specified concurrency
      const customBatchManager = new BatchSubmissionManager(transactionSubmitter, max_concurrency);

      // Submit batch
      const results = await customBatchManager.submitBatch(request_ids, { mode });

      // Calculate summary
      const summary = {
        total: request_ids.length,
        successful: 0,
        failed: 0
      };

      const formattedResults = {};
      for (const [requestId, result] of results.entries()) {
        formattedResults[requestId] = result;
        if (result.success) {
          summary.successful++;
        } else {
          summary.failed++;
        }
      }

      // Log batch submission
      await AuditDAO.log({
        event_type: 'batch_submission_completed',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction_batch',
        details: {
          request_ids,
          mode,
          max_concurrency,
          summary
        },
        ip_address: request.ip
      });

      // Notify successful submissions via WebSocket
      try {
        for (const [requestId, result] of results.entries()) {
          if (result.success) {
            fastify.io?.emit('request_updated', {
              request_id: requestId,
              status: 'SUBMITTED',
              tx_hash: result.txHash,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (wsError) {
        fastify.log.warn('WebSocket notifications failed:', wsError);
      }

      return {
        results: formattedResults,
        summary
      };

    } catch (error) {
      fastify.log.error('Batch submission failed:', error);
      return reply.code(500).send({
        error: error.message || 'Batch submission failed'
      });
    }
  });

  // Add request to submission queue
  fastify.post('/submit/queue/:request_id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          request_id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['server', 'wallet'] },
          priority: { type: 'string', enum: ['normal', 'high'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            queue_position: { type: 'integer' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;
      const { mode = 'server', priority = 'normal' } = request.body;

      // Validate request
      const otcRequest = await RequestDAO.getById(request_id);
      if (!otcRequest) {
        return reply.code(400).send({
          error: 'Request not found'
        });
      }

      if (otcRequest.status !== 'SIGNED') {
        return reply.code(400).send({
          error: `Request is in ${otcRequest.status} state. Only SIGNED requests can be queued.`
        });
      }

      // Add to queue
      submissionQueue.enqueue(request_id, { mode }, priority);

      const queueStatus = submissionQueue.getStatus();

      // Log queue addition
      await AuditDAO.log({
        event_type: 'submission_queued',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: request_id,
        details: {
          request_id,
          mode,
          priority,
          queue_length: queueStatus.queueLength
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: 'Request added to submission queue',
        queue_position: queueStatus.queueLength
      };

    } catch (error) {
      fastify.log.error('Queue submission failed:', error);
      return reply.code(500).send({
        error: error.message || 'Failed to add to queue'
      });
    }
  });

  // Get submission status
  fastify.get('/submit/status/:request_id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          request_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            request_id: { type: 'string' },
            submission_status: {
              type: 'object',
              properties: {
                is_active: { type: 'boolean' },
                has_retry_scheduled: { type: 'boolean' }
              }
            },
            transaction_record: { type: 'object' },
            queue_status: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;

      // Get submission status
      const submissionStatus = transactionSubmitter.getSubmissionStatus(request_id);

      // Get transaction record
      const transactionRecord = await TransactionDAO.getByRequestId(request_id);

      // Get queue status
      const queueStatus = submissionQueue.getStatus();

      return {
        request_id,
        submission_status: submissionStatus,
        transaction_record: transactionRecord || null,
        queue_status: queueStatus
      };

    } catch (error) {
      fastify.log.error('Failed to get submission status:', error);
      return reply.code(500).send({
        error: 'Failed to get submission status'
      });
    }
  });

  // Cancel pending submission
  fastify.delete('/submit/:request_id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          request_id: { type: 'string' }
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
      const { request_id } = request.params;

      const cancelled = transactionSubmitter.cancelSubmission(request_id);

      // Log cancellation
      await AuditDAO.log({
        event_type: 'submission_cancelled',
        user_id: request.user?.id || 'unknown',
        resource_type: 'transaction',
        resource_id: request_id,
        details: {
          request_id,
          was_active: cancelled
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: cancelled ? 'Submission cancelled' : 'No active submission to cancel'
      };

    } catch (error) {
      fastify.log.error('Failed to cancel submission:', error);
      return reply.code(500).send({
        error: 'Failed to cancel submission'
      });
    }
  });

  // Get submission service statistics
  fastify.get('/submit/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            submitter_stats: { type: 'object' },
            queue_status: { type: 'object' },
            recent_submissions: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const submitterStats = transactionSubmitter.getStats();
      const queueStatus = submissionQueue.getStatus();

      // Get recent submissions from database
      const recentSubmissions = await TransactionDAO.getRecent(10);

      return {
        submitter_stats: submitterStats,
        queue_status: queueStatus,
        recent_submissions: recentSubmissions
      };

    } catch (error) {
      fastify.log.error('Failed to get submission stats:', error);
      return reply.code(500).send({
        error: 'Failed to get submission stats'
      });
    }
  });

  // Retry failed submission
  fastify.post('/submit/:request_id/retry', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          request_id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['server', 'wallet'] },
          delay_seconds: { type: 'integer', minimum: 0, maximum: 3600 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            retry_scheduled_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;
      const { mode = 'server', delay_seconds = 0 } = request.body;

      // Validate request exists
      const otcRequest = await RequestDAO.getById(request_id);
      if (!otcRequest) {
        return reply.code(400).send({
          error: 'Request not found'
        });
      }

      const delayMs = delay_seconds * 1000;
      const retryAt = new Date(Date.now() + delayMs);

      if (delayMs > 0) {
        // Schedule retry
        transactionSubmitter.scheduleRetry(request_id, delayMs);
        
        // Log scheduled retry
        await AuditDAO.log({
          event_type: 'submission_retry_scheduled',
          user_id: request.user?.id || 'unknown',
          resource_type: 'transaction',
          resource_id: request_id,
          details: {
            request_id,
            mode,
            delay_seconds,
            retry_scheduled_at: retryAt.toISOString()
          },
          ip_address: request.ip
        });

        return {
          success: true,
          message: `Retry scheduled in ${delay_seconds} seconds`,
          retry_scheduled_at: retryAt.toISOString()
        };
      } else {
        // Immediate retry
        const result = await transactionSubmitter.submitTransaction(request_id, { mode });

        // Log immediate retry
        await AuditDAO.log({
          event_type: 'submission_immediate_retry',
          user_id: request.user?.id || 'unknown',
          resource_type: 'transaction',
          resource_id: request_id,
          details: {
            request_id,
            mode,
            success: result.success,
            tx_hash: result.txHash
          },
          ip_address: request.ip
        });

        if (result.success) {
          // Notify via WebSocket
          try {
            fastify.io?.emit('request_updated', {
              request_id,
              status: 'SUBMITTED',
              tx_hash: result.txHash,
              timestamp: new Date().toISOString()
            });
          } catch (wsError) {
            fastify.log.warn('WebSocket notification failed:', wsError);
          }

          return {
            success: true,
            message: 'Retry successful',
            tx_hash: result.txHash
          };
        } else {
          return reply.code(500).send({
            error: `Retry failed: ${result.error}`
          });
        }
      }

    } catch (error) {
      fastify.log.error('Retry submission failed:', error);
      return reply.code(500).send({
        error: error.message || 'Retry submission failed'
      });
    }
  });
}