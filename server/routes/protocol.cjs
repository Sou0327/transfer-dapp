/**
 * Protocol Parameters API Routes
 */

// Simple in-memory cache for development
const cache = new Map();
const requestsList = new Map(); // Store requests list for enumeration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const CacheService = {
  get: (key) => {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      cache.delete(key);
      return null;
    }
    
    return item.data;
  },
  
  set: (key, data, ttlSeconds) => {
    cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }
};

export async function protocolRoutes(fastify, options) {
  // Get protocol parameters (cached)
  fastify.get('/protocol-params', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            minFeeA: { type: 'number' },
            minFeeB: { type: 'number' },
            maxTxSize: { type: 'number' },
            utxoCostPerWord: { type: 'number' },
            minUtxo: { type: 'string' },
            poolDeposit: { type: 'string' },
            keyDeposit: { type: 'string' },
            coinsPerUtxoByte: { type: 'string' },
            currentSlot: { type: 'number' },
            cached: { type: 'boolean' },
            timestamp: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check cache first  
      const cacheKey = 'protocol-params';
      const cached = await CacheService.get(cacheKey);
      
      if (cached) {
        return {
          ...cached,
          cached: true,
          timestamp: new Date().toISOString()
        };
      }

      // Fetch from Blockfrost API
      const blockfrostKey = process.env.BLOCKFROST_API_KEY;
      if (!blockfrostKey) {
        throw new Error('BLOCKFROST_API_KEY not configured');
      }

      const network = process.env.CARDANO_NETWORK || 'mainnet';
      const baseUrl = network === 'mainnet' 
        ? 'https://cardano-mainnet.blockfrost.io/api/v0'
        : 'https://cardano-preprod.blockfrost.io/api/v0';

      // Fetch protocol parameters
      const response = await fetch(`${baseUrl}/epochs/latest/parameters`, {
        headers: {
          'project_id': blockfrostKey
        }
      });

      if (!response.ok) {
        throw new Error(`Blockfrost API error: ${response.status}`);
      }

      const data = await response.json();

      // Get current slot
      const blockResponse = await fetch(`${baseUrl}/blocks/latest`, {
        headers: {
          'project_id': blockfrostKey
        }
      });

      const blockData = await blockResponse.json();
      // Calculate proper current slot if API response fails
      let currentSlot = blockData.slot;
      if (!currentSlot) {
        // Shelley era started at 1596059091 (July 29, 2020 21:44:51 UTC)
        // 1 slot = 1 second since Shelley era
        const shelleyStart = 1596059091;
        const currentTime = Math.floor(Date.now() / 1000);
        currentSlot = Math.max(0, currentTime - shelleyStart);
        console.log(`🕒 Server calculated current slot: ${currentSlot} (API slot was: ${blockData.slot})`);
      }

      // Transform to our format
      const protocolParams = {
        minFeeA: parseInt(data.min_fee_a || '44'),
        minFeeB: parseInt(data.min_fee_b || '155381'),
        maxTxSize: parseInt(data.max_tx_size || '16384'),
        utxoCostPerWord: parseInt(data.utxo_cost_per_word || '4310'), // Deprecated
        minUtxo: data.min_utxo || '1000000',
        poolDeposit: data.pool_deposit || '500000000',
        keyDeposit: data.key_deposit || '2000000',
        coinsPerUtxoByte: data.coins_per_utxo_size || '4310',
        currentSlot
      };

      // Cache for 5 minutes
      await CacheService.set(cacheKey, protocolParams, 300);

      return {
        ...protocolParams,
        cached: false,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Failed to get protocol parameters:', error);
      
      // Return hardcoded defaults if API fails
      const defaults = {
        minFeeA: 44,
        minFeeB: 155381,
        maxTxSize: 16384,
        utxoCostPerWord: 4310,
        minUtxo: '1000000',
        poolDeposit: '500000000',
        keyDeposit: '2000000', 
        coinsPerUtxoByte: '4310',
        currentSlot: Math.max(0, Math.floor(Date.now() / 1000) - 1596059091), // Shelley era start
        cached: false,
        timestamp: new Date().toISOString(),
        fallback: true
      };

      fastify.log.warn('Using fallback protocol parameters');
      return defaults;
    }
  });

  // Get current network info
  fastify.get('/network-info', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            network: { type: 'string' },
            networkId: { type: 'number' },
            currentSlot: { type: 'number' },
            currentEpoch: { type: 'number' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const network = process.env.CARDANO_NETWORK || 'mainnet';
      const networkId = network === 'mainnet' ? 1 : 0;

      // Try to get current network info from Blockfrost
      let currentSlot = Math.floor(Date.now() / 1000);
      let currentEpoch = 0;

      try {
        const blockfrostKey = process.env.BLOCKFROST_API_KEY;
        if (blockfrostKey) {
          const baseUrl = network === 'mainnet' 
            ? 'https://cardano-mainnet.blockfrost.io/api/v0'
            : 'https://cardano-preprod.blockfrost.io/api/v0';

          const response = await fetch(`${baseUrl}/blocks/latest`, {
            headers: {
              'project_id': blockfrostKey
            }
          });

          if (response.ok) {
            const data = await response.json();
            currentSlot = data.slot || currentSlot;
            currentEpoch = data.epoch || currentEpoch;
          }
        }
      } catch (error) {
        fastify.log.warn('Failed to get latest block info:', error.message);
      }

      return {
        network,
        networkId,
        currentSlot,
        currentEpoch,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Failed to get network info:', error);
      return reply.code(500).send({
        error: 'Failed to get network info'
      });
    }
  });

  // Handle signed transaction storage (admin-side tracking)
  fastify.post('/presigned', {
    schema: {
      body: {
        type: 'object',
        required: ['requestId', 'signedTx'],
        properties: {
          requestId: { type: 'string' },
          signedTx: { type: 'string' },
          metadata: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            requestId: { type: 'string' },
            timestamp: { type: 'string' }
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
      const { requestId, signedTx, metadata } = request.body;

      if (!requestId || !signedTx) {
        return reply.code(400).send({
          error: 'requestId and signedTx are required'
        });
      }

      // Store signed transaction for admin tracking
      const signedTxData = {
        requestId,
        signedTx,
        metadata: metadata || {},
        status: 'signed',
        signedAt: new Date().toISOString(),
        txHash: null // Will be populated when admin submits
      };

      // Store in cache (in production this would be in database)
      const cacheKey = `signed-tx:${requestId}`;
      await CacheService.set(cacheKey, signedTxData, 86400); // 24 hours

      // Update request status to signed
      fastify.log.info(`🔥 Processing signed transaction for request: ${requestId}`);
      
      const requestCacheKey = `request:${requestId}`;
      const existingRequest = await CacheService.get(requestCacheKey);
      
      fastify.log.info(`🔥 Existing request found: ${!!existingRequest}`);
      
      if (existingRequest) {
        const updatedRequest = {
          ...existingRequest,
          status: 'SIGNED',
          signedAt: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await CacheService.set(requestCacheKey, updatedRequest, 86400);
        
        // Update requests list as well
        requestsList.set(requestId, updatedRequest);
        
        fastify.log.info(`🔥 Request status updated to SIGNED for: ${requestId}`);
        
        // Send Socket.IO update to notify admin in real-time
        if (fastify.io) {
          const statusUpdate = {
            type: 'status_update',
            request_id: requestId,
            status: 'SIGNED',
            timestamp: new Date().toISOString(),
            data: updatedRequest
          };
          
          // ログでデバッグ
          fastify.log.info(`🚀 Socket.IO available - sending status update for request ${requestId}: SIGNED`);
          fastify.log.info(`🚀 Connected clients count: ${fastify.io.engine.clientsCount}`);
          
          // Send to all admin clients (using existing event name)
          const adminRoomSize = fastify.io.sockets.adapter.rooms.get('admin')?.size || 0;
          fastify.log.info(`🚀 Admin room size: ${adminRoomSize}`);
          
          fastify.io.to('admin').emit('request_updated', statusUpdate);
          
          // Send to specific request subscribers  
          fastify.io.to(`request-${requestId}`).emit('request_updated', statusUpdate);
          
          // Also send to all connected clients (debugging)
          fastify.io.emit('request_updated', statusUpdate);
          
          fastify.log.info(`✅ Status update sent to all channels`);
        } else {
          fastify.log.error('❌ fastify.io is not available');
        }
      } else {
        fastify.log.error(`❌ No cached request found for: ${requestId}`);
      }

      fastify.log.info(`Transaction signed for request ${requestId}`);

      return {
        success: true,
        message: '署名が完了しました。管理者が送信を行います。',
        requestId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Failed to store signed transaction:', error);
      return reply.code(500).send({
        error: 'Failed to store signed transaction'
      });
    }
  });

  // Get signed transaction (admin-side access)
  fastify.get('/presigned/:requestId', {
    schema: {
      params: {
        type: 'object',
        required: ['requestId'], 
        properties: {
          requestId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            found: { type: 'boolean' },
            data: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { requestId } = request.params;
      const cacheKey = `signed-tx:${requestId}`;
      const signedTxData = await CacheService.get(cacheKey);

      if (!signedTxData) {
        return {
          found: false,
          data: null
        };
      }

      return {
        found: true,
        data: signedTxData
      };

    } catch (error) {
      fastify.log.error('Failed to get signed transaction:', error);
      return reply.code(500).send({
        error: 'Failed to get signed transaction'
      });
    }
  });

  // Get all requests (admin-side access)
  fastify.get('/requests', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            requests: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get all cached requests from the requestsList
      const requests = Array.from(requestsList.values())
        .filter(req => {
          // Filter out expired requests
          if (req.ttl_absolute && new Date(req.ttl_absolute) < new Date()) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      return {
        requests
      };

    } catch (error) {
      fastify.log.error('Failed to get requests:', error);
      return reply.code(500).send({
        error: 'Failed to get requests'
      });
    }
  });

  // Get specific request by ID (user-side access)
  fastify.get('/requests/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            request: { 
              type: 'object',
              additionalProperties: true  // 🔧 この行を追加
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            statusCode: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      fastify.log.info(`Looking for request: ${id}`);
      
      // First check in requestsList
      let requestData = requestsList.get(id);
      
      // 🚨 DEBUG: 詳細なデバッグ情報
      console.log('🚨 DEBUG requestData:', JSON.stringify(requestData, null, 2));
      console.log('🚨 DEBUG requestsList size:', requestsList.size);
      console.log('🚨 DEBUG requestsList keys:', Array.from(requestsList.keys()));
      
      fastify.log.info(`🔍 requestsList check for ${id}:`, {
        found: !!requestData,
        requestsListSize: requestsList.size,
        requestsListKeys: Array.from(requestsList.keys())
      });
      
      if (!requestData) {
        // Check in cache
        const cacheKey = `request:${id}`;
        requestData = await CacheService.get(cacheKey);
        fastify.log.info(`🔍 Cache check for ${id}:`, {
          cacheKey,
          found: !!requestData,
          cacheSize: cache.size
        });
      }
      
      if (!requestData) {
        fastify.log.warn(`Request not found: ${id}`);
        return reply.code(404).send({
          error: 'Request not found',
          statusCode: 404
        });
      }
      
      fastify.log.info(`Found request: ${id}, status: ${requestData.status}`);
      
      // デバッグ: レスポンスデータの詳細ログ
      // 🚨 DEBUG: レスポンス前の最終チェック
      console.log('🚨 FINAL DEBUG before response:', {
        id: requestData?.id,
        amount_mode: requestData?.amount_mode,
        amount_or_rule_json: requestData?.amount_or_rule_json,
        allKeys: requestData ? Object.keys(requestData) : 'NO KEYS',
        fullData: JSON.stringify(requestData, null, 2)
      });
      
      fastify.log.info(`🔍 API レスポンスデバッグ:`, {
        id: requestData.id,
        amount_mode: requestData.amount_mode,
        amount_or_rule_json: requestData.amount_or_rule_json,
        hasAmountMode: 'amount_mode' in requestData,
        hasAmountOrRule: 'amount_or_rule_json' in requestData,
        allKeys: Object.keys(requestData)
      });
      
      // 🚨 最終レスポンスのデバッグ
      const response = { request: requestData };
      console.log('🚨 ACTUAL RESPONSE TO BE SENT:', JSON.stringify(response, null, 2));
      
      return response;
      
    } catch (error) {
      fastify.log.error('Failed to get request by ID:', error);
      return reply.code(500).send({
        error: 'Failed to get request',
        statusCode: 500
      });
    }
  });

  // Archive request API
  fastify.patch('/requests/:id/archive', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          archived: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            request: { type: 'object' }
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
      const { archived = true } = request.body || {};
      
      // Find request in storage
      let existingRequest = requestsList.get(id);
      if (!existingRequest) {
        // Also check cache
        const cacheKey = `request:${id}`;
        existingRequest = await CacheService.get(cacheKey);
      }
      
      if (!existingRequest) {
        return reply.code(404).send({
          error: 'リクエストが見つかりません'
        });
      }

      // Update archived status
      const updatedRequest = {
        ...existingRequest,
        archived: archived,
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      // Update both storages
      requestsList.set(id, updatedRequest);
      const cacheKey = `request:${id}`;
      await CacheService.set(cacheKey, updatedRequest, 86400); // 24 hours
      
      fastify.log.info(`Request ${archived ? 'archived' : 'unarchived'}: ${id}`);
      
      // Broadcast update to admin clients
      if (fastify.io) {
        fastify.io.to('admin').emit('request_archived', {
          request_id: id,
          archived: archived,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        message: archived ? 'リクエストをアーカイブしました' : 'アーカイブを解除しました',
        request: updatedRequest
      };
      
    } catch (error) {
      fastify.log.error('Failed to archive request:', error);
      return reply.code(500).send({
        error: 'アーカイブ処理に失敗しました'
      });
    }
  });

  // Delete request endpoint
  fastify.delete('/requests/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            request_id: { type: 'string' }
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
      
      // Find request in storage
      let existingRequest = requestsList.get(id);
      if (!existingRequest) {
        // Also check cache
        const cacheKey = `request:${id}`;
        existingRequest = await CacheService.get(cacheKey);
      }
      
      if (!existingRequest) {
        return reply.code(404).send({
          error: 'リクエストが見つかりません'
        });
      }

      // Delete from both storages
      requestsList.delete(id);
      // Note: Cache will expire naturally, but we could also manually delete it
      
      fastify.log.info(`Request deleted: ${id}`);
      
      // Broadcast update to admin clients
      if (fastify.io) {
        fastify.io.to('admin').emit('request_deleted', {
          request_id: id,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        message: 'リクエストを削除しました',
        request_id: id
      };
      
    } catch (error) {
      fastify.log.error('Failed to delete request:', error);
      return reply.code(500).send({
        error: 'リクエスト削除に失敗しました',
        details: error.message
      });
    }
  });

  // Create new request (admin-side)
  fastify.post('/requests', {
    schema: {
      body: {
        type: 'object',
        required: ['currency', 'amount_mode', 'amount_or_rule', 'recipient'],
        properties: {
          currency: { type: 'string' },
          amount_mode: { type: 'string' },
          amount_or_rule: { type: 'object' },
          recipient: { type: 'string' },
          ttl_minutes: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            requestId: { type: 'string' },
            signUrl: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { currency, amount_mode, amount_or_rule, recipient, ttl_minutes = 10 } = request.body;

      // Generate request ID
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      // Calculate TTL
      const ttlSlot = Math.floor(Date.now() / 1000) + (ttl_minutes * 60);
      const ttlAbsolute = new Date(Date.now() + (ttl_minutes * 60 * 1000)).toISOString();

      // Create request object
      const otcRequest = {
        id: requestId,
        currency,
        amount_mode,
        amount_or_rule_json: amount_or_rule,
        recipient,
        status: 'REQUESTED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ttl_slot: ttlSlot,
        ttl_absolute: ttlAbsolute
      };

      // Store in cache
      const cacheKey = `request:${requestId}`;
      await CacheService.set(cacheKey, otcRequest, ttl_minutes * 60);
      
      // Add to requests list for enumeration
      requestsList.set(requestId, otcRequest);

      // Generate signing URL
      const signUrl = `http://localhost:4000/sign/${requestId}`;

      fastify.log.info(`Created request ${requestId}`);

      return {
        requestId,
        signUrl
      };

    } catch (error) {
      fastify.log.error('Failed to create request:', error);
      return reply.code(500).send({
        error: 'Failed to create request'
      });
    }
  });
}