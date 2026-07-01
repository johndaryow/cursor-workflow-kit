/**
 * Doc-driven Ralph slice registry — reads *-master.md for ON_SUCCESS + per-slice tags.
 * Supplements hardcoded chains in ralph-chain-config.mjs (Workers, S6b, DLM, COVE).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PROJECTS_DIR = resolve(root, 'docs/projects');

/** @typedef {{ autonomy: 'AFK'|'HITL', ceoGate: string, mergePolicy: string, program: string, masterDoc: string, onSuccess: string|null, subLane: string|null }} RegistrySlice */

/** @type {Map<string, RegistrySlice> | null} */
let cachedRegistry = null;

/** @param {string} fileName */
function programFromMasterFile(fileName) {
  if (fileName === 'platform-migration-master.md') return 'PLATFORM';
  if (fileName === 'workflow-master.md') return 'WORKFLOW';
  const base = fileName.replace(/-master\.md$/, '');
  return base.replace(/-/g, '-').toUpperCase().replace(/^CATALOG_MATCH$/, 'CATALOG-MATCH');
}

/** @param {string} masterText */
function programFromDashboard(masterText) {
  const dash = masterText.match(/```text\n([\s\S]*?)```/)?.[1] ?? '';
  const p = dash.match(/^ACTIVE_PROGRAM:\s*(.+)$/m)?.[1]?.trim();
  return p || null;
}

/** @param {string} raw */
export function normalizeOnSuccessTarget(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (/^(none|n\/a|—|-)$/i.test(s)) return null;
  if (/done|complete|terminal|hold|pause/i.test(s) && !/^CM\d|^CDRIVE|^DLM|^W\d|^S6b|^COVE|^RTE/i.test(s)) {
    return null;
  }
  return normalizeDocSliceId(s.split(/[·|]/)[0].trim());
}

/** @param {string} raw */
export function normalizeDocSliceId(raw) {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^CATALOG-MATCH\s+/i, '');
  s = s.replace(/^CDRIVE\s+/i, '');

  const cdrive = s.match(/^CDRIVE-(\d+)$/i);
  if (cdrive) return `CDRIVE-${cdrive[1]}`;

  const cm = s.match(/^CM(\d+)$/i);
  if (cm) return `CM${cm[1]}`;

  const rteF = s.match(/^RTE-F(\d+)$/i);
  if (rteF) return `RTE-F${rteF[1]}`;

  const rte = s.match(/^RTE[-\s]?W?(\d+)$/i);
  if (rte) return `RTE-W${rte[1]}`;

  const dlm = s.match(/^DLM-(\d+)$/i);
  if (dlm) return `DLM-${dlm[1]}`;

  const w = s.match(/^W(\d+[a-z]?)$/i);
  if (w) return `W${w[1]}`;

  const s6bF = s.match(/^S6b-F(\d+)$/i);
  if (s6bF) return `S6b-F${s6bF[1]}`;

  const s6bBatch = s.match(/^S6b[^0-9]{0,12}batch\s*(\d+)$/i);
  if (s6bBatch) return `S6b-batch-${s6bBatch[1]}`;

  const cove = s.match(/^COVE\s+P(\d+)/i) ?? s.match(/^COVE-P(\d+)/i);
  if (cove) return `COVE P${cove[1]}`;

  const workflow = s.match(/^WORKFLOW-P(\d+)$/i);
  if (workflow) return `WORKFLOW-P${workflow[1]}`;

  const rh = s.match(/^RH(\d+)$/i);
  if (rh) return `RH${rh[1]}`;

  const ds = s.match(/^DS(\d+)$/i);
  if (ds) return `DS${ds[1]}`;

  const fm = s.match(/^FM-(\d+)$/i);
  if (fm) return `FM-${fm[1]}`;

  const ab = s.match(/^AB-(\d+)$/i);
  if (ab) return `AB-${ab[1]}`;

  const iwa = s.match(/^IWA-(\d+)$/i);
  if (iwa) return `IWA-${iwa[1]}`;

  return null;
}

/** @param {string} sliceId @param {string} program */
export function subLaneForDocSlice(sliceId, program) {
  if (!sliceId) return null;
  if (sliceId.startsWith('RH')) return 'H-repo-health';
  if (sliceId.startsWith('DS')) return 'I-ds-clean';
  if (sliceId.startsWith('FM-')) return 'J-fm';
  if (sliceId.startsWith('CDRIVE-')) return 'G-cdrive';
  if (sliceId.startsWith('CM')) return 'G-catalog-match';
  if (sliceId.startsWith('RTE-F')) return 'H-rte-f';
  if (sliceId.startsWith('RTE-')) return 'H-rte';
  if (sliceId.startsWith('AB-')) return 'D-ab';
  if (sliceId.startsWith('IWA-')) return 'J-iwa';
  if (program === 'CATALOG-MATCH') return 'G-catalog-match';
  if (program === 'CDRIVE') return 'G-cdrive';
  return `${program.toLowerCase()}-doc`;
}

/**
 * @param {string} blockText
 * @param {string} sliceId
 * @param {string} program
 * @param {string} masterDoc
 */
