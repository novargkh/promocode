const { Redis } = require('@upstash/redis');
const config = require('../data/config.json');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function getKyivDateStr() {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: config.timezone || 'Europe/Kyiv' }));
  return kyiv.getFullYear() + '-' +
    String(kyiv.getMonth() + 1).padStart(2, '0') + '-' +
    String(kyiv.getDate()).padStart(2, '0');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ result: 'error' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const dateStr = getKyivDateStr();

  const tokenKey = `token:${dateStr}:${token}`;
  const tokenIP = await redis.get(tokenKey);

  if (!tokenIP || tokenIP !== ip) {
    return res.json({ result: 'invalid_token' });
  }

  const dayConfig = config.days.find(d => d.date === dateStr);
  if (!dayConfig) return res.json({ result: 'no_quiz' });

  const winnersKey = `winners:${dateStr}`;
  const newCount = await redis.incr(winnersKey);

  if (newCount > dayConfig.maxWinners) {
    await redis.decr(winnersKey);
    await redis.del(tokenKey);
    return res.json({ result: 'finished' });
  }

  await redis.del(tokenKey);

  const logKey = `log:${dateStr}:${newCount}`;
  await redis.setex(logKey, 604800, JSON.stringify({ ip, time: new Date().toISOString(), code: dayConfig.promoCode }));

  return res.json({ result: 'claimed', promoCode: dayConfig.promoCode });
};
