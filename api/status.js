const { Redis } = require('@upstash/redis');
const config = require('../data/config.json');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function getKyivTime() {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: config.timezone || 'Europe/Kyiv' }));
  const dateStr = kyiv.getFullYear() + '-' +
    String(kyiv.getMonth() + 1).padStart(2, '0') + '-' +
    String(kyiv.getDate()).padStart(2, '0');
  const minutes = kyiv.getHours() * 60 + kyiv.getMinutes();
  return { dateStr, minutes };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { dateStr, minutes } = getKyivTime();
  const openMinutes = (config.openHour || 9) * 60;

  const dayConfig = config.days.find(d => d.date === dateStr);
  if (!dayConfig) return res.json({ status: 'no_quiz' });

  if (minutes < openMinutes) {
    return res.json({ status: 'not_yet', openHour: config.openHour || 9, secondsUntilOpen: (openMinutes - minutes) * 60 });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const blockKey = `block:${dateStr}:${ip}`;
  const blockTTL = await redis.ttl(blockKey);
  if (blockTTL > 0) return res.json({ status: 'blocked', remainingSeconds: blockTTL });

  const winnersKey = `winners:${dateStr}`;
  const winners = parseInt(await redis.get(winnersKey) || '0');
  if (winners >= dayConfig.maxWinners) return res.json({ status: 'finished' });

  const questions = dayConfig.questions.map(q => ({ text: q.text, options: q.options }));
  return res.json({ status: 'active', questions });
};