function parseTagBlock(blockText, sliceId, program, masterDoc) {
  const autonomy = blockText.match(/AUTONOMY:\s*(AFK|HITL)/i)?.[1]?.toUpperCase();
  const ceoGate = blockText.match(/CEO_GATE:\s*(\S+)/i)?.[1] ?? 'none';
  const mergePolicy =
    blockText.match(/MERGE_POLICY:\s*(\S+)/i)?.[1] ?? 'recommend_merge';
  const onSuccessRaw = blockText.match(/ON_SUCCESS:\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  if (!autonomy) return null;

  return {
    autonomy: /** @type {'AFK'|'HITL'} */ (autonomy),
    ceoGate,
    mergePolicy,
    program,
    masterDoc,
    onSuccess: normalizeOnSuccessTarget(onSuccessRaw),
    subLane: subLaneForDocSlice(sliceId, program),
  };
}

/**
 * @param {string} masterText
 * @param {string} masterDoc
 * @param {string} program
 * @param {Map<string, RegistrySlice>} registry
 */
function parseMasterDoc(masterText, masterDoc, program, registry) {
  // §12 ```text blocks under ### SLICE headers
  const sectionRe =
    /###\s+(?:([A-Z][A-Z0-9-]*)\s+)?(AB-\d+|RH\d+|CM\d+|CDRIVE-\d+|DLM-\d+|FM-\d+|RTE-F\d+|RTE-W\d+|IWA-\d+|COVE\s+P\d+|W\d+[a-z]?|S6b-F\d+|S6b-batch-\d+)[^\n]*\n+```text\n([\s\S]*?)```/gi;

  for (const m of masterText.matchAll(sectionRe)) {
    const sliceId = normalizeDocSliceId(m[2]) ?? m[2].trim();
    const meta = parseTagBlock(m[3], sliceId, program, masterDoc);
    if (meta) registry.set(sliceId, meta);
  }

  // CDRIVE phased table: | **6** | CDRIVE-6 | ... | AFK | none | auto_when_green |
  for (const m of masterText.matchAll(
    /\|\s*\*\*\d+\*\*\s*\|\s*(CDRIVE-\d+)\s*\|[^|\n]*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) continue;
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess: null,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  // CATALOG-MATCH slice table: | **CM2** | ... | AFK | auto_when_green |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(CM\d+)\*\*\s*\|[^|\n]*\|\s*(AFK|HITL)(?:\s*\([^)]*\))?\s*\|\s*(\S+)/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) continue;
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[2].toUpperCase() === 'AFK' ? 'none' : 'explicit_ok_in_chat',
      mergePolicy: m[3],
      program,
      masterDoc,
      onSuccess: null,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  // Wire ON_SUCCESS from §12 blocks that weren't in table (second pass for table-only rows)
  for (const m of masterText.matchAll(
    /###\s+(?:CM\d+|CDRIVE-\d+)[^\n]*\n+```text\n([\s\S]*?)```/gi,
  )) {
    const header = m[0].match(/###\s+(?:[^\n]*?\s)?(CM\d+|CDRIVE-\d+)/i)?.[1];
    const sliceId = normalizeDocSliceId(header);
    if (!sliceId) continue;
    const onSuccess = normalizeOnSuccessTarget(
      m[1].match(/ON_SUCCESS:\s*([^\n]+)/i)?.[1],
    );
    const existing = registry.get(sliceId);
    if (existing && onSuccess) {
      existing.onSuccess = onSuccess;
    } else if (!existing) {
      const meta = parseTagBlock(m[1], sliceId, program, masterDoc);
      if (meta) registry.set(sliceId, meta);
    }
  }

  // Infer CM chain ON_SUCCESS from sequential §12 when only ON_SUCCESS in blocks
  const cmSlices = [...registry.keys()].filter((k) => /^CM\d+$/.test(k)).sort(
    (a, b) => Number.parseInt(a.slice(2), 10) - Number.parseInt(b.slice(2), 10),
  );
  for (let i = 0; i < cmSlices.length - 1; i++) {
    const cur = registry.get(cmSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = cmSlices[i + 1];
    }
  }

  // RTE-F slice tags table: | **RTE-F1** | AFK | none | auto_when_green | ... | RTE-F2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(RTE-F\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) continue;
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  const rteFSlices = [...registry.keys()]
    .filter((k) => /^RTE-F\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('RTE-F', ''), 10) -
        Number.parseInt(b.replace('RTE-F', ''), 10),
    );
  for (let i = 0; i < rteFSlices.length - 1; i++) {
    const cur = registry.get(rteFSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = rteFSlices[i + 1];
    }
  }

  // IWA slice tags table: | **IWA-1** | AFK | none | auto_when_green | ... | IWA-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(IWA-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) {
      const existing = registry.get(sliceId);
      const onSuccess = normalizeOnSuccessTarget(m[5]);
      if (existing && onSuccess && !existing.onSuccess) existing.onSuccess = onSuccess;
      continue;
    }
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  const iwaSlices = [...registry.keys()]
    .filter((k) => /^IWA-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('IWA-', ''), 10) -
        Number.parseInt(b.replace('IWA-', ''), 10),
    );
  for (let i = 0; i < iwaSlices.length - 1; i++) {
    const cur = registry.get(iwaSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = iwaSlices[i + 1];
    }
  }

  const cdriveSlices = [...registry.keys()]
    .filter((k) => /^CDRIVE-\d+$/.test(k))
    .sort((a, b) => Number.parseInt(a.split('-')[1], 10) - Number.parseInt(b.split('-')[1], 10));
  for (let i = 0; i < cdriveSlices.length - 1; i++) {
    const cur = registry.get(cdriveSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = cdriveSlices[i + 1];
    }
  }

  // FM slice table: | **FM-0** | goal | — | AFK | none | auto_when_green | ~$0 | FM-1 | ⚪ |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(FM-\d+)\*\*\s*\|[^|\n]*\|[^|\n]*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) {
      const existing = registry.get(sliceId);
      const onSuccess = normalizeOnSuccessTarget(m[5]);
      if (existing && onSuccess && !existing.onSuccess) existing.onSuccess = onSuccess;
      continue;
    }
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  const fmSlices = [...registry.keys()]
    .filter((k) => /^FM-\d+$/.test(k))
    .sort((a, b) => Number.parseInt(a.split('-')[1], 10) - Number.parseInt(b.split('-')[1], 10));
  for (let i = 0; i < fmSlices.length - 1; i++) {
    const cur = registry.get(fmSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = fmSlices[i + 1];
    }
  }

  // REPO-H slice table: | **RH1** | goal | RH0 | AFK | none | auto_when_green | ~$0 | RH2 | ...
  for (const m of masterText.matchAll(
    /\|\s*\*\*(RH\d+)\*\*\s*\|[^|\n]*\|[^|\n]*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) {
      const existing = registry.get(sliceId);
      const onSuccess = normalizeOnSuccessTarget(m[5]);
      if (existing && onSuccess && !existing.onSuccess) existing.onSuccess = onSuccess;
      continue;
    }
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  // AB slice tags table: | **AB-1** | AFK | none | auto_when_green | ... | AB-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(AB-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) {
      const existing = registry.get(sliceId);
      const onSuccess = normalizeOnSuccessTarget(m[5]);
      if (existing && onSuccess && !existing.onSuccess) existing.onSuccess = onSuccess;
      continue;
    }
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }

  const abSlices = [...registry.keys()]
    .filter((k) => /^AB-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('AB-', ''), 10) -
        Number.parseInt(b.replace('AB-', ''), 10),
    );
  for (let i = 0; i < abSlices.length - 1; i++) {
    const cur = registry.get(abSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = abSlices[i + 1];
    }
  }

  // DS-CLEAN slice table: | **DS1** | goal | DS0 | AFK | none | auto_when_green | ~$0 | DS2 | ...
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS\d+)\*\*\s*\|[^|\n]*\|[^|\n]*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
  )) {
    const sliceId = m[1];
    if (registry.has(sliceId)) {
      const existing = registry.get(sliceId);
      const onSuccess = normalizeOnSuccessTarget(m[5]);
      if (existing && onSuccess && !existing.onSuccess) existing.onSuccess = onSuccess;
      continue;
    }
    const onSuccess = normalizeOnSuccessTarget(m[5]);
    registry.set(sliceId, {
      autonomy: /** @type {'AFK'|'HITL'} */ (m[2].toUpperCase()),
      ceoGate: m[3],
      mergePolicy: m[4],
      program,
      masterDoc,
      onSuccess,
      subLane: subLaneForDocSlice(sliceId, program),
    });
  }
}

