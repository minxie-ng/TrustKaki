interface RateLimitOptions {
  key: string;
  route: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${options.route}:${options.key}`;
  const existing = buckets.get(bucketKey);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs };

  if (bucket.count >= options.limit) {
    buckets.set(bucketKey, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  buckets.set(bucketKey, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimits() {
  buckets.clear();
}
