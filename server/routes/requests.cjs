/**
 * OTC Requests API Routes
 */
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { RequestDAO, PreSignedDAO, TransactionDAO, AuditDAO } from '../../src/lib/database.ts';
import { RequestStatus } from '../../src/types/otc/index.ts';

export async function requestRoutes(fastify, options) {
  // Get current Cardano slot (simplified - should connect to actual node)
  async function getCurrentSlot() {
    // In production, this should connect to a Cardano node
    // For now, use a simplified calculation based on timestamp
    const CARDANO_GENESIS_TIME = 1506203091000; // Cardano mainnet genesis time
    const SLOT_LENGTH = 1000; // 1 second per slot (simplified)
    
    const now = Date.now();
    return Math.floor((now - CARDANO_GENESIS_TIME) / SLOT_LENGTH);
  }

  // Create new OTC request
  fastify.post('/requests', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currency', 'amount_mode', 'amount_or_rule', 'recipient', 'ttl_minutes'],
        properties: {
          currency: { type: 'string', enum: ['ADA'] },
          amount_mode: { type: 'string', enum: ['fixed', 'sweep', 'rate_based'] },
          amount_or_rule: { type: 'object' },
          recipient: { type: 'string', pattern: '^addr1[a-z0-9]+$' },
          ttl_minutes: { type: 'number', minimum: 5, maximum: 2160 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            requestId: { type: 'string' },
            signUrl: { type: 'string' },
            qrData: { type: 'string' },
            status: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { currency, amount_mode, amount_or_rule, recipient, ttl_minutes } = request.body;
      const adminId = request.user.adminId;

      // Calculate TTL slot
      const currentSlot = await getCurrentSlot();
      const ttlSlot = currentSlot + (ttl_minutes * 60); // Convert minutes to slots (simplified)

      // Create request in database
      const otcRequest = await RequestDAO.create({
        currency,
        amount_mode,
        amount_or_rule_json: amount_or_rule,
        recipient,
        ttl_slot: ttlSlot,
        status: RequestStatus.REQUESTED,
        created_by: adminId
      });

      // Generate sign URL
      const baseUrl = process.env.VITE_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
      const signUrl = `${baseUrl}/sign?request=${otcRequest.id}`;

      // Generate QR code data
      const qrData = await QRCode.toDataURL(signUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Log request creation
      await AuditDAO.logAction(
        adminId,
        'REQUEST_CREATED',
        'request',
        otcRequest.id,
        {
          amount_mode,
          recipient,
          ttl_minutes
        },
        request.ip,
        request.headers['user-agent']
      );

      // Notify via WebSocket
      if (fastify.io) {
        fastify.io.to('admin').emit('request-created', {
          requestId: otcRequest.id,
          status: RequestStatus.REQUESTED,
          timestamp: new Date().toISOString()
        });
      }

      return reply.code(201).send({
        requestId: otcRequest.id,
        signUrl,
        qrData,
        status: RequestStatus.REQUESTED
      });

    } catch (error) {
      fastify.log.error('Request creation failed:', error);
      return reply.code(400).send({
        error: error.message || 'Failed to create request'
      });
    }
  });

  // Get request by ID
  fastify.get('/requests/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            currency: { type: 'string' },
            amount_mode: { type: 'string' },
            amount_or_rule_json: { type: 'object' },
            recipient: { type: 'string' },
            ttl_slot: { type: 'number' },
            status: { type: 'string' },
            created_by: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
            presigned: { 
              type: 'object',
              nullable: true
            },
            transaction: {
              type: 'object', 
              nullable: true
            }
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
      const { id } = request.params;

      console.log(`🔍 Individual request API called for: ${id}`);

      // 🚨 TEMPORARY: Try to get from list API first as fallback
      try {
        const baseUrl = 'http://localhost:3001';
        const listResponse = await fetch(`${baseUrl}/api/ada/requests`);
        
        if (listResponse.ok) {
          const listData = await listResponse.json();
          const requestFromList = listData.requests?.find(req => req.id === id);
          
          if (requestFromList) {
            console.log(`✅ Found request in list API: ${id}`);
            
            // Get associated pre-signed data
            const presigned = await PreSignedDAO.findByRequestId?.(id) || null;

            // Get associated transaction data
            const transaction = await TransactionDAO.findByRequestId?.(id) || null;

            return {
              ...requestFromList,
              created_at: requestFromList.created_at,
              updated_at: requestFromList.updated_at,
              presigned,
              transaction
            };
          }
        }
      } catch (fallbackError) {
        console.log('List API fallback failed:', fallbackError);
      }

      // Try normal database lookup
      const otcRequest = await RequestDAO.findById(id);
      if (!otcRequest) {
        console.log(`❌ Request not found in database: ${id}`);
        return reply.code(404).send({ error: 'Request not found' });
      }

      console.log(`✅ Found request in database: ${id}`);

      // Get associated pre-signed data
      const presigned = await PreSignedDAO.findByRequestId?.(id) || null;

      // Get associated transaction data
      const transaction = await TransactionDAO.findByRequestId?.(id) || null;

      return {
        ...otcRequest,
        created_at: otcRequest.created_at.toISOString(),
        updated_at: otcRequest.updated_at.toISOString(),
        presigned,
        transaction
      };

    } catch (error) {
      console.error('Failed to get request:', error);
      return reply.code(500).send({
        error: 'Failed to retrieve request'
      });
    }
  });

  // Get requests by admin (for dashboard)
  fastify.get('/requests', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
          status: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  currency: { type: 'string' },
                  amount_mode: { type: 'string' },
                  amount_or_rule_json: { type: 'object' },
                  recipient: { type: 'string' },
                  ttl_slot: { type: 'number' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            hasMore: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const adminId = request.user.adminId;
      const { limit = 50, offset = 0, status } = request.query;

      let requests;
      if (status) {
        // If status filter is provided, we need a different query
        requests = await RequestDAO.findByAdminAndStatus?.(adminId, status, limit, offset) || [];
      } else {
        requests = await RequestDAO.findByAdmin(adminId, limit, offset);
      }

      // Format dates for JSON response
      const formattedRequests = requests.map(req => ({
        ...req,
        created_at: req.created_at.toISOString(),
        updated_at: req.updated_at.toISOString()
      }));

      return {
        requests: formattedRequests,
        total: formattedRequests.length,
        hasMore: formattedRequests.length === limit
      };

    } catch (error) {
      fastify.log.error('Failed to get requests:', error);
      return reply.code(500).send({
        error: 'Failed to retrieve requests'
      });
    }
  });

  // Update request status
  fastify.patch('/requests/:id/status', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { 
            type: 'string', 
            enum: ['REQUESTED', 'SIGNED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'EXPIRED'] 
          },
          reason: { type: 'string' }
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
      const { id } = request.params;
      const { status, reason } = request.body;
      const adminId = request.user.adminId;

      // Check if request exists
      const otcRequest = await RequestDAO.findById(id);
      if (!otcRequest) {
        return reply.code(404).send({ error: 'Request not found' });
      }

      // Update status
      const success = await RequestDAO.updateStatus(id, status);
      
      if (success) {
        // Log status change
        await AuditDAO.logAction(
          adminId,
          'STATUS_CHANGED',
          'request',
          id,
          {
            from: otcRequest.status,
            to: status,
            reason
          },
          request.ip,
          request.headers['user-agent']
        );

        // Notify via WebSocket
        if (fastify.io) {
          fastify.io.to('admin').emit('status-change', {
            requestId: id,
            status,
            timestamp: new Date().toISOString(),
            reason
          });

          fastify.io.to(`request-${id}`).emit('status-change', {
            requestId: id,
            status,
            timestamp: new Date().toISOString(),
            reason
          });
        }

        return {
          success: true,
          message: 'Status updated successfully'
        };
      } else {
        return reply.code(400).send({
          error: 'Failed to update status'
        });
      }

    } catch (error) {
      fastify.log.error('Status update failed:', error);
      return reply.code(500).send({
        error: 'Failed to update status'
      });
    }
  });

  // Generate new sign link
  fastify.post('/requests/:id/generate-link', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            signUrl: { type: 'string' },
            qrData: { type: 'string' }
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
      const { id } = request.params;
      const adminId = request.user.adminId;

      // Check if request exists
      const otcRequest = await RequestDAO.findById(id);
      if (!otcRequest) {
        return reply.code(404).send({ error: 'Request not found' });
      }

      // Generate new sign URL
      const baseUrl = process.env.VITE_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
      const signUrl = `${baseUrl}/sign?request=${id}&t=${Date.now()}`;

      // Generate QR code
      const qrData = await QRCode.toDataURL(signUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Log link generation
      await AuditDAO.logAction(
        adminId,
        'LINK_GENERATED',
        'request',
        id,
        { signUrl },
        request.ip,
        request.headers['user-agent']
      );

      return {
        signUrl,
        qrData
      };

    } catch (error) {
      fastify.log.error('Link generation failed:', error);
      return reply.code(500).send({
        error: 'Failed to generate link'
      });
    }
  });

  // Save pre-signed data
  fastify.post('/presigned', {
    schema: {
      body: {
        type: 'object',
        required: ['requestId', 'provider_id', 'txBodyCbor', 'witnessCbor', 'selectedUtxos', 'ttl_slot'],
        properties: {
          requestId: { type: 'string', minLength: 1 },
          provider_id: { type: 'string' },
          txBodyCbor: { type: 'string' },
          witnessCbor: { type: 'string' },
          selectedUtxos: { type: 'array' },
          ttl_slot: { type: 'number' }
        }
      },    
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            presignedId: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { requestId, provider_id, txBodyCbor, witnessCbor, selectedUtxos, ttl_slot } = request.body;

      // Verify request exists and is in REQUESTED status
      const otcRequest = await RequestDAO.findById(requestId);
      if (!otcRequest) {
        return reply.code(400).send({ error: 'Request not found' });
      }

      if (otcRequest.status !== RequestStatus.REQUESTED) {
        return reply.code(400).send({ error: 'Request is not in REQUESTED status' });
      }

      // TODO: Encrypt sensitive data before storing
      // For now, store as-is (in production, encrypt txBodyCbor and witnessCbor)

      // Save pre-signed data
      const presigned = await PreSignedDAO.create({
        request_id: requestId,
        provider_id,
        tx_body_cbor: txBodyCbor, // Should be encrypted
        witness_cbor: witnessCbor, // Should be encrypted
        selected_utxos: selectedUtxos
      });

      // Update request status to SIGNED
      await RequestDAO.updateStatus(requestId, RequestStatus.SIGNED);

      // Log signing
      await AuditDAO.logAction(
        '', // No admin ID for user actions
        'REQUEST_SIGNED',
        'request',
        requestId,
        {
          provider_id,
          utxo_count: selectedUtxos.length
        }
      );

      // Notify via WebSocket
      if (fastify.io) {
        fastify.io.to('admin').emit('status-change', {
          requestId,
          status: RequestStatus.SIGNED,
          timestamp: new Date().toISOString(),
          data: { provider_id }
        });

        fastify.io.to(`request-${requestId}`).emit('status-change', {
          requestId,
          status: RequestStatus.SIGNED,
          timestamp: new Date().toISOString()
        });
      }

      return reply.code(201).send({
        success: true,
        message: 'Pre-signed data saved successfully',
        presignedId: presigned.id
      });

    } catch (error) {
      fastify.log.error('Pre-signed data save failed:', error);
      return reply.code(400).send({
        error: error.message || 'Failed to save pre-signed data'
      });
    }
  });
}