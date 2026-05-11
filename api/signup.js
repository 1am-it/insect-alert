/**
 * Vercel serverless function — POST /api/signup
 *
 * Accepts an email address and stores it in the Supabase `email_signups` table.
 * Rate-limited per IP (5 signups per hour) to prevent abuse.
 *
 * Last reviewed: 2026-05-11 (1AM-178)
 */

import { getSupabaseAdmin } from './_lib/supabase-admin.js';
import {
  checkRateLimit,
  getClientIp,
  hashIp,
} from './_lib/rate-limit.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

const MAX_EMAIL_LENGTH = 320;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST is supported',
    });
  }

  try {
    const body = await readJsonBody(req);

    if (!body || typeof body.email !== 'string') {
      return res.status(400).json({
        error: 'invalid_body',
        message: 'Request body must be JSON with an "email" field',
      });
    }

    const email = body.email.trim().toLowerCase();

    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'E-mailadres heeft een ongeldige lengte',
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Vul een geldig e-mailadres in',
      });
    }

    // Rate limit by hashed IP — 5 signups per hour
    const clientIp = getClientIp(req);
    const ipHash = hashIp(clientIp);

    const { allowed, retryAfter } = await checkRateLimit({
      key: ipHash,
      bucket: 'signup',
      maxRequests: 5,
      windowSeconds: 3600,
    });

    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Te veel pogingen. Probeer het later opnieuw.',
      });
    }

    // Insert into Supabase. Unique constraint on email means duplicates
    // throw a Postgres 23505 error — we treat that as success ("already
    // signed up" is a fine outcome for the user)
    const supabase = getSupabaseAdmin();
    const userAgent = req.headers['user-agent'] || null;

    const { error } = await supabase.from('email_signups').insert({
      email,
      source: 'web',
      user_agent: userAgent,
      ip_hash: ipHash,
    });

    if (error) {
      // Postgres unique violation = email already exists
      if (error.code === '23505') {
        return res.status(200).json({
          ok: true,
          alreadySignedUp: true,
        });
      }
      throw error;
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[signup] error:', error.message);
    return res.status(500).json({
      error: 'signup_failed',
      message: 'Er ging iets mis bij het aanmelden. Probeer het later opnieuw.',
    });
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
