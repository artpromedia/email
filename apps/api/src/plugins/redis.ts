import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { redis } from '../db/redis';

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('redis', redis);
  
  fastify.addHook('onClose', async () => {
    redis.disconnect();
  });
};

export default fp(redisPlugin, {
  name: 'redis-plugin',
});
