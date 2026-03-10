/**
 * POST /api/verify-license
 * Verifies a license key and returns the user's tier
 * Body: { licenseKey: string }
 *
 * v1.0 — key-prefix based (fast to ship)
 * v1.1 — swap resolveTier() for a real Stripe customer lookup
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { licenseKey } = req.body || {};

  if (!licenseKey) {
    return res.status(200).json({ tier: 'free', valid: false, message: 'No license key provided' });
  }

  try {
    const { tier, valid } = await resolveTier(licenseKey);
    return res.status(200).json({ tier, valid, licenseKey });
  } catch (err) {
    console.error('verify-license error:', err);
    return res.status(500).json({ error: 'Verification failed', detail: err.message });
  }
};

/**
 * Tier resolution
 *
 * v1.0: Key prefix convention
 *   pro_xxxxxxxx   → professional
 *   ent_xxxxxxxx   → enterprise
 *   str_xxxxxxxx   → starter
 *
 * v1.1: Uncomment the Stripe block below and remove the prefix logic
 */
async function resolveTier(licenseKey) {

  // ── v1.0: Prefix-based (ship now) ──────────────────────────────────────────
  if (licenseKey.startsWith('ent_')) return { tier: 'enterprise',    valid: true };
  if (licenseKey.startsWith('pro_')) return { tier: 'professional',  valid: true };
  if (licenseKey.startsWith('str_')) return { tier: 'starter',       valid: true };

  // ── v1.1: Stripe customer lookup (uncomment when ready) ────────────────────
  //
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  //
  // // licenseKey = Stripe customer ID (store this in chrome.storage after checkout)
  // const customer = await stripe.customers.retrieve(licenseKey, {
  //   expand: ['subscriptions']
  // });
  //
  // const sub = customer.subscriptions?.data?.[0];
  // if (!sub || sub.status !== 'active') return { tier: 'free', valid: false };
  //
  // const priceId = sub.items.data[0]?.price?.id;
  // const tierMap = {
  //   [process.env.STRIPE_PRICE_STARTER]:      'starter',
  //   [process.env.STRIPE_PRICE_PROFESSIONAL]: 'professional',
  //   [process.env.STRIPE_PRICE_ENTERPRISE]:   'enterprise',
  // };
  //
  // const tier = tierMap[priceId] || 'free';
  // return { tier, valid: tier !== 'free' };

  return { tier: 'free', valid: false };
}
