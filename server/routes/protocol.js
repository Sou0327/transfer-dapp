/**
 * Protocol Parameters API Routes
 */
import { CacheService } from '../../src/lib/database.js';

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
      const currentSlot = blockData.slot || 0;

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
        currentSlot: Math.floor(Date.now() / 1000), // Approximate
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
}