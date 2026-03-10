/**
 * POST /api/ai-explain
 * Proxies Claude API — keeps Anthropic key server-side, never exposed in extension
 * Body: { errors: Array, warnings: Array, transactionSets: Array, licenseKey: string }
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { errors, warnings, transactionSets, licenseKey } = req.body || {};

  // Gate to Professional and Enterprise only
  const tier = resolveTier(licenseKey);
  if (tier === 'free' || tier === 'starter') {
    return res.status(403).json({ error: 'AI explanations require Professional or Enterprise tier.' });
  }

  if (!errors || errors.length === 0) {
    return res.status(200).json({ explanation: 'No errors found — your EDI file passed CATAIR validation.' });
  }

  const txTypes = (transactionSets || []).map(t => `${t.id} (${t.name})`).join(', ') || 'Unknown';
  const errorSummary = errors.map(e => `Line ${e.line} [${e.segment}] ${e.code}: ${e.message}`).join('\n');
  const warnSummary  = warnings?.length
    ? '\n\nWARNINGS:\n' + warnings.map(w => `Line ${w.line} [${w.segment}] ${w.code}: ${w.message}`).join('\n')
    : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a CBP customs broker expert specializing in EDI X12 and CATAIR compliance.
Explain validation errors clearly for customs brokers — what each error means for CBP ACE processing and the specific steps to fix it.
Write in plain paragraphs. No markdown, no bullet points, no headers. Be concise — 2-3 sentences per error group.
Always end with a one-sentence overall assessment of CBP acceptance risk.`,
        messages: [{
          role: 'user',
          content: `Transaction sets: ${txTypes}

ERRORS:
${errorSummary}${warnSummary}

Explain what these mean for CBP processing and how to fix them.`
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', data);
      return res.status(502).json({ error: 'AI service unavailable', detail: data.error?.message });
    }

    const explanation = data.content?.find(b => b.type === 'text')?.text || 'Analysis unavailable.';
    return res.status(200).json({ success: true, explanation, tier });

  } catch (err) {
    console.error('ai-explain error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
};

function resolveTier(licenseKey) {
  if (!licenseKey) return 'free';
  if (licenseKey.startsWith('ent_')) return 'enterprise';
  if (licenseKey.startsWith('pro_')) return 'professional';
  if (licenseKey.startsWith('str_')) return 'starter';
  return 'free';
}
