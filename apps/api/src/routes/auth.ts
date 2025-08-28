import { FastifyPluginAsync } from 'fastify';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'User login',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    handler: async (request) => {
      const { email, password } = request.body as { email: string; password: string };
      
      // TODO: Implement actual authentication logic
      if (email === 'demo@ceerion.com' && password === 'demo') {
        return {
          token: 'demo-jwt-token',
          user: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'demo@ceerion.com',
            name: 'Demo User',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      throw fastify.httpErrors.unauthorized('Invalid credentials');
    },
  });
};
