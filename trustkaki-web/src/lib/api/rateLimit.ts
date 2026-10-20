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
  if (!buckets.has(bucketKey) && buckets.size >= 10_000) {
    let earliestReset = Infinity;
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
      else earliestReset = Math.min(earliestReset, value.resetAt);
    }
    // Do not evict active limits: that would let new identities reset the cap.
    if (buckets.size >= 10_000) return {
      allowed: false, remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((earliestReset - now) / 1000)),
    };
  }
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
