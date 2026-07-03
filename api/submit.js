const { Redis } = require('@upstash/redis');
const { v4: uuidv4 } = require('uuid');
const config = require('../data/config.json');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function getKyivTime() {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: config.timezone || 'Europe/Kyiv' }));
  const dateStr = kyiv.getFullYear() + '-' + String(kyiv.getMonth() + 1).padStart(2, '0') + '-' + String(kyiv.getDate()).padStart(2, '0');
  const minutes = kyiv.getHours() * 60 + kyiv.getMinutes();
  return { dateStr, minutes };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { answers } = req.body || {};
  if (!Array.isArray(answers)) return res.status(400).json({ result: 'error' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const { dateStr, minutes } = getKyivTime();
  const openMinutes = (config.openHour || 9) * 60;
  if (minutes < openMinutes) return res.json({ result: 'not_yet' });

  const blockKey = `block:${dateStr}:${ip}`;
  const blockTTL = await redis.ttl(blockKey);
  if (blockTTL > 0) return res.json({ result: 'blocked', remainingSeconds: blockTTL });

  const dayConfig = config.days.find(d => d.date === dateStr);
  if (!dayConfig) return res.json({ result: 'no_quiz' });

  const winnersKey = `winners:${dateStr}`;
  const winners = parseInt(await redis.get(winnersKey) || '0');
  if (winners >= dayConfig.maxWinners) return res.json({ result: 'finished' });

  if (answers.length !== dayConfig.questions.length) return res.json({ result: 'error' });

  const allCorrect = dayConfig.questions.every((q, i) => answers[i] === q.answer);
  if (!allCorrect) {
    await redis.setex(blockKey, 600, '1');
    return res.json({ result: 'wrong' });
  }

  const token = uuidv4();
  await redis.setex(`token:${dateStr}:${token}`, 300, ip);
  return res.json({ result: 'correct', token });
};