/** @returns {Map<string, RegistrySlice>} */
export function loadMasterRegistry() {
  if (cachedRegistry) return cachedRegistry;

  /** @type {Map<string, RegistrySlice>} */
  const registry = new Map();

  if (!existsSync(PROJECTS_DIR)) {
    cachedRegistry = registry;
    return registry;
  }

  for (const file of readdirSync(PROJECTS_DIR)) {
    if (!file.endsWith('-master.md')) continue;
    const masterDoc = `docs/projects/${file}`;
    const masterText = readFileSync(resolve(PROJECTS_DIR, file), 'utf8');
    const program =
      programFromDashboard(masterText) ?? programFromMasterFile(file);
    parseMasterDoc(masterText, masterDoc, program, registry);
  }

  cachedRegistry = registry;
  return registry;
}

/** Clear cache (tests). */
export function clearMasterRegistryCache() {
  cachedRegistry = null;
}

/** @param {string} sliceId */
export function registrySliceMeta(sliceId) {
  if (!sliceId) return undefined;
  const norm = normalizeDocSliceId(sliceId) ?? sliceId;
  return loadMasterRegistry().get(norm);
}

/** @param {string} mergedSliceId */
export function nextSliceFromRegistry(mergedSliceId) {
  const norm = normalizeDocSliceId(mergedSliceId) ?? mergedSliceId;
  const meta = loadMasterRegistry().get(norm);
  return meta?.onSuccess ?? null;
}
