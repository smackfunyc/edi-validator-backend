/**
 * POST /api/validate
 * Full CATAIR validation for paid tiers
 * Body: { ediText: string, licenseKey: string }
 */

const VALID_TRANSACTION_SETS = {
  '309': 'Customs Manifest',
  '315': 'Status Details (Ocean)',
  '322': 'Terminal Operations Activity',
  '350': 'Customs Status Information',
  '352': 'U.S. CBP Information',
  '353': 'CBP Events Advisory',
  '354': 'CBP Instructions',
  '355': 'CBP Summary',
  '356': 'CBP Automated Manifest',
  '998': 'Set Cancellation',
};

const ERROR_CODES = {
  'E001': 'Missing mandatory ISA segment',
  'E002': 'ISA element count mismatch — expected 16 elements',
  'E003': 'Invalid interchange date format — expected YYMMDD',
  'E004': 'Invalid interchange time format — expected HHMM',
  'E005': 'Unrecognized transaction set ID — not in CBP CATAIR',
  'E006': 'Missing mandatory ST segment',
  'E007': 'Missing mandatory SE segment',
  'E008': 'SE element count does not match actual segment count',
  'E009': 'GS/GE control numbers do not match',
  'E010': 'ISA/IEA control numbers do not match',
  'E011': 'Invalid qualifier code for this element',
  'E013': 'Mandatory element is empty',
  'E015': 'Invalid entry type code in B3A02',
  'E016': 'Duplicate ISA13 control number detected',
  'W004': 'Usage indicator is T (Test) — will not process in production ACE',
};

const VALID_ENTRY_TYPES = ['01','02','03','06','07','11','12','21','22','23','26','31','32','33','34','36','38','51','52','61','62'];
const VALID_MANIFEST_TYPES = ['A','I','S'];

function parseEDI(rawText) {
  const lines = rawText.trim().split(/\r?\n/).filter(l => l.trim());
  return lines.map((line, i) => {
    const delimiter = line.startsWith('ISA') ? line[3] : '*';
    const parts = line.split(delimiter);
    return { index: i + 1, raw: line, id: parts[0], elements: parts.slice(1), delimiter };
  });
}

