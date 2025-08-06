/**
 * Pre-Signed Data API Routes
 * Handles secure storage and retrieval of signed transaction data
 */
import { PreSignedDAO, RequestDAO, AuditDAO } from '../../src/lib/database.ts';

export async function preSignedRoutes(fastify, options) {
  
  // Store pre-signed transaction data
  fastify.post('/presigned', {
    schema: {
      body: {
        type: 'object',
        required: ['request_id', 'tx_body_hex', 'witness_set_hex', 'tx_hash'],
        properties: {
          request_id: { type: 'string', minLength: 1 },
          tx_body_hex: { type: 'string', minLength: 1 },
          witness_set_hex: { type: 'string', minLength: 1 },
          tx_hash: { type: 'string', minLength: 64, maxLength: 64 },
          fee_lovelace: { type: 'string' },
          ttl_slot: { type: 'integer', minimum: 0 },
          wallet_used: { type: 'string' },
          metadata: { type: 'object' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            presigned_id: { type: 'string' },
            message: { type: 'string' }
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
      const {
        request_id,
        tx_body_hex,
        witness_set_hex,
        tx_hash,
        fee_lovelace,
        ttl_slot,
        wallet_used,
        metadata
      } = request.body;

      // Validate request exists and is in correct state
      const otcRequest = await RequestDAO.getById(request_id);
      if (!otcRequest) {
        return reply.code(400).send({
          error: 'Request not found'
        });
      }

      if (otcRequest.status !== 'REQUESTED') {
        return reply.code(400).send({
          error: `Request is in ${otcRequest.status} state, cannot store pre-signed data`
        });
      }

      // Check if pre-signed data already exists
      const existing = await PreSignedDAO.getByRequestId(request_id);
      if (existing) {
        return reply.code(409).send({
          error: 'Pre-signed data already exists for this request'
        });
      }

      // Validate transaction hex format
      if (!/^[a-fA-F0-9]+$/.test(tx_body_hex) || !/^[a-fA-F0-9]+$/.test(witness_set_hex)) {
        return reply.code(400).send({
          error: 'Invalid hex format in transaction data'
        });
      }

      // Validate transaction hash format
      if (!/^[a-fA-F0-9]{64}$/.test(tx_hash)) {
        return reply.code(400).send({
          error: 'Invalid transaction hash format'
        });
      }

      // Store pre-signed data with encryption
      const preSignedData = {
        request_id,
        tx_body_hex,
        witness_set_hex,
        tx_hash,
        fee_lovelace: fee_lovelace || '0',
        ttl_slot: ttl_slot || 0,
        wallet_used: wallet_used || 'unknown',
        metadata: metadata || {}
      };

      const preSignedId = await PreSignedDAO.create(preSignedData);

      // Update request status to SIGNED
      await RequestDAO.updateStatus(request_id, 'SIGNED');

      // Log audit event
      await AuditDAO.log({
        event_type: 'presigned_stored',
        user_id: 'system',
        resource_type: 'presigned_data',
        resource_id: preSignedId,
        details: {
          request_id,
          tx_hash,
          wallet_used,
          fee_lovelace,
          ttl_slot
        },
        ip_address: request.ip
      });

      fastify.log.info(`Pre-signed data stored for request ${request_id}`);

      // Notify via WebSocket if available
      try {
        fastify.io?.emit('request_updated', {
          request_id,
          status: 'SIGNED',
          tx_hash,
          timestamp: new Date().toISOString()
        });
      } catch (wsError) {
        fastify.log.warn('WebSocket notification failed:', wsError);
      }

      // Add request to UTxO monitoring
      try {
        const { utxoMonitorService } = await import('../../src/lib/utxoMonitor.js');
        await utxoMonitorService.addRequest(request_id);
        fastify.log.info(`Request ${request_id} added to UTxO monitoring`);
      } catch (monitorError) {
        fastify.log.warn('Failed to add request to monitoring:', monitorError);
        // Don't fail the whole operation if monitoring fails
      }

      return reply.code(201).send({
        success: true,
        presigned_id: preSignedId,
        message: 'Pre-signed data stored successfully'
      });

    } catch (error) {
      fastify.log.error('Store pre-signed data failed:', error);
      
      // Log audit event for failure
      try {
        await AuditDAO.log({
          event_type: 'presigned_store_failed',
          user_id: 'system',
          resource_type: 'presigned_data',
          resource_id: null,
          details: {
            request_id: request.body.request_id,
            error: error.message
          },
          ip_address: request.ip
        });
      } catch (auditError) {
        fastify.log.error('Audit logging failed:', auditError);
      }

      return reply.code(500).send({
        error: error.message || 'Failed to store pre-signed data'
      });
    }
  });

  // Get pre-signed data by request ID
  fastify.get('/presigned/:request_id', {
    preHandler: [fastify.authenticate], // Require authentication
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
            id: { type: 'string' },
            request_id: { type: 'string' },
            tx_hash: { type: 'string' },
            fee_lovelace: { type: 'string' },
            ttl_slot: { type: 'integer' },
            wallet_used: { type: 'string' },
            signed_at: { type: 'string' },
            metadata: { type: 'object' },
            has_witness_data: { type: 'boolean' },
            has_tx_body: { type: 'boolean' }
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
      const { request_id } = request.params;

      const preSignedData = await PreSignedDAO.getByRequestId(request_id);
      if (!preSignedData) {
        return reply.code(404).send({
          error: 'Pre-signed data not found'
        });
      }

      // Return metadata without sensitive data
      return {
        id: preSignedData.id,
        request_id: preSignedData.request_id,
        tx_hash: preSignedData.tx_hash,
        fee_lovelace: preSignedData.fee_lovelace,
        ttl_slot: preSignedData.ttl_slot,
        wallet_used: preSignedData.wallet_used,
        signed_at: preSignedData.signed_at,
        metadata: preSignedData.metadata || {},
        has_witness_data: !!preSignedData.witness_set_encrypted,
        has_tx_body: !!preSignedData.tx_body_encrypted
      };

    } catch (error) {
      fastify.log.error('Get pre-signed data failed:', error);
      return reply.code(500).send({
        error: 'Failed to retrieve pre-signed data'
      });
    }
  });

  // Get complete pre-signed data for transaction submission (admin only)
  fastify.get('/presigned/:request_id/complete', {
    preHandler: [fastify.authenticate], // Require authentication
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
            tx_body_hex: { type: 'string' },
            witness_set_hex: { type: 'string' },
            tx_hash: { type: 'string' },
            fee_lovelace: { type: 'string' },
            ttl_slot: { type: 'integer' },
            signed_tx_hex: { type: 'string' },
            metadata: { type: 'object' }
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
      const { request_id } = request.params;

      // Get and decrypt complete pre-signed data
      const completeData = await PreSignedDAO.getCompleteData(request_id);
      if (!completeData) {
        return reply.code(404).send({
          error: 'Complete pre-signed data not found'
        });
      }

      // Log audit event for sensitive data access
      await AuditDAO.log({
        event_type: 'presigned_accessed',
        user_id: request.user?.id || 'unknown',
        resource_type: 'presigned_data',
        resource_id: completeData.id,
        details: {
          request_id,
          tx_hash: completeData.tx_hash,
          purpose: 'transaction_submission'
        },
        ip_address: request.ip
      });

      return {
        request_id: completeData.request_id,
        tx_body_hex: completeData.tx_body_hex,
        witness_set_hex: completeData.witness_set_hex,
        tx_hash: completeData.tx_hash,
        fee_lovelace: completeData.fee_lovelace,
        ttl_slot: completeData.ttl_slot,
        signed_tx_hex: completeData.signed_tx_hex,
        metadata: completeData.metadata || {}
      };

    } catch (error) {
      fastify.log.error('Get complete pre-signed data failed:', error);
      return reply.code(500).send({
        error: 'Failed to retrieve complete pre-signed data'
      });
    }
  });

  // Delete pre-signed data (admin only)
  fastify.delete('/presigned/:request_id', {
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
      const { request_id } = request.params;

      // Check if pre-signed data exists
      const existing = await PreSignedDAO.getByRequestId(request_id);
      if (!existing) {
        return reply.code(404).send({
          error: 'Pre-signed data not found'
        });
      }

      // Delete pre-signed data
      await PreSignedDAO.delete(request_id);

      // Update request status back to REQUESTED
      await RequestDAO.updateStatus(request_id, 'REQUESTED');

      // Log audit event
      await AuditDAO.log({
        event_type: 'presigned_deleted',
        user_id: request.user?.id || 'unknown',
        resource_type: 'presigned_data',
        resource_id: existing.id,
        details: {
          request_id,
          tx_hash: existing.tx_hash,
          reason: 'admin_deletion'
        },
        ip_address: request.ip
      });

      fastify.log.info(`Pre-signed data deleted for request ${request_id}`);

      // Notify via WebSocket
      try {
        fastify.io?.emit('request_updated', {
          request_id,
          status: 'REQUESTED',
          timestamp: new Date().toISOString()
        });
      } catch (wsError) {
        fastify.log.warn('WebSocket notification failed:', wsError);
      }

      return {
        success: true,
        message: 'Pre-signed data deleted successfully'
      };

    } catch (error) {
      fastify.log.error('Delete pre-signed data failed:', error);
      return reply.code(500).send({
        error: 'Failed to delete pre-signed data'
      });
    }
  });

  // Update pre-signed data metadata
  fastify.patch('/presigned/:request_id/metadata', {
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
          metadata: { type: 'object' }
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
      const { metadata } = request.body;

      // Update metadata
      await PreSignedDAO.updateMetadata(request_id, metadata);

      // Log audit event
      await AuditDAO.log({
        event_type: 'presigned_metadata_updated',
        user_id: request.user?.id || 'unknown',
        resource_type: 'presigned_data',
        resource_id: request_id,
        details: {
          request_id,
          updated_fields: Object.keys(metadata || {})
        },
        ip_address: request.ip
      });

      return {
        success: true,
        message: 'Metadata updated successfully'
      };

    } catch (error) {
      fastify.log.error('Update pre-signed metadata failed:', error);
      return reply.code(500).send({
        error: 'Failed to update metadata'
      });
    }
  });

  // Health check for pre-signed data integrity
  fastify.get('/presigned/health/:request_id', {
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
            healthy: { type: 'boolean' },
            checks: { type: 'object' },
            issues: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;
      
      const healthCheck = await PreSignedDAO.checkIntegrity(request_id);
      
      return {
        healthy: healthCheck.healthy,
        checks: healthCheck.checks,
        issues: healthCheck.issues || []
      };

    } catch (error) {
      fastify.log.error('Pre-signed data health check failed:', error);
      return {
        healthy: false,
        checks: {},
        issues: ['Health check failed: ' + error.message]
      };
    }
  });
}