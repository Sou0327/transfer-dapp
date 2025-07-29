#!/usr/bin/env node

/**
 * Health Check Script for Cardano OTC Trading System
 * Comprehensive health checks for production environment
 */

const http = require('http');
const https = require('https');

// Configuration
const config = {
    host: process.env.HEALTH_CHECK_HOST || 'localhost',
    port: process.env.PORT || 4000,
    path: process.env.HEALTH_CHECK_PATH || '/health',
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
    useHttps: process.env.HEALTH_CHECK_HTTPS === 'true',
    userAgent: 'OTC-HealthCheck/1.0',
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
    retryDelay: parseInt(process.env.HEALTH_CHECK_RETRY_DELAY || '1000')
};

// Health check states
const STATES = {
    HEALTHY: 0,
    UNHEALTHY: 1,
    DEGRADED: 2
};

class HealthChecker {
    constructor() {
        this.startTime = Date.now();
        this.checks = [];
    }

    async runHealthCheck() {
        console.log(`[${new Date().toISOString()}] Starting health check...`);
        
        try {
            // Primary health check - HTTP endpoint
            const endpointHealth = await this.checkHttpEndpoint();
            this.checks.push({ name: 'http_endpoint', status: endpointHealth });

            // Additional checks if endpoint is healthy
            if (endpointHealth === STATES.HEALTHY) {
                // Database connectivity check
                const dbHealth = await this.checkDatabase();
                this.checks.push({ name: 'database', status: dbHealth });

                // Cache connectivity check
                const cacheHealth = await this.checkCache();
                this.checks.push({ name: 'cache', status: cacheHealth });

                // External service checks
                const externalHealth = await this.checkExternalServices();
                this.checks.push({ name: 'external_services', status: externalHealth });
            }

            // Evaluate overall health
            const overallHealth = this.evaluateOverallHealth();
            const duration = Date.now() - this.startTime;

            console.log(`[${new Date().toISOString()}] Health check completed in ${duration}ms`);
            console.log(`Overall status: ${this.getStatusName(overallHealth)}`);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Detailed checks:', JSON.stringify(this.checks, null, 2));
            }

            process.exit(overallHealth);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Health check failed:`, error.message);
            process.exit(STATES.UNHEALTHY);
        }
    }

    async checkHttpEndpoint() {
        const maxRetries = config.retries;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[${new Date().toISOString()}] Checking HTTP endpoint (attempt ${attempt}/${maxRetries})...`);
                
                const result = await this.makeHttpRequest();
                
