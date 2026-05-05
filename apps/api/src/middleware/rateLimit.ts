import type { FastifyRequest, FastifyReply } from 'fastify';
import { getParams } from '../config/params.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

export async function rateLimitMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = req.sessionId;
  if (!sessionId) return;

  const params = getParams();
  const limit = params.rate_limit_per_minute;
  const refillRate = limit / 60;
  const now = Date.now();

  let bucket = buckets.get(sessionId);
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(sessionId, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
    reply
      .code(429)
      .header('Retry-After', String(retryAfter))
      .send({ error: 'rate_limited', retryAfter });
    return;
  }

  bucket.tokens -= 1;
}
