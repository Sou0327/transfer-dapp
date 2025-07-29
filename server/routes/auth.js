/**
 * Authentication API Routes
 */
import { AuthenticationService } from '../../src/lib/auth.js';

export async function authRoutes(fastify, options) {
  // Login endpoint
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            session: {
              type: 'object',
              properties: {
                adminId: { type: 'string' },
                email: { type: 'string' },
                loginTime: { type: 'string' },
                ipAddress: { type: 'string' },
                userAgent: { type: 'string' }
              }
            },
            token: { type: 'string' },
            expiresAt: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const credentials = {
        ...request.body,
        ipAddress: request.body.ipAddress || request.ip,
        userAgent: request.body.userAgent || request.headers['user-agent']
      };

      const result = await AuthenticationService.authenticateAdmin(credentials);
      
      return {
        session: result.session,
        token: result.token,
        expiresAt: result.expiresAt.toISOString()
      };
    } catch (error) {
      fastify.log.warn('Login failed:', error.message);
      return reply.code(401).send({ 
        error: error.message || 'Authentication failed' 
      });
    }
  });

  // Validate token endpoint
  fastify.get('/validate', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            session: {
              type: 'object',
              properties: {
                adminId: { type: 'string' },
                email: { type: 'string' },
                loginTime: { type: 'string' },
                ipAddress: { type: 'string' },
                userAgent: { type: 'string' }
              }
            },
            valid: { type: 'boolean' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'No token provided' });
      }

      const session = await AuthenticationService.validateSession(token);
      
      return {
        session,
        valid: true
      };
    } catch (error) {
      fastify.log.warn('Token validation failed:', error.message);
      return reply.code(401).send({ 
        error: error.message || 'Invalid token' 
      });
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
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
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token) {
        await AuthenticationService.logout(token);
      }
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      fastify.log.warn('Logout error:', error.message);
      // Always return success for logout
      return {
        success: true,
        message: 'Logged out successfully'
      };
    }
  });

  // Change password endpoint
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 6 },
          newPassword: { type: 'string', minLength: 8 }
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
      const { currentPassword, newPassword } = request.body;
      const adminId = request.user.adminId;

      const success = await AuthenticationService.changePassword(
        adminId,
        currentPassword,
        newPassword
      );

      if (success) {
        return {
          success: true,
          message: 'Password changed successfully'
        };
      } else {
        return reply.code(400).send({
          error: 'Failed to change password'
        });
      }
    } catch (error) {
      fastify.log.warn('Password change failed:', error.message);
      return reply.code(400).send({
        error: error.message || 'Failed to change password'
      });
    }
  });
}