function validateEDI(segments) {
  const results = {
    summary: { totalSegments: segments.length, transactionSets: [], envelopeValid: false, overallStatus: 'UNKNOWN' },
    errors: [],
    warnings: [],
    rows: [],
  };

  let isaFound = false, gsFound = false, stFound = false;
  let isaControlNum = null, gsControlNum = null;
  let stSegmentCount = 0;
  let currentTxSet = null;
  const seenControlNumbers = new Set();

  for (const seg of segments) {
    const row = {
      lineNum: seg.index,
      segmentId: seg.id,
      elements: seg.elements,
      errors: [],
      warnings: [],
      status: 'OK',
      catairRef: null,
      description: getSegmentDescription(seg.id),
    };

    switch (seg.id) {
      case 'ISA':
        isaFound = true;
        if (seg.elements.length < 16) row.errors.push({ code: 'E002', message: ERROR_CODES['E002'] });
        isaControlNum = seg.elements[12];
        if (seenControlNumbers.has(isaControlNum)) row.errors.push({ code: 'E016', message: ERROR_CODES['E016'] });
        seenControlNumbers.add(isaControlNum);
        if (seg.elements[14] === 'T') row.warnings.push({ code: 'W004', message: ERROR_CODES['W004'] });
        if (seg.elements[8] && !/^\d{6}$/.test(seg.elements[8])) row.errors.push({ code: 'E003', message: ERROR_CODES['E003'] });
        row.catairRef = 'CATAIR §2.1.1 ISA Envelope';
        break;

      case 'IEA':
        const ieaCtrl = seg.elements[1];
        if (isaControlNum && ieaCtrl && isaControlNum.trim() !== ieaCtrl.trim())
          row.errors.push({ code: 'E010', message: ERROR_CODES['E010'] });
        row.catairRef = 'CATAIR §2.1.1 IEA Trailer';
        break;

      case 'GS':
        gsFound = true;
        gsControlNum = seg.elements[5];
        row.catairRef = 'CATAIR §2.1.2 GS Functional Group';
        break;

      case 'GE':
        const geCtrl = seg.elements[1];
        if (gsControlNum && geCtrl && gsControlNum.trim() !== geCtrl.trim())
          row.errors.push({ code: 'E009', message: ERROR_CODES['E009'] });
        row.catairRef = 'CATAIR §2.1.2 GE Trailer';
        break;

      case 'ST':
        stFound = true;
        stSegmentCount = 1;
        currentTxSet = seg.elements[0];
        if (!VALID_TRANSACTION_SETS[currentTxSet])
          row.errors.push({ code: 'E005', message: `${ERROR_CODES['E005']} (${currentTxSet})` });
        else
          results.summary.transactionSets.push({ id: currentTxSet, name: VALID_TRANSACTION_SETS[currentTxSet] });
        row.catairRef = `CATAIR TX ${currentTxSet}`;
        break;

      case 'SE':
        const seCount = parseInt(seg.elements[0]);
        if (!isNaN(seCount) && seCount !== stSegmentCount)
          row.errors.push({ code: 'E008', message: `${ERROR_CODES['E008']} (SE01=${seCount}, actual=${stSegmentCount})` });
        currentTxSet = null;
        row.catairRef = 'CATAIR §2.1.3 SE Trailer';
        break;

      case 'B3A':
        if (!seg.elements[0]) row.errors.push({ code: 'E013', message: 'B3A01 (Purpose Code) is mandatory and empty' });
        if (seg.elements[1] && !VALID_ENTRY_TYPES.includes(seg.elements[1]))
          row.errors.push({ code: 'E015', message: `${ERROR_CODES['E015']}: "${seg.elements[1]}"` });
        row.catairRef = 'CATAIR 350 §3.1 B3A';
        break;

      case 'M10':
        if (!seg.elements[0] || seg.elements[0].trim().length < 2)
          row.errors.push({ code: 'E013', message: 'M1001 (SCAC) is mandatory — min 2 chars' });
        if (seg.elements[6] && !VALID_MANIFEST_TYPES.includes(seg.elements[6]))
          row.errors.push({ code: 'E011', message: `M1007 manifest type "${seg.elements[6]}" is invalid` });
        row.catairRef = 'CATAIR 309 §3.1 M10';
        break;

      default:
        stSegmentCount++;
        break;
    }

    if (!['ST','SE'].includes(seg.id)) stSegmentCount++;
    row.status = row.errors.length > 0 ? 'ERROR' : row.warnings.length > 0 ? 'WARNING' : 'OK';
    results.rows.push(row);
    results.errors.push(...row.errors.map(e => ({ ...e, line: seg.index, segment: seg.id })));
    results.warnings.push(...row.warnings.map(w => ({ ...w, line: seg.index, segment: seg.id })));
  }

  if (!isaFound) results.errors.push({ code: 'E001', message: ERROR_CODES['E001'], line: 0, segment: 'ISA' });
  if (!stFound)  results.errors.push({ code: 'E006', message: ERROR_CODES['E006'], line: 0, segment: 'ST' });

  results.summary.envelopeValid = isaFound && gsFound && !results.errors.some(e => ['E001','E002','E009','E010'].includes(e.code));
  results.summary.overallStatus = results.errors.length === 0 ? 'PASS' : results.errors.length <= 2 ? 'WARN' : 'FAIL';

  return results;
}

function getSegmentDescription(segId) {
  const map = {
    'ISA':'Interchange Control Header','IEA':'Interchange Control Trailer',
    'GS':'Functional Group Header','GE':'Functional Group Trailer',
    'ST':'Transaction Set Header','SE':'Transaction Set Trailer',
    'B3A':'Beginning Segment — Customs Status','B4':'Beginning Segment — Ocean Status',
    'M10':'Manifest Identifying Information','N9':'Reference Identification',
    'DTM':'Date/Time Reference','N1':'Name','N3':'Address','N4':'Geographic Location',
  };
  return map[segId] || `Segment ${segId}`;
}

// ─── Vercel Handler ───────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ediText, licenseKey } = req.body || {};

  if (!ediText) return res.status(400).json({ error: 'ediText is required' });

  // Verify license (simple check — replace with Stripe lookup in v1.1)
  const tier = resolveTier(licenseKey);

  try {
    const segments = parseEDI(ediText);
    const results = validateEDI(segments);
    results.summary.tier = tier;
    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: 'Parse failed', detail: err.message });
  }
};

function resolveTier(licenseKey) {
  // In v1.1 — call Stripe API to verify customer and return real tier
  // For now: simple key-based resolution
  if (!licenseKey) return 'free';
  if (licenseKey.startsWith('ent_')) return 'enterprise';
  if (licenseKey.startsWith('pro_')) return 'professional';
  if (licenseKey.startsWith('str_')) return 'starter';
  return 'free';
}
