/**
 * Rate API Routes for rate_based requests
 */
import { CacheService } from '../../src/lib/database.js';

export async function rateRoutes(fastify, options) {
  // Rate sources configuration
  const RATE_SOURCES = {
    coingecko: {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=jpy',
      parser: (data) => data.cardano?.jpy
    },
    coinbase: {
      name: 'Coinbase',
      url: 'https://api.coinbase.com/v2/exchange-rates?currency=ADA',
      parser: (data) => parseFloat(data.data?.rates?.JPY)
    },
    binance: {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=ADAJPY',
      parser: (data) => parseFloat(data.price)
    }
  };

  // Get ADA/JPY rate
  fastify.get('/rate', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          source: { 
            type: 'string', 
            enum: ['coingecko', 'coinbase', 'binance'],
            default: 'coingecko'
          },
          force: { type: 'boolean', default: false }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            rate: { type: 'number' },
            timestamp: { type: 'string' },
            ttl: { type: 'number' },
            cached: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
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
      const { source = 'coingecko', force = false } = request.query;

      // Validate source
      if (!RATE_SOURCES[source]) {
        return reply.code(400).send({
          error: `Invalid rate source: ${source}`
        });
      }

      const cacheKey = `rate-${source}`;
      const cacheTTL = 60; // 1 minute cache

      // Check cache first (unless forced)
      if (!force) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          return {
            ...cached,
            cached: true
          };
        }
      }

      // Fetch rate from source
      const sourceConfig = RATE_SOURCES[source];
      
      fastify.log.info(`Fetching rate from ${sourceConfig.name}...`);
      
      const response = await fetch(sourceConfig.url, {
        headers: {
          'User-Agent': 'OTC-DApp/1.0',
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`${sourceConfig.name} API error: ${response.status}`);
      }

      const data = await response.json();
      const rate = sourceConfig.parser(data);

      if (!rate || isNaN(rate) || rate <= 0) {
        throw new Error(`Invalid rate received from ${sourceConfig.name}: ${rate}`);
      }

      const rateData = {
        source: sourceConfig.name,
        rate: parseFloat(rate.toFixed(4)), // Round to 4 decimal places
        timestamp: new Date().toISOString(),
        ttl: cacheTTL,
        cached: false
      };

      // Cache the result
      await CacheService.set(cacheKey, rateData, cacheTTL);

      fastify.log.info(`Rate fetched: ${rate} JPY/ADA from ${sourceConfig.name}`);

      return rateData;

    } catch (error) {
      fastify.log.error(`Rate fetch failed:`, error);

      // Try to return cached data as fallback
      try {
        const cacheKey = `rate-${request.query.source || 'coingecko'}`;
        const fallback = await CacheService.get(cacheKey);
        
        if (fallback) {
          fastify.log.warn('Using cached rate as fallback');
          return {
            ...fallback,
            cached: true,
            fallback: true
          };
        }
      } catch (cacheError) {
        fastify.log.error('Cache fallback failed:', cacheError);
      }

      return reply.code(500).send({
        error: error.message || 'Failed to fetch rate'
      });
    }
  });

  // Get multiple rates for comparison
  fastify.get('/rates/all', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          force: { type: 'boolean', default: false }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            rates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  rate: { type: 'number' },
                  timestamp: { type: 'string' },
                  cached: { type: 'boolean' },
                  error: { type: 'string' }
                }
              }
            },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { force = false } = request.query;
    const rates = [];

    // Fetch from all sources concurrently
    const promises = Object.keys(RATE_SOURCES).map(async (source) => {
      try {
        const cacheKey = `rate-${source}`;
        
        // Check cache first
        if (!force) {
          const cached = await CacheService.get(cacheKey);
          if (cached) {
            return {
              ...cached,
              cached: true
            };
          }
        }

        // Fetch from API
        const sourceConfig = RATE_SOURCES[source];
        const response = await fetch(sourceConfig.url, {
          headers: {
            'User-Agent': 'OTC-DApp/1.0',
            'Accept': 'application/json'
          },
          timeout: 5000 // Shorter timeout for concurrent requests
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const rate = sourceConfig.parser(data);

        if (!rate || isNaN(rate) || rate <= 0) {
          throw new Error(`Invalid rate: ${rate}`);
        }

        const rateData = {
          source: sourceConfig.name,
          rate: parseFloat(rate.toFixed(4)),
          timestamp: new Date().toISOString(),
          cached: false
        };

        // Cache the result
        await CacheService.set(cacheKey, rateData, 60);

        return rateData;

      } catch (error) {
        fastify.log.warn(`Failed to fetch rate from ${source}:`, error.message);
        
        // Try cache as fallback
        try {
          const cacheKey = `rate-${source}`;
          const fallback = await CacheService.get(cacheKey);
          if (fallback) {
            return {
              ...fallback,
              cached: true,
              fallback: true
            };
          }
        } catch (cacheError) {
          // Ignore cache errors
        }

        return {
          source: RATE_SOURCES[source].name,
          rate: null,
          timestamp: new Date().toISOString(),
          cached: false,
          error: error.message
        };
      }
    });

    const results = await Promise.all(promises);
    
    return {
      rates: results,
      timestamp: new Date().toISOString()
    };
  });

  // Calculate ADA amount from JPY using rate
  fastify.post('/calculate-ada', {
    schema: {
      body: {
        type: 'object',
        required: ['jpy_amount'],
        properties: {
          jpy_amount: { type: 'number', minimum: 1 },
          source: { 
            type: 'string', 
            enum: ['coingecko', 'coinbase', 'binance'],
            default: 'coingecko'
          },
          slippage_bps: { type: 'number', minimum: 0, maximum: 1000, default: 100 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jpy_amount: { type: 'number' },
            ada_amount: { type: 'number' },
            ada_amount_lovelace: { type: 'string' },
            rate: { type: 'number' },
            source: { type: 'string' },
            slippage_bps: { type: 'number' },
            min_ada: { type: 'number' },
            max_ada: { type: 'number' },
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
      const { jpy_amount, source = 'coingecko', slippage_bps = 100 } = request.body;

      // Get current rate
      const rateResponse = await fastify.inject({
        method: 'GET',
        url: `/api/ada/rate?source=${source}`
      });

      if (rateResponse.statusCode !== 200) {
        throw new Error('Failed to get current rate');
      }

      const rateData = JSON.parse(rateResponse.body);
      const rate = rateData.rate;

      // Calculate ADA amount
      const adaAmount = jpy_amount / rate;
      const adaAmountLovelace = Math.floor(adaAmount * 1_000_000).toString();

      // Calculate slippage range
      const slippageMultiplier = slippage_bps / 10000; // Convert bps to decimal
      const minAda = adaAmount * (1 - slippageMultiplier);
      const maxAda = adaAmount * (1 + slippageMultiplier);

      return {
        jpy_amount,
        ada_amount: parseFloat(adaAmount.toFixed(6)),
        ada_amount_lovelace: adaAmountLovelace,
        rate,
        source: rateData.source,
        slippage_bps,
        min_ada: parseFloat(minAda.toFixed(6)),
        max_ada: parseFloat(maxAda.toFixed(6)),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('ADA calculation failed:', error);
      return reply.code(400).send({
        error: error.message || 'Failed to calculate ADA amount'
      });
    }
  });
}