                if (result.statusCode === 200) {
                    console.log(`[${new Date().toISOString()}] HTTP endpoint is healthy`);
                    return STATES.HEALTHY;
                } else if (result.statusCode >= 500) {
                    throw new Error(`Server error: ${result.statusCode}`);
                } else {
                    console.warn(`[${new Date().toISOString()}] HTTP endpoint returned status ${result.statusCode}`);
                    return STATES.DEGRADED;
                }
            } catch (error) {
                lastError = error;
                console.warn(`[${new Date().toISOString()}] HTTP endpoint check attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    await this.sleep(config.retryDelay);
                }
            }
        }

        console.error(`[${new Date().toISOString()}] HTTP endpoint is unhealthy after ${maxRetries} attempts: ${lastError.message}`);
        return STATES.UNHEALTHY;
    }

    makeHttpRequest() {
        return new Promise((resolve, reject) => {
            const client = config.useHttps ? https : http;
            const options = {
                hostname: config.host,
                port: config.port,
                path: config.path,
                method: 'GET',
                timeout: config.timeout,
                headers: {
                    'User-Agent': config.userAgent,
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            };

            const req = client.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        resolve({
                            statusCode: res.statusCode,
                            data: parsedData
                        });
                    } catch (parseError) {
                        resolve({
                            statusCode: res.statusCode,
                            data: data
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout after ${config.timeout}ms`));
            });

            req.end();
        });
    }

    async checkDatabase() {
        try {
            console.log(`[${new Date().toISOString()}] Checking database connectivity...`);
            
            // Try to make a simple health check request to the main endpoint
            // The main health endpoint should include database checks
            const result = await this.makeHttpRequest();
            
            if (result.data && typeof result.data === 'object') {
                const dbStatus = result.data.database || result.data.db;
                if (dbStatus === 'healthy' || dbStatus === true) {
                    console.log(`[${new Date().toISOString()}] Database is healthy`);
                    return STATES.HEALTHY;
                } else if (dbStatus === 'degraded') {
                    console.warn(`[${new Date().toISOString()}] Database is degraded`);
                    return STATES.DEGRADED;
                } else {
                    console.error(`[${new Date().toISOString()}] Database is unhealthy`);
                    return STATES.UNHEALTHY;
                }
            }
            
            // If no specific database status, assume healthy if main endpoint is up
            return STATES.HEALTHY;
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Database check failed: ${error.message}`);
            return STATES.UNHEALTHY;
        }
    }

    async checkCache() {
        try {
            console.log(`[${new Date().toISOString()}] Checking cache connectivity...`);
            
            // Try to get cache status from main health endpoint
            const result = await this.makeHttpRequest();
            
            if (result.data && typeof result.data === 'object') {
                const cacheStatus = result.data.cache || result.data.redis;
                if (cacheStatus === 'healthy' || cacheStatus === true) {
                    console.log(`[${new Date().toISOString()}] Cache is healthy`);
                    return STATES.HEALTHY;
                } else if (cacheStatus === 'degraded') {
                    console.warn(`[${new Date().toISOString()}] Cache is degraded`);
                    return STATES.DEGRADED;
                } else {
                    console.error(`[${new Date().toISOString()}] Cache is unhealthy`);
                    return STATES.UNHEALTHY;
                }
            }
            
            // If no specific cache status, assume healthy if main endpoint is up
            return STATES.HEALTHY;
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Cache check failed: ${error.message}`);
            return STATES.DEGRADED; // Cache failure shouldn't kill the service
        }
    }

    async checkExternalServices() {
        try {
            console.log(`[${new Date().toISOString()}] Checking external services...`);
            
            // Check external services status from main health endpoint
            const result = await this.makeHttpRequest();
            
            if (result.data && typeof result.data === 'object') {
                const externalStatus = result.data.external || result.data.blockfrost;
                if (externalStatus === 'healthy' || externalStatus === true) {
                    console.log(`[${new Date().toISOString()}] External services are healthy`);
                    return STATES.HEALTHY;
                } else if (externalStatus === 'degraded') {
                    console.warn(`[${new Date().toISOString()}] External services are degraded`);
                    return STATES.DEGRADED;
                } else {
                    console.error(`[${new Date().toISOString()}] External services are unhealthy`);
                    return STATES.DEGRADED; // External service issues shouldn't kill the service
                }
            }
            
            // If no specific external services status, assume degraded to be safe
            return STATES.DEGRADED;
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] External services check failed: ${error.message}`);
            return STATES.DEGRADED;
        }
    }

    evaluateOverallHealth() {
        if (this.checks.length === 0) {
            return STATES.UNHEALTHY;
        }

        // Count different health states
        const healthCounts = this.checks.reduce((counts, check) => {
            counts[check.status] = (counts[check.status] || 0) + 1;
            return counts;
        }, {});

        // If any critical component is unhealthy, overall is unhealthy
        const unhealthyCount = healthCounts[STATES.UNHEALTHY] || 0;
        const degradedCount = healthCounts[STATES.DEGRADED] || 0;
        const healthyCount = healthCounts[STATES.HEALTHY] || 0;

        // Check for critical components
        const httpEndpointCheck = this.checks.find(c => c.name === 'http_endpoint');
        const databaseCheck = this.checks.find(c => c.name === 'database');

        // If main endpoint or database are unhealthy, overall is unhealthy
        if (httpEndpointCheck && httpEndpointCheck.status === STATES.UNHEALTHY) {
            return STATES.UNHEALTHY;
        }
        
        if (databaseCheck && databaseCheck.status === STATES.UNHEALTHY) {
            return STATES.UNHEALTHY;
        }

        // If any component is degraded, overall is degraded
        if (degradedCount > 0) {
            return STATES.DEGRADED;
        }

        // If all components are healthy, overall is healthy
        return STATES.HEALTHY;
    }

    getStatusName(status) {
        switch (status) {
            case STATES.HEALTHY: return 'HEALTHY';
            case STATES.DEGRADED: return 'DEGRADED';
            case STATES.UNHEALTHY: return 'UNHEALTHY';
            default: return 'UNKNOWN';
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Handle process signals
process.on('SIGTERM', () => {
    console.log(`[${new Date().toISOString()}] Received SIGTERM, exiting health check`);
    process.exit(STATES.UNHEALTHY);
});

process.on('SIGINT', () => {
    console.log(`[${new Date().toISOString()}] Received SIGINT, exiting health check`);
    process.exit(STATES.UNHEALTHY);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception in health check:`, error);
    process.exit(STATES.UNHEALTHY);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled rejection in health check:`, reason);
    process.exit(STATES.UNHEALTHY);
});

// Main execution
if (require.main === module) {
    const healthChecker = new HealthChecker();
    healthChecker.runHealthCheck().catch((error) => {
        console.error(`[${new Date().toISOString()}] Health check crashed:`, error);
        process.exit(STATES.UNHEALTHY);
    });
}

module.exports = HealthChecker;