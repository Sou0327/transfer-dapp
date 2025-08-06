/**
 * Monitoring API Routes
 * Handles UTxO monitoring and TTL management
 */
import { utxoMonitorService } from '../../src/lib/utxoMonitor.ts';
import { AuditDAO } from '../../src/lib/database.ts';

export async function monitoringRoutes(fastify, options) {
  
  // Get monitoring status and statistics
  fastify.get('/monitoring/status', {
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
      const stats = utxoMonitorService.getStats();
      
      return {
        service_status: stats.isRunning ? 'running' : 'stopped',
        stats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      fastify.log.error('Failed to get monitoring status:', error);
      return reply.code(500).send({
        error: 'Failed to get monitoring status'
      });
    }
  });

  // Start monitoring service
  fastify.post('/monitoring/start', {
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
      await utxoMonitorService.start();

      // Log audit event
      await AuditDAO.log({
        event_type: 'monitoring_started',
        user_id: request.user?.id || 'unknown',
        resource_type: 'monitoring_service',
        details: {
          started_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info('UTxO monitoring service started by admin');

      return {
        success: true,
        message: 'Monitoring service started successfully'
      };

    } catch (error) {
      fastify.log.error('Failed to start monitoring service:', error);
      return reply.code(500).send({
        error: 'Failed to start monitoring service'
      });
    }
  });

  // Stop monitoring service
  fastify.post('/monitoring/stop', {
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
      utxoMonitorService.stop();

      // Log audit event
      await AuditDAO.log({
        event_type: 'monitoring_stopped',
        user_id: request.user?.id || 'unknown',
        resource_type: 'monitoring_service',
        details: {
          stopped_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info('UTxO monitoring service stopped by admin');

      return {
        success: true,
        message: 'Monitoring service stopped successfully'
      };

    } catch (error) {
      fastify.log.error('Failed to stop monitoring service:', error);
      return reply.code(500).send({
        error: 'Failed to stop monitoring service'
      });
    }
  });

  // Add a specific request to monitoring
  fastify.post('/monitoring/requests/:request_id', {
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

      await utxoMonitorService.addRequest(request_id);

      // Log audit event
      await AuditDAO.log({
        event_type: 'monitoring_request_added',
        user_id: request.user?.id || 'unknown',
        resource_type: 'monitoring',
        resource_id: request_id,
        details: {
          added_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info(`Request ${request_id} added to monitoring`);

      return {
        success: true,
        message: `Request ${request_id} added to monitoring`
      };

    } catch (error) {
      fastify.log.error(`Failed to add request to monitoring:`, error);
      return reply.code(500).send({
        error: 'Failed to add request to monitoring'
      });
    }
  });

  // Remove a specific request from monitoring
  fastify.delete('/monitoring/requests/:request_id', {
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

      utxoMonitorService.removeRequest(request_id);

      // Log audit event
      await AuditDAO.log({
        event_type: 'monitoring_request_removed',
        user_id: request.user?.id || 'unknown',
        resource_type: 'monitoring',
        resource_id: request_id,
        details: {
          removed_by: request.user?.email || 'unknown',
          timestamp: new Date().toISOString()
        },
        ip_address: request.ip
      });

      fastify.log.info(`Request ${request_id} removed from monitoring`);

      return {
        success: true,
        message: `Request ${request_id} removed from monitoring`
      };

    } catch (error) {
      fastify.log.error(`Failed to remove request from monitoring:`, error);
      return reply.code(500).send({
        error: 'Failed to remove request from monitoring'
      });
    }
  });

  // Force check a specific request
  fastify.post('/monitoring/requests/:request_id/check', {
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
            message: { type: 'string' },
            result: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;

      // This would trigger an immediate check for the request
      // For now, we'll just add it to monitoring which will trigger a check
      await utxoMonitorService.addRequest(request_id);

      // Get current stats for this request
      const stats = utxoMonitorService.getStats();
      const requestStats = stats.requests.find(r => r.request_id === request_id);

      return {
        success: true,
        message: `Forced check initiated for request ${request_id}`,
        result: requestStats || null
      };

    } catch (error) {
      fastify.log.error(`Failed to force check request:`, error);
      return reply.code(500).send({
        error: 'Failed to force check request'
      });
    }
  });

  // Get detailed monitoring info for a specific request
  fastify.get('/monitoring/requests/:request_id', {
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
            is_monitored: { type: 'boolean' },
            monitoring_info: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { request_id } = request.params;
      const stats = utxoMonitorService.getStats();
      const requestStats = stats.requests.find(r => r.request_id === request_id);

      return {
        request_id,
        is_monitored: !!requestStats,
        monitoring_info: requestStats || null
      };

    } catch (error) {
      fastify.log.error(`Failed to get request monitoring info:`, error);
      return reply.code(500).send({
        error: 'Failed to get request monitoring info'
      });
    }
  });

  // Get all monitored requests
  fastify.get('/monitoring/requests', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            total_requests: { type: 'integer' },
            service_running: { type: 'boolean' },
            current_slot: { type: 'integer' },
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  request_id: { type: 'string' },
                  ttl_slot: { type: 'integer' },
                  time_remaining: { type: 'integer' },
                  utxo_count: { type: 'integer' },
                  check_count: { type: 'integer' },
                  last_check: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const stats = utxoMonitorService.getStats();

      return {
        total_requests: stats.monitoredRequests,
        service_running: stats.isRunning,
        current_slot: stats.currentSlot,
        requests: stats.requests
      };

    } catch (error) {
      fastify.log.error('Failed to get monitored requests:', error);
      return reply.code(500).send({
        error: 'Failed to get monitored requests'
      });
    }
  });

  // Health check endpoint for monitoring service
  fastify.get('/monitoring/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            healthy: { type: 'boolean' },
            service_running: { type: 'boolean' },
            last_slot_update: { type: 'string' },
            monitored_requests: { type: 'integer' },
            uptime_seconds: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const stats = utxoMonitorService.getStats();
      const lastUpdate = stats.lastSlotUpdate;
      const timeSinceUpdate = Date.now() - lastUpdate.getTime();
      
      // Consider healthy if service is running and slot was updated within last 5 minutes
      const healthy = stats.isRunning && timeSinceUpdate < 5 * 60 * 1000;

      return {
        healthy,
        service_running: stats.isRunning,
        last_slot_update: lastUpdate.toISOString(),
        monitored_requests: stats.monitoredRequests,
        uptime_seconds: timeSinceUpdate / 1000
      };

    } catch (error) {
      fastify.log.error('Monitoring health check failed:', error);
      return {
        healthy: false,
        service_running: false,
        last_slot_update: null,
        monitored_requests: 0,
        uptime_seconds: 0
      };
    }
  });
}