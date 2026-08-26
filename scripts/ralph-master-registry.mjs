/**
 * Doc-driven Ralph slice registry — reads *-master.md for ON_SUCCESS + per-slice tags.
 * Supplements hardcoded chains in ralph-chain-config.mjs (Workers, S6b, DLM, COVE).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHoldTag } from './afkf-hold.mjs';
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

  const mdur = s.match(/^MDUR-(\d+)$/i);
  if (mdur) return `MDUR-${mdur[1]}`;

  const fmr = s.match(/^FMR-(\d+)$/i);
  if (fmr) return `FMR-${fmr[1]}`;

  const fm = s.match(/^FM-(\d+)$/i);
  if (fm) return `FM-${fm[1]}`;

  const ab = s.match(/^AB-(\d+)$/i);
  if (ab) return `AB-${ab[1]}`;

  const iwa = s.match(/^IWA-(\d+)$/i);
  if (iwa) return `IWA-${iwa[1]}`;

  const tlm = s.match(/^TLM-(\d+)$/i);
  if (tlm) return `TLM-${tlm[1]}`;

  const tlw = s.match(/^TLW-(\d+)$/i);
  if (tlw) return `TLW-${tlw[1]}`;

  const tws = s.match(/^TWS-(\d+)$/i);
  if (tws) return `TWS-${tws[1]}`;

  const dwf = s.match(/^DWF-(\d+)$/i);
  if (dwf) return `DWF-${dwf[1]}`;

  const dwpsc = s.match(/^DWPSC-(\d+)$/i);
  if (dwpsc) return `DWPSC-${dwpsc[1]}`;

  const dspsp = s.match(/^DSPSP-(\d+)$/i);
  if (dspsp) return `DSPSP-${dspsp[1]}`;

  const tlf = s.match(/^TLF-(\d+)$/i);
  if (tlf) return `TLF-${tlf[1]}`;

  const tlr = s.match(/^TLR-(\d+)$/i);
  if (tlr) return `TLR-${tlr[1]}`;

  const ltu = s.match(/^LTU-(\d+)$/i);
  if (ltu) return `LTU-${ltu[1]}`;

  const ltl = s.match(/^LTL-(\d+)$/i);
  if (ltl) return `LTL-${ltl[1]}`;

  const lpf = s.match(/^LPF-(\d+)$/i);
  if (lpf) return `LPF-${lpf[1]}`;

  const lpk = s.match(/^LPK-(\d+)$/i);
  if (lpk) return `LPK-${lpk[1]}`;

  const lvr = s.match(/^LVR-(\d+)$/i);
  if (lvr) return `LVR-${lvr[1]}`;

  const ppv = s.match(/^PPV-(\d+)$/i);
  if (ppv) return `PPV-${ppv[1]}`;

  const lpp = s.match(/^LPP-(\d+)$/i);
  if (lpp) return `LPP-${lpp[1]}`;

  const lph = s.match(/^LPH-(\d+)$/i);
  if (lph) return `LPH-${lph[1]}`;

  const lpc = s.match(/^LPC-(\d+)$/i);
  if (lpc) return `LPC-${lpc[1]}`;

  const lpd = s.match(/^LPD-(\d+)$/i);
  if (lpd) return `LPD-${lpd[1]}`;

  const slu = s.match(/^SLU-(\d+)$/i);
  if (slu) return `SLU-${slu[1]}`;

  const ctu = s.match(/^CTU-(\d+)$/i);
  if (ctu) return `CTU-${ctu[1]}`;

  const cco = s.match(/^CCO-(\d+)$/i);
  if (cco) return `CCO-${cco[1]}`;

  const wtw = s.match(/^WTW-(\d+)$/i);
  if (wtw) return `WTW-${wtw[1]}`;

  const files = s.match(/^FILES-(\d+)$/i);
  if (files) return `FILES-${files[1]}`;

  const bms = s.match(/^BMS-(\d+)$/i);
  if (bms) return `BMS-${bms[1]}`;

  const dsbc = s.match(/^DS-BC-(\d+)$/i);
  if (dsbc) return `DS-BC-${dsbc[1]}`;

  const dsbt = s.match(/^DS-BT-(\d+)$/i);
  if (dsbt) return `DS-BT-${dsbt[1]}`;

  const dsbt4 = s.match(/^DS-BT-4-(\d+)$/i);
  if (dsbt4) return `DS-BT-4-${dsbt4[1]}`;

  const dsbis = s.match(/^DS-BIS-(\d+)$/i);
  if (dsbis) return `DS-BIS-${dsbis[1]}`;

  const dsmpv = s.match(/^DS-MPV-(\d+)$/i);
  if (dsmpv) return `DS-MPV-${dsmpv[1]}`;

  const dssph = s.match(/^DS-SPH-(\d+)$/i);
  if (dssph) return `DS-SPH-${dssph[1]}`;

  const dsacp = s.match(/^DS-ACP-(\d+)$/i);
  if (dsacp) return `DS-ACP-${dsacp[1]}`;

  const dsfmf = s.match(/^DS-FMF-(\d+)$/i);
  if (dsfmf) return `DS-FMF-${dsfmf[1]}`;

  const dsm1 = s.match(/^DS-M1-(\d+)$/i);
  if (dsm1) return `DS-M1-${dsm1[1]}`;

  const dssbm = s.match(/^DS-SBM-(\d+)$/i);
  if (dssbm) return `DS-SBM-${dssbm[1]}`;

  const ump = s.match(/^UMP-(\d+)$/i);
  if (ump) return `UMP-${ump[1]}`;

  const ppeDir = s.match(/^PPE-DIR-(\d+)$/i);
  if (ppeDir) return `PPE-DIR-${ppeDir[1]}`;

  const ppeHbt = s.match(/^PPE-HBT-(\d+)$/i);
  if (ppeHbt) return `PPE-HBT-${ppeHbt[1]}`;

  const ppeComp = s.match(/^PPE-COMP-(\d+)$/i);
  if (ppeComp) return `PPE-COMP-${ppeComp[1]}`;

  const ppeRdup = s.match(/^PPE-RDUP-(\d+)$/i);
  if (ppeRdup) return `PPE-RDUP-${ppeRdup[1]}`;

  const ppeLpay = s.match(/^PPE-LPAY-(\d+)$/i);
  if (ppeLpay) return `PPE-LPAY-${ppeLpay[1]}`;

  const ppePayg = s.match(/^PPE-PAYG-(\d+)$/i);
  if (ppePayg) return `PPE-PAYG-${ppePayg[1]}`;

  const blt = s.match(/^BLT-(\d+)$/i);
  if (blt) return `BLT-${blt[1]}`;

  const plk = s.match(/^PLK-(\d+)$/i);
  if (plk) return `PLK-${plk[1]}`;

  const sgp = s.match(/^SGP-(\d+)$/i);
  if (sgp) return `SGP-${sgp[1]}`;

  const sll = s.match(/^SLL-(\d+)$/i);
  if (sll) return `SLL-${sll[1]}`;

  const lep = s.match(/^LEP-(\d+)$/i);
  if (lep) return `LEP-${lep[1]}`;

  const stem = s.match(/^STEM-(\d+)$/i);
  if (stem) return `STEM-${stem[1]}`;

  const lhc = s.match(/^LHC-(\d+)$/i);
  if (lhc) return `LHC-${lhc[1]}`;

  const lre = s.match(/^LRE-(\d+)$/i);
  if (lre) return `LRE-${lre[1]}`;

  const ler = s.match(/^LER-(\d+)$/i);
  if (ler) return `LER-${ler[1]}`;

  const lsff = s.match(/^LSFF-(\d+)$/i);
  if (lsff) return `LSFF-${lsff[1]}`;

  const sbip = s.match(/^SBIP-(\d+)$/i);
  if (sbip) return `SBIP-${sbip[1]}`;

  const lefont = s.match(/^LEFONT-(\d+)$/i);
  if (lefont) return `LEFONT-${lefont[1]}`;

  const lfmp4 = s.match(/^LFMP4-(\d+)$/i);
  if (lfmp4) return `LFMP4-${lfmp4[1]}`;

  const lto = s.match(/^LTO-(\d+)$/i);
  if (lto) return `LTO-${lto[1]}`;

  const fontpipe = s.match(/^FONTPIPE-(\d+)$/i);
  if (fontpipe) return `FONTPIPE-${fontpipe[1]}`;

  const fontr = s.match(/^FONTR-(\d+)$/i);
  if (fontr) return `FONTR-${fontr[1]}`;

  const fvar = s.match(/^FVAR-(\d+)$/i);
  if (fvar) return `FVAR-${fvar[1]}`;

  const lexr = s.match(/^LEXR-(\d+)$/i);
  if (lexr) return `LEXR-${lexr[1]}`;

  const lfxr = s.match(/^LFXR-(\d+)$/i);
  if (lfxr) return `LFXR-${lfxr[1]}`;

  const lfr = s.match(/^LFR-(\d+)$/i);
  if (lfr) return `LFR-${lfr[1]}`;

  const leop = s.match(/^LEOP-(\d+)$/i);
  if (leop) return `LEOP-${leop[1]}`;

  const ledp = s.match(/^LEDP-(\d+)$/i);
  if (ledp) return `LEDP-${ledp[1]}`;

  const lix = s.match(/^LIX-(\d+[a-z]?)$/i);
  if (lix) return `LIX-${lix[1].toLowerCase()}`;

  const lfgf = s.match(/^LFGF-(\d+[a-z]?)$/i);
  if (lfgf) return `LFGF-${lfgf[1]}`;

  // CPF before CP so `CPF-3b` is not mistaken for a CP slice.
  const cpf = s.match(/^CPF-(\d+[a-z]?)$/i);
  if (cpf) return `CPF-${cpf[1].toLowerCase()}`;

  const cp = s.match(/^CP-(\d+[a-z]?)$/i);
  if (cp) return `CP-${cp[1].toLowerCase()}`;

  const lfguxp13 = s.match(/^LFGUXP13-(\d+)$/i);
  if (lfguxp13) return `LFGUXP13-${lfguxp13[1]}`;

  const lfguxp14 = s.match(/^LFGUXP14-(\d+)$/i);
  if (lfguxp14) return `LFGUXP14-${lfguxp14[1]}`;

  const lfguxp16 = s.match(/^LFGUXP16-(\d+)$/i);
  if (lfguxp16) return `LFGUXP16-${lfguxp16[1]}`;

  const lfguxp15 = s.match(/^LFGUXP15-(\d+)$/i);
  if (lfguxp15) return `LFGUXP15-${lfguxp15[1]}`;

  const lfguxp11 = s.match(/^LFGUXP11-(\d+)$/i);
  if (lfguxp11) return `LFGUXP11-${lfguxp11[1]}`;

  const lfguxp10 = s.match(/^LFGUXP10-(\d+)$/i);
  if (lfguxp10) return `LFGUXP10-${lfguxp10[1]}`;

  const lfguxp9 = s.match(/^LFGUXP9-(\d+)$/i);
  if (lfguxp9) return `LFGUXP9-${lfguxp9[1]}`;

  const lfguxp8 = s.match(/^LFGUXP8-(\d+)$/i);
  if (lfguxp8) return `LFGUXP8-${lfguxp8[1]}`;

  const lfguxp7 = s.match(/^LFGUXP7-(\d+)$/i);
  if (lfguxp7) return `LFGUXP7-${lfguxp7[1]}`;

  const lfguxp6 = s.match(/^LFGUXP6-(\d+)$/i);
  if (lfguxp6) return `LFGUXP6-${lfguxp6[1]}`;

  const lfguxp5 = s.match(/^LFGUXP5-(\d+)$/i);
  if (lfguxp5) return `LFGUXP5-${lfguxp5[1]}`;

  const lfguxp4 = s.match(/^LFGUXP4-(\d+)$/i);
  if (lfguxp4) return `LFGUXP4-${lfguxp4[1]}`;

  const lfguxp3 = s.match(/^LFGUXP3-(\d+)$/i);
  if (lfguxp3) return `LFGUXP3-${lfguxp3[1]}`;

  const lfguxp2 = s.match(/^LFGUXP2-(\d+)$/i);
  if (lfguxp2) return `LFGUXP2-${lfguxp2[1]}`;

  const lfguxp = s.match(/^LFGUXP-(\d+)$/i);
  if (lfguxp) return `LFGUXP-${lfguxp[1]}`;

  const lfgux = s.match(/^LFGUX-(\d+)$/i);
  if (lfgux) return `LFGUX-${lfgux[1]}`;

  const lfg = s.match(/^LFG-(\d+)$/i);
  if (lfg) return `LFG-${lfg[1]}`;

  const lcap = s.match(/^LCAP-(\d+)$/i);
  if (lcap) return `LCAP-${lcap[1]}`;

  const wft = s.match(/^WFT-(\d+)$/i);
  if (wft) return `WFT-${wft[1]}`;

  const nav = s.match(/^NAV-(\d+)$/i);
  if (nav) return `NAV-${nav[1]}`;

  const s1b = s.match(/^S1B-(\d+)$/i);
  if (s1b) return `S1B-${s1b[1]}`;

  const s6 = s.match(/^S6-(\d+)$/i);
  if (s6) return `S6-${s6[1]}`;

  const s6a = s.match(/^S6A-(\d+)$/i);
  if (s6a) return `S6A-${s6a[1]}`;

  const hireRel = s.match(/^HIRE-REL-(\d+)$/i);
  if (hireRel) return `HIRE-REL-${hireRel[1]}`;

  const dlh = s.match(/^DLH-(\d+)$/i);
  if (dlh) return `DLH-${dlh[1]}`;

  const dlr = s.match(/^DLR-(\d+)$/i);
  if (dlr) return `DLR-${dlr[1]}`;

  const costUx = s.match(/^COST-UX-(\d+)$/i);
  if (costUx) return `COST-UX-${costUx[1]}`;

  const dspPerf = s.match(/^DSP-PERF-(\d+)$/i);
  if (dspPerf) return `DSP-PERF-${dspPerf[1]}`;

  const dln = s.match(/^DLN-(\d+)$/i);
  if (dln) return `DLN-${dln[1]}`;

  const dss = s.match(/^DSS-(\d+)$/i);
  if (dss) return `DSS-${dss[1]}`;

  const dlf = s.match(/^DLF-(\d+)$/i);
  if (dlf) return `DLF-${dlf[1]}`;

  const dls = s.match(/^DLS-(\d+)$/i);
  if (dls) return `DLS-${dls[1]}`;

  const dlb = s.match(/^DLB-(\d+)$/i);
  if (dlb) return `DLB-${dlb[1]}`;

  const dlp = s.match(/^DLP-(\d+)$/i);
  if (dlp) return `DLP-${dlp[1]}`;

  const pbDlPref = s.match(/^PB-DL-PREF-(\d+)$/i);
  if (pbDlPref) return `PB-DL-PREF-${pbDlPref[1]}`;

  const pbDlFam = s.match(/^PB-DL-FAM-(\d+)$/i);
  if (pbDlFam) return `PB-DL-FAM-${pbDlFam[1]}`;

  const entwDl = s.match(/^ENTW-DL-(\d+)$/i);
  if (entwDl) return `ENTW-DL-${entwDl[1]}`;

  const kcaLive = s.match(/^KCA-LIVE-(\d+)$/i);
  if (kcaLive) return `KCA-LIVE-${kcaLive[1]}`;

  const lse = s.match(/^LSE-(\d+)$/i);
  if (lse) return `LSE-${lse[1]}`;

  const lacc = s.match(/^LACC-(\d+)([a-z])?$/i);
  if (lacc) return `LACC-${lacc[1]}${(lacc[2] || '').toLowerCase()}`;

  // PROOF — agent-run verification. Registered at slice-planning time on purpose:
  // CANVAS-OWNER's CO-N ids were never added here, and an unregistered id makes the
  // chain stop with "unknown merged slice" no matter what RALPH_CHAIN says.
  const proof = s.match(/^PROOF-(\d+)$/i);
  if (proof) return `PROOF-${proof[1]}`;

  // LAF — Layout AI Foundation. Registered at slice-planning time (same lesson as PROOF above).
  const laf = s.match(/^LAF-(\d+)$/i);
  if (laf) return `LAF-${laf[1]}`;

  // AMR — AI Model Registry. Registered at slice-planning time (same lesson as PROOF/LAF above).
  const amr = s.match(/^AMR-(\d+)$/i);
  if (amr) return `AMR-${amr[1]}`;

  // FCN — Flow Canvas Nodes. Registered at slice-planning time (same lesson as PROOF/LAF/AMR above).
  const fcn = s.match(/^FCN-(\d+)$/i);
  if (fcn) return `FCN-${fcn[1]}`;

  // COURSES — PP Growth LMS. Registered at slice-planning time (same lesson as PROOF/LAF/AMR/FCN above).
  const courses = s.match(/^COURSES-(\d+)$/i);
  if (courses) return `COURSES-${courses[1]}`;

  // LNP — Library Node Picker (FCN follow-on). Registered at slice-planning time.
  const lnp = s.match(/^LNP-(\d+)$/i);
  if (lnp) return `LNP-${lnp[1]}`;

  // DDM — Drop a file, get a node (LNP follow-on, same flow canvas). Registered at
  // slice-planning time (same lesson as PROOF/LAF/AMR/FCN/LNP above): an unregistered id makes
  // the chain stop with "unknown merged slice". Own prefix rather than continuing LNP's numbering
  // — DDM is a separate programme on the same surface, and an `LNP-8` that was really DDM-1 would
  // make every closed LNP row unreadable (the same reason PEX did not continue PAS).
  const ddm = s.match(/^DDM-(\d+[a-z]?)$/i);
  if (ddm) return `DDM-${ddm[1].toLowerCase()}`;

  // AFKF — AFK Foundation. Registered at slice-planning time (same lesson as PROOF/LAF/AMR/FCN above).
  //
  // The letter suffix was added 2026-08-21 for the same reason WAC and LIX carry one: a piece of
  // work that belongs to an already-numbered slice needs an id the chain can tell APART from it.
  // AFKF-18a builds the daily measurement AFKF-18's own hold depends on; filing it as `AFKF-18`
  // would have told the queue that AFKF-18 shipped and advanced past a slice nobody had built.
  const afkf = s.match(/^AFKF-(\d+[a-z]?)$/i);
  if (afkf) return `AFKF-${afkf[1].toLowerCase()}`;

  // LSUX — Lyric Sync editing UX/UI. Registered at slice-planning time (same lesson as
  // PROOF/LAF/AMR/FCN above): an unregistered id makes the chain stop with "unknown merged slice".
  // Distinct prefix from LSE- and LACC-, which are different programs on the same surface.
  const lsux = s.match(/^LSUX-(\d+[a-z]?)$/i);
  if (lsux) return `LSUX-${lsux[1].toLowerCase()}`;

  // PAS — Page Artifact Service. Registered at slice-planning time (same lesson as
  // PROOF/LAF/AMR/FCN above): an unregistered id makes the chain stop with "unknown merged slice".
  const pas = s.match(/^PAS-(\d+[a-z]?)$/i);
  if (pas) return `PAS-${pas[1].toLowerCase()}`;

  // PEX — Page Export Parity. Registered at slice-planning time (same lesson as
  // PROOF/LAF/AMR/FCN/PAS above). PEX supersedes PAS and has its own prefix rather than
  // continuing PAS's numbering: the two programmes' slices mean different things, and a
  // `PAS-7` that was really PEX-1 would make every closed PAS row unreadable.
  const pex = s.match(/^PEX-(\d+[a-z]?)$/i);
  if (pex) return `PEX-${pex[1].toLowerCase()}`;

  // WAC — Workspace Access Control. Registered at slice-planning time. Letter suffixes because
  // WAC-3 was already a named epic in the master doc before it was sliced, so its pieces are
  // WAC-3a…WAC-3f rather than a second flat run of numbers that would collide with WAC-1/WAC-2.
  const wac = s.match(/^WAC-(\d+[a-z]?)$/i);
  if (wac) return `WAC-${wac[1].toLowerCase()}`;

  // CGR — Content Generation Resilience. Registered at slice-planning time (same lesson as
  // PROOF/LAF/AMR/FCN/PAS/PEX/WAC above): an unregistered id makes the chain stop with
  // "unknown merged slice".
  const cgr = s.match(/^CGR-(\d+[a-z]?)$/i);
  if (cgr) return `CGR-${cgr[1].toLowerCase()}`;

  // AGG — AI Aggregator Failover. Registered at slice-planning time (same lesson as
  // PROOF/LAF/AMR/FCN/PAS/PEX/WAC/CGR above): an unregistered id makes the chain stop with
  // "unknown merged slice". Own prefix rather than continuing AMR's numbering — AGG is AMR's
  // child programme, but an `AMR-17` that was really AGG-1 would make every closed AMR row
  // unreadable, which is the same reason PEX did not continue PAS.
  const agg = s.match(/^AGG-(\d+[a-z]?)$/i);
  if (agg) return `AGG-${agg[1].toLowerCase()}`;

  return null;
}

/** @param {string} sliceId @param {string} program */
export function subLaneForDocSlice(sliceId, program) {
  if (!sliceId) return null;
  if (sliceId.startsWith('RH')) return 'H-repo-health';
  if (sliceId.startsWith('DS-BC-')) return 'L-ds-bc';
  if (sliceId.startsWith('DS-BT-')) return 'L-ds-bt';
  if (sliceId.startsWith('DS-BIS-')) return 'L-ds-bis';
  if (sliceId.startsWith('DS-MPV-')) return 'L-ds-mpv';
  if (sliceId.startsWith('DS-SPH-')) return 'L-ds-sph';
  if (sliceId.startsWith('DS-ACP-')) return 'L-ds-acp';
  if (sliceId.startsWith('DS-FMF-')) return 'L-ds-fmf';
  if (sliceId.startsWith('DS-M1-')) return 'L-ds-m1';
  if (sliceId.startsWith('DS-SBM-')) return 'L-ds-sbm';
  if (sliceId.startsWith('UMP-')) return 'L-ump';
  if (sliceId.startsWith('PPE-DIR-')) return 'L-ppe-dir';
  if (sliceId.startsWith('PPE-HBT-')) return 'L-ppe-hbt';
  if (sliceId.startsWith('PPE-COMP-')) return 'L-ppe-comp';
  if (sliceId.startsWith('PPE-RDUP-')) return 'L-ppe-rdup';
  if (sliceId.startsWith('PPE-LPAY-')) return 'L-ppe-lpay';
  if (sliceId.startsWith('PPE-PAYG-')) return 'L-ppe-payg';
  if (sliceId.startsWith('BLT-')) return 'L-blt';
  if (sliceId.startsWith('PLK-')) return 'L-plk';
  if (sliceId.startsWith('DS')) return 'I-ds-clean';
  if (sliceId.startsWith('FMR-')) return 'J-fmr';
  if (sliceId.startsWith('FM-')) return 'J-fm';
  if (sliceId.startsWith('CDRIVE-')) return 'G-cdrive';
  if (sliceId.startsWith('CM')) return 'G-catalog-match';
  if (sliceId.startsWith('RTE-F')) return 'H-rte-f';
  if (sliceId.startsWith('RTE-')) return 'H-rte';
  if (sliceId.startsWith('AB-')) return 'D-ab';
  if (sliceId.startsWith('IWA-')) return 'J-iwa';
  if (sliceId.startsWith('TLM-')) return 'J-tlm';
  if (sliceId.startsWith('TLW-')) return 'J-tlw';
  if (sliceId.startsWith('DWF-')) return 'J-dwf';
  if (sliceId.startsWith('DWPSC-')) return 'J-dwpsc';
  if (sliceId.startsWith('DSPSP-')) return 'J-dspsp';
  if (sliceId.startsWith('TLF-')) return 'J-tlf';
  if (sliceId.startsWith('TLR-')) return 'J-tlr';
  if (sliceId.startsWith('LTU-')) return 'J-ltu';
  if (sliceId.startsWith('LTL-')) return 'J-ltl';
  if (sliceId.startsWith('LPF-')) return 'J-lpf';
  if (sliceId.startsWith('LPK-')) return 'J-lpk';
  if (sliceId.startsWith('LPD-')) return 'J-lpd';
  if (sliceId.startsWith('LVR-')) return 'J-lvr';
  if (sliceId.startsWith('PPV-')) return 'J-ppv';
  if (sliceId.startsWith('LPP-')) return 'J-lpp';
  if (sliceId.startsWith('LPH-')) return 'J-lph';
  if (sliceId.startsWith('LPC-')) return 'J-lpc';
  if (sliceId.startsWith('CTU-')) return 'J-ctu';
  if (sliceId.startsWith('CCO-')) return 'J-cco';
  if (sliceId.startsWith('WTW-')) return 'J-wtw';
  if (sliceId.startsWith('FILES-')) return 'K-files';
  if (sliceId.startsWith('BMS-')) return 'L-bms';
  if (sliceId.startsWith('SGP-')) return 'J-sgp';
  if (sliceId.startsWith('SLL-')) return 'J-sll';
  if (sliceId.startsWith('LEP-')) return 'J-lep';
  if (sliceId.startsWith('STEM-')) return 'J-stem';
  if (sliceId.startsWith('LHC-')) return 'J-lhc';
  if (sliceId.startsWith('LRE-')) return 'J-lre';
  if (sliceId.startsWith('LER-')) return 'J-ler';
  if (sliceId.startsWith('LSFF-')) return 'J-lsff';
  if (sliceId.startsWith('SBIP-')) return 'J-sbip';
  if (sliceId.startsWith('LEFONT-')) return 'J-lefont';
  if (sliceId.startsWith('LFMP4-')) return 'J-lfmp4';
  if (sliceId.startsWith('LTO-')) return 'J-lto';
  if (sliceId.startsWith('FONTPIPE-')) return 'J-fontpipe';
  if (sliceId.startsWith('FONTR-')) return 'J-fontr';
  if (sliceId.startsWith('FVAR-')) return 'J-fvar';
  if (sliceId.startsWith('LEXR-')) return 'J-lexr';
  if (sliceId.startsWith('LFXR-')) return 'J-lfxr';
  if (sliceId.startsWith('LFR-')) return 'J-lfr';
  if (sliceId.startsWith('LEOP-')) return 'J-leop';
  if (sliceId.startsWith('LEDP-')) return 'J-ledp';
  if (sliceId.startsWith('LIX-')) return 'J-lix';
  if (sliceId.startsWith('LFGF-')) return 'J-lfgf';
  if (sliceId.startsWith('CPF-')) return 'J-cpf';
  if (sliceId.startsWith('CP-')) return 'J-cp';
  if (sliceId.startsWith('LFGUXP13-')) return 'J-lfguxp13';
  if (sliceId.startsWith('LFGUXP14-')) return 'J-lfguxp14';
  if (sliceId.startsWith('LFGUXP16-')) return 'J-lfguxp16';
  if (sliceId.startsWith('LFGUXP15-')) return 'J-lfguxp15';
  if (sliceId.startsWith('LFGUXP11-')) return 'J-lfguxp11';
  if (sliceId.startsWith('LFGUXP10-')) return 'J-lfguxp10';
  if (sliceId.startsWith('LFGUXP9-')) return 'J-lfguxp9';
  if (sliceId.startsWith('LFGUXP8-')) return 'J-lfguxp8';
  if (sliceId.startsWith('LFGUXP7-')) return 'J-lfguxp7';
  if (sliceId.startsWith('LFGUXP6-')) return 'J-lfguxp6';
  if (sliceId.startsWith('LFGUXP5-')) return 'J-lfguxp5';
  if (sliceId.startsWith('LFGUXP4-')) return 'J-lfguxp4';
  if (sliceId.startsWith('LFGUXP3-')) return 'J-lfguxp3';
  if (sliceId.startsWith('LFGUXP2-')) return 'J-lfguxp2';
  if (sliceId.startsWith('LFGUXP-')) return 'J-lfguxp';
  if (sliceId.startsWith('LFGUX-')) return 'J-lfgux';
  if (sliceId.startsWith('LFG-')) return 'J-lfg';
  if (sliceId.startsWith('LCAP-')) return 'J-lcap';
  if (sliceId.startsWith('WFT-')) return 'J-wft';
  if (sliceId.startsWith('NAV-')) return 'L-nav';
  if (sliceId.startsWith('S1B-')) return 'J-phis-s1b';
  if (sliceId.startsWith('S6-')) return 'J-phis-s6';
  if (sliceId.startsWith('S6A-')) return 'J-phis-s6a';
  if (sliceId.startsWith('HIRE-REL-')) return 'J-phis-hire-rel';
  if (sliceId.startsWith('DLH-')) return 'L-dlh';
  if (sliceId.startsWith('DLR-')) return 'L-dlr';
  if (sliceId.startsWith('COST-UX-')) return 'L-cost-ux';
  if (sliceId.startsWith('DSP-PERF-')) return 'L-dsp-perf';
  if (sliceId.startsWith('DLN-')) return 'L-dln';
  if (sliceId.startsWith('DSS-')) return 'L-dss';
  if (sliceId.startsWith('DLF-')) return 'L-dlf';
  if (sliceId.startsWith('DLS-')) return 'L-dls';
  if (sliceId.startsWith('DLB-')) return 'L-dlb';
  if (sliceId.startsWith('DLP-')) return 'L-dlp';
  if (sliceId.startsWith('PB-DL-PREF-')) return 'L-pb-dl-pref';
  if (sliceId.startsWith('PB-DL-FAM-')) return 'L-pb-dl-fam';
  if (sliceId.startsWith('ENTW-DL-')) return 'L-entw-dl';
  if (sliceId.startsWith('KCA-LIVE-')) return 'J-kca';
  if (sliceId.startsWith('LAF-')) return 'L-laf';
  if (sliceId.startsWith('AMR-')) return 'L-amr';
  if (sliceId.startsWith('FCN-')) return 'L-fcn';
  if (sliceId.startsWith('COURSES-')) return 'L-courses';
  if (sliceId.startsWith('LNP-')) return 'L-lnp';
  if (sliceId.startsWith('DDM-')) return 'L-ddm';
  if (sliceId.startsWith('AFKF-')) return 'L-afkf';
  if (sliceId.startsWith('LSUX-')) return 'L-lsux';
  if (sliceId.startsWith('WAC-')) return 'L-wac';
  if (sliceId.startsWith('PAS-')) return 'L-pas';
  if (sliceId.startsWith('PEX-')) return 'L-pex';
  if (sliceId.startsWith('AGG-')) return 'L-agg';
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

  /**
   * A block with no `AUTONOMY:` is not a slice, and it stays that way (critic finding, round two).
   *
   * The first attempt at the two-parser problem returned a partial `{ holdOnly, hold }` entry here.
   * That was worse than the problem: `registry.set` is unconditional and last-block-wins, so a
   * second `###` block for the same id carrying a `HOLD:` line would REPLACE a good entry with one
   * having no `autonomy`, and `mc-auto-merge` reads `meta.autonomy === 'HITL'` — `undefined` reads
   * as AFK. A fail-open on the merge path, added by a fail-closed slice. Reverted.
   *
   * A slice the registry cannot see is refused earlier anyway: `canAutoChain(undefined)` is false.
   * The real defect was holds being read by two different block rules, and that is fixed where it
   * belongs — both parsers now require the tag fence, and `holdsOutsideTagBlock` makes a hold
   * written anywhere else a loud failure rather than a silent nothing.
   */
  if (!autonomy) return null;

  /**
   * AFKF-18b — the HOLD tag stops being prose.
   *
   * `HOLD:` has been written in §12 blocks since AFKF-18 was planned and nothing has ever read it.
   * Parsed here rather than at the point of use so that EVERY reader of the registry sees the same
   * hold: the chain planner, the queue, `afkf:chat` and a session running `afkf:hold-check` all
   * ask one source. A gate enforced in one caller is a gate the next caller does not have.
   */
  const hold = parseHoldTag(blockText);

  return {
    autonomy: /** @type {'AFK'|'HITL'} */ (autonomy),
    ceoGate,
    mergePolicy,
    program,
    masterDoc,
    hold,
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
/** The section pattern itself, in one place. */
function SECTION_RE_SOURCE() {
  return /###\s+(?:([A-Z][A-Z0-9-]*)\s+)?(MDUR-\d+|AB-\d+|RH\d+|CM\d+|CDRIVE-\d+|DLM-\d+|DLH-\d+|DLR-\d+|DLN-\d+|DSS-\d+|DLF-\d+|DLS-\d+|DLB-\d+|DLP-\d+|PB-DL-PREF-\d+|PB-DL-FAM-\d+|ENTW-DL-\d+|KCA-LIVE-\d+|FMR-\d+|FM-\d+|RTE-F\d+|RTE-W\d+|IWA-\d+|TLM-\d+|TLW-\d+|TWS-\d+|DWF-\d+|DWPSC-\d+|DSPSP-\d+|TLF-\d+|TLR-\d+|LTU-\d+|LTL-\d+|LPF-\d+|LPK-\d+|LVR-\d+|PPV-\d+|LPP-\d+|LPH-\d+|LPC-\d+|CTU-\d+|CCO-\d+|WTW-\d+|FILES-\d+|BMS-\d+|DS-BC-\d+|DS-BT-\d+|DS-BIS-\d+|DS-MPV-\d+|DS-SPH-\d+|DS-ACP-\d+|DS-FMF-\d+|DS-M1-\d+|DS-SBM-\d+|UMP-\d+|PPE-DIR-\d+|PPE-HBT-\d+|PPE-COMP-\d+|PPE-RDUP-\d+|PPE-LPAY-\d+|PPE-PAYG-\d+|BLT-\d+|PLK-\d+|SGP-\d+|SLL-\d+|LEP-\d+|LSE-\d+|LACC-\d+[a-z]?|STEM-\d+|LHC-\d+|LRE-\d+|LER-\d+|LSFF-\d+|SBIP-\d+|LEFONT-\d+|LFMP4-\d+|LTO-\d+|FONTPIPE-\d+|FONTR-\d+|FVAR-\d+|LEXR-\d+|LFXR-\d+|LFR-\d+|LEOP-\d+|LEDP-\d+|LIX-\d+[a-z]?|LFGF-\d+[a-z]?|CPF-\d+[a-z]?|CP-\d+[a-z]?|LFGUXP6-\d+|LFGUXP5-\d+|LFGUXP4-\d+|LFGUXP3-\d+|LFGUXP2-\d+|LFGUXP-\d+|LFGUX-\d+|LFG-\d+|LCAP-\d+|WFT-\d+|NAV-\d+|S1B-\d+|HIRE-REL-\d+|S6A-\d+|S6-\d+|COST-UX-\d+|DSP-PERF-\d+|PROOF-\d+|LAF-\d+[a-z]?|AMR-\d+|FCN-\d+|COURSES-\d+|LNP-\d+|DDM-\d+[a-z]?|AFKF-\d+[a-z]?|WAC-\d+[a-z]?|CGR-\d+[a-z]?|LSUX-\d+[a-z]?|PAS-\d+[a-z]?|PEX-\d+[a-z]?|AGG-\d+[a-z]?|COVE\s+P\d+|WORKFLOW-P\d+[a-z]?|W\d+[a-z]?|S6b-F\d+|S6b-batch-\d+)[^\n]*\n(?:(?!###|```)[^\n]*\n)*```text\n([\s\S]*?)```/gi;
}

/**
 * The ONE rule for "which §12 tag block belongs to which slice id".
 *
 * AFKF-18b, round four. `afkf-chain-queue.mjs` had its own heading pattern — first token, must end
 * in `-<digits>` — and this one allows an optional programme-prefix word and an explicit id
 * allowlist. So 28 live slices (`RTE-F1…F10`, `RH1…RH21`, `DS0…DS12`, `DS-BT-4`, `WORKFLOW-P22`)
 * were visible to the registry and invisible to the queue. A `HOLD:` on any of them would have been
 * enforced by the on-merge chain and ignored by the ready-queue, `afkf:chat`, the digest, `mc:status`
 * and the planning chain — four of the five paths, failing open, with `holdsOutsideTagBlock` silent
 * because the hold really was inside a fence.
 *
 * Two parsers, two answers, one document: the exact defect this slice keeps rediscovering along a
 * new axis. Exported so there is one rule and no second copy to drift.
 *
 * @param {string} masterText
 * @returns {Array<{ sliceId: string, blockText: string }>}
 */
export function sliceTagBlocks(masterText) {
  const out = [];
  for (const m of masterText.matchAll(sectionRegex())) {
    out.push({ sliceId: normalizeDocSliceId(m[2]) ?? m[2].trim(), blockText: m[3] });
  }
  return out;
}

/** A fresh regex each call — `matchAll` needs `g` and a shared object would carry `lastIndex`. */
function sectionRegex() {
  return SECTION_RE_SOURCE();
}

function parseMasterDoc(masterText, masterDoc, program, registry) {
  // §12 ```text blocks under ### SLICE headers
  const sectionRe = SECTION_RE_SOURCE();

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

  // TLM slice tags table: | **TLM-1** | AFK | none | auto_when_green | ... | TLM-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(TLM-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const tlmSlices = [...registry.keys()]
    .filter((k) => /^TLM-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('TLM-', ''), 10) -
        Number.parseInt(b.replace('TLM-', ''), 10),
    );
  for (let i = 0; i < tlmSlices.length - 1; i++) {
    const cur = registry.get(tlmSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = tlmSlices[i + 1];
    }
  }

  // TLW slice tags table: | **TLW-1** | AFK | none | auto_when_green | ... | TLW-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(TLW-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const tlwSlices = [...registry.keys()]
    .filter((k) => /^TLW-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('TLW-', ''), 10) -
        Number.parseInt(b.replace('TLW-', ''), 10),
    );
  for (let i = 0; i < tlwSlices.length - 1; i++) {
    const cur = registry.get(tlwSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = tlwSlices[i + 1];
    }
  }

  // DWF slice tags table: | **DWF-1** | AFK | none | auto_when_green | ... | DWF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DWF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dwfSlices = [...registry.keys()]
    .filter((k) => /^DWF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DWF-', ''), 10) -
        Number.parseInt(b.replace('DWF-', ''), 10),
    );
  for (let i = 0; i < dwfSlices.length - 1; i++) {
    const cur = registry.get(dwfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dwfSlices[i + 1];
    }
  }

  // DWPSC slice tags table: | **DWPSC-1** | AFK | none | auto_when_green | ... | DWPSC-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DWPSC-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dwpscSlices = [...registry.keys()]
    .filter((k) => /^DWPSC-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DWPSC-', ''), 10) -
        Number.parseInt(b.replace('DWPSC-', ''), 10),
    );
  for (let i = 0; i < dwpscSlices.length - 1; i++) {
    const cur = registry.get(dwpscSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dwpscSlices[i + 1];
    }
  }

  // DSPSP slice tags table: | **DSPSP-1** | AFK | none | auto_when_green | ... | DSPSP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DSPSP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dspspSlices = [...registry.keys()]
    .filter((k) => /^DSPSP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DSPSP-', ''), 10) -
        Number.parseInt(b.replace('DSPSP-', ''), 10),
    );
  for (let i = 0; i < dspspSlices.length - 1; i++) {
    const cur = registry.get(dspspSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dspspSlices[i + 1];
    }
  }

  // TLF slice tags table: | **TLF-1** | AFK | none | auto_when_green | ... | TLF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(TLF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const tlfSlices = [...registry.keys()]
    .filter((k) => /^TLF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('TLF-', ''), 10) -
        Number.parseInt(b.replace('TLF-', ''), 10),
    );
  for (let i = 0; i < tlfSlices.length - 1; i++) {
    const cur = registry.get(tlfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = tlfSlices[i + 1];
    }
  }

  // TLR slice tags table: | **TLR-1** | AFK | none | auto_when_green | ... | TLR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(TLR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const tlrSlices = [...registry.keys()]
    .filter((k) => /^TLR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('TLR-', ''), 10) -
        Number.parseInt(b.replace('TLR-', ''), 10),
    );
  for (let i = 0; i < tlrSlices.length - 1; i++) {
    const cur = registry.get(tlrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = tlrSlices[i + 1];
    }
  }

  // LTU slice tags table: | **LTU-1** | AFK | none | auto_when_green | ... | LTU-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LTU-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ltuSlices = [...registry.keys()]
    .filter((k) => /^LTU-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LTU-', ''), 10) -
        Number.parseInt(b.replace('LTU-', ''), 10),
    );
  for (let i = 0; i < ltuSlices.length - 1; i++) {
    const cur = registry.get(ltuSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ltuSlices[i + 1];
    }
  }

  // LPF slice tags table: | **LPF-1** | AFK | none | auto_when_green | ... | LPF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LPF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lpfSlices = [...registry.keys()]
    .filter((k) => /^LPF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LPF-', ''), 10) -
        Number.parseInt(b.replace('LPF-', ''), 10),
    );
  for (let i = 0; i < lpfSlices.length - 1; i++) {
    const cur = registry.get(lpfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lpfSlices[i + 1];
    }
  }

  // LPK slice tags table: | **LPK-1** | AFK | none | auto_when_green | ... | LPK-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LPK-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lpkSlices = [...registry.keys()]
    .filter((k) => /^LPK-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LPK-', ''), 10) -
        Number.parseInt(b.replace('LPK-', ''), 10),
    );
  for (let i = 0; i < lpkSlices.length - 1; i++) {
    const cur = registry.get(lpkSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lpkSlices[i + 1];
    }
  }

  // LVR slice tags table: | **LVR-1** | AFK | none | auto_when_green | ... | LVR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LVR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lvrSlices = [...registry.keys()]
    .filter((k) => /^LVR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LVR-', ''), 10) -
        Number.parseInt(b.replace('LVR-', ''), 10),
    );
  for (let i = 0; i < lvrSlices.length - 1; i++) {
    const cur = registry.get(lvrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lvrSlices[i + 1];
    }
  }

  // PPV slice tags table: | **PPV-1** | AFK | none | auto_when_green | ... | PPV-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPV-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppvSlices = [...registry.keys()]
    .filter((k) => /^PPV-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPV-', ''), 10) -
        Number.parseInt(b.replace('PPV-', ''), 10),
    );
  for (let i = 0; i < ppvSlices.length - 1; i++) {
    const cur = registry.get(ppvSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppvSlices[i + 1];
    }
  }

  // LPP slice tags table: | **LPP-1** | AFK | none | auto_when_green | ... | LPP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LPP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lppSlices = [...registry.keys()]
    .filter((k) => /^LPP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LPP-', ''), 10) -
        Number.parseInt(b.replace('LPP-', ''), 10),
    );
  for (let i = 0; i < lppSlices.length - 1; i++) {
    const cur = registry.get(lppSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lppSlices[i + 1];
    }
  }

  // LTL slice tags table: | **LTL-1** | AFK | none | auto_when_green | ... | none |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LTL-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ltlSlices = [...registry.keys()]
    .filter((k) => /^LTL-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LTL-', ''), 10) -
        Number.parseInt(b.replace('LTL-', ''), 10),
    );
  for (let i = 0; i < ltlSlices.length - 1; i++) {
    const cur = registry.get(ltlSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ltlSlices[i + 1];
    }
  }

  // LPH slice tags table: | **LPH-1** | AFK | none | auto_when_green | ... | LPH-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LPH-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lphSlices = [...registry.keys()]
    .filter((k) => /^LPH-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LPH-', ''), 10) -
        Number.parseInt(b.replace('LPH-', ''), 10),
    );
  for (let i = 0; i < lphSlices.length - 1; i++) {
    const cur = registry.get(lphSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lphSlices[i + 1];
    }
  }

  // LPC slice tags table: | **LPC-1** | AFK | none | auto_when_green | ... | LPC-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LPC-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lpcSlices = [...registry.keys()]
    .filter((k) => /^LPC-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LPC-', ''), 10) -
        Number.parseInt(b.replace('LPC-', ''), 10),
    );
  for (let i = 0; i < lpcSlices.length - 1; i++) {
    const cur = registry.get(lpcSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lpcSlices[i + 1];
    }
  }

  // LEFONT slice tags table: | **LEFONT-1** | AFK | none | auto_when_green | ... | LEFONT-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LEFONT-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lefontSlices = [...registry.keys()]
    .filter((k) => /^LEFONT-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LEFONT-', ''), 10) -
        Number.parseInt(b.replace('LEFONT-', ''), 10),
    );
  for (let i = 0; i < lefontSlices.length - 1; i++) {
    const cur = registry.get(lefontSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lefontSlices[i + 1];
    }
  }

  // LFMP4 slice tags table: | **LFMP4-1** | AFK | none | auto_when_green | ... | LFMP4-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFMP4-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfmp4Slices = [...registry.keys()]
    .filter((k) => /^LFMP4-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFMP4-', ''), 10) -
        Number.parseInt(b.replace('LFMP4-', ''), 10),
    );
  for (let i = 0; i < lfmp4Slices.length - 1; i++) {
    const cur = registry.get(lfmp4Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfmp4Slices[i + 1];
    }
  }

  // LTO slice tags table: | **LTO-1** | AFK | none | auto_when_green | ... | LTO-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LTO-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ltoSlices = [...registry.keys()]
    .filter((k) => /^LTO-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LTO-', ''), 10) -
        Number.parseInt(b.replace('LTO-', ''), 10),
    );
  for (let i = 0; i < ltoSlices.length - 1; i++) {
    const cur = registry.get(ltoSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ltoSlices[i + 1];
    }
  }

  // FONTPIPE slice tags table: | **FONTPIPE-1** | AFK | none | auto_when_green | ... | FONTPIPE-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(FONTPIPE-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const fontpipeSlices = [...registry.keys()]
    .filter((k) => /^FONTPIPE-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('FONTPIPE-', ''), 10) -
        Number.parseInt(b.replace('FONTPIPE-', ''), 10),
    );
  for (let i = 0; i < fontpipeSlices.length - 1; i++) {
    const cur = registry.get(fontpipeSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = fontpipeSlices[i + 1];
    }
  }

  // FONTR slice tags table: | **FONTR-1** | AFK | none | auto_when_green | ... | FONTR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(FONTR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const fontrSlices = [...registry.keys()]
    .filter((k) => /^FONTR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('FONTR-', ''), 10) -
        Number.parseInt(b.replace('FONTR-', ''), 10),
    );
  for (let i = 0; i < fontrSlices.length - 1; i++) {
    const cur = registry.get(fontrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = fontrSlices[i + 1];
    }
  }

  // LEXR slice tags table: | **LEXR-1** | AFK | none | auto_when_green | ... | LEXR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LEXR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lexrSlices = [...registry.keys()]
    .filter((k) => /^LEXR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LEXR-', ''), 10) -
        Number.parseInt(b.replace('LEXR-', ''), 10),
    );
  for (let i = 0; i < lexrSlices.length - 1; i++) {
    const cur = registry.get(lexrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lexrSlices[i + 1];
    }
  }

  // LFXR slice tags table: | **LFXR-1** | AFK | none | auto_when_green | ... | LFXR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFXR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfxrSlices = [...registry.keys()]
    .filter((k) => /^LFXR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFXR-', ''), 10) -
        Number.parseInt(b.replace('LFXR-', ''), 10),
    );
  for (let i = 0; i < lfxrSlices.length - 1; i++) {
    const cur = registry.get(lfxrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfxrSlices[i + 1];
    }
  }

  // LFR slice tags table: | **LFR-1** | AFK | none | auto_when_green | ... | LFR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfrSlices = [...registry.keys()]
    .filter((k) => /^LFR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFR-', ''), 10) -
        Number.parseInt(b.replace('LFR-', ''), 10),
    );
  for (let i = 0; i < lfrSlices.length - 1; i++) {
    const cur = registry.get(lfrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfrSlices[i + 1];
    }
  }

  // LEOP slice tags table: | **LEOP-1** | AFK | none | auto_when_green | ... | LEOP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LEOP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const leopSlices = [...registry.keys()]
    .filter((k) => /^LEOP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LEOP-', ''), 10) -
        Number.parseInt(b.replace('LEOP-', ''), 10),
    );
  for (let i = 0; i < leopSlices.length - 1; i++) {
    const cur = registry.get(leopSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = leopSlices[i + 1];
    }
  }

  // LEDP slice tags table: | **LEDP-1** | AFK | none | auto_when_green | ... | LEDP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LEDP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ledpSlices = [...registry.keys()]
    .filter((k) => /^LEDP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LEDP-', ''), 10) -
        Number.parseInt(b.replace('LEDP-', ''), 10),
    );
  for (let i = 0; i < ledpSlices.length - 1; i++) {
    const cur = registry.get(ledpSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ledpSlices[i + 1];
    }
  }

  // LIX slice tags table: | **LIX-1** | AFK | none | auto_when_green | ... | LIX-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LIX-\d+[a-z]?)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lixSlices = [...registry.keys()]
    .filter((k) => /^LIX-\d+[a-z]?$/i.test(k))
    .sort((a, b) => {
      const parse = (id) => {
        const m = /^LIX-(\d+)([a-z]?)$/i.exec(id);
        if (!m) return [0, ''];
        return [Number.parseInt(m[1], 10), m[2] || ''];
      };
      const [an, as] = parse(a);
      const [bn, bs] = parse(b);
      if (an !== bn) return an - bn;
      return as.localeCompare(bs);
    });
  for (let i = 0; i < lixSlices.length - 1; i++) {
    const cur = registry.get(lixSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lixSlices[i + 1];
    }
  }

  // LFG slice tags table: | **LFG-1** | AFK | none | auto_when_green | ... | LFG-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFG-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfgSlices = [...registry.keys()]
    .filter((k) => /^LFG-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFG-', ''), 10) -
        Number.parseInt(b.replace('LFG-', ''), 10),
    );
  for (let i = 0; i < lfgSlices.length - 1; i++) {
    const cur = registry.get(lfgSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfgSlices[i + 1];
    }
  }

  // LFGUX slice tags table: | **LFGUX-1** | AFK | none | auto_when_green | ... | LFGUX-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUX-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxSlices = [...registry.keys()]
    .filter((k) => /^LFGUX-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUX-', ''), 10) -
        Number.parseInt(b.replace('LFGUX-', ''), 10),
    );
  for (let i = 0; i < lfguxSlices.length - 1; i++) {
    const cur = registry.get(lfguxSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxSlices[i + 1];
    }
  }

  // LFGUXP slice tags table: | **LFGUXP-1** | AFK | none | auto_when_green | ... | LFGUXP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxpSlices = [...registry.keys()]
    .filter((k) => /^LFGUXP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP-', ''), 10),
    );
  for (let i = 0; i < lfguxpSlices.length - 1; i++) {
    const cur = registry.get(lfguxpSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxpSlices[i + 1];
    }
  }

  // LFGUXP11 slice tags table: | **LFGUXP11-1** | AFK | none | auto_when_green | ... | LFGUXP11-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP11-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp11Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP11-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP11-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP11-', ''), 10),
    );
  for (let i = 0; i < lfguxp11Slices.length - 1; i++) {
    const cur = registry.get(lfguxp11Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp11Slices[i + 1];
    }
  }

  // LFGUXP13 slice tags table: | **LFGUXP13-1** | AFK | none | auto_when_green | ... | LFGUXP13-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP13-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp13Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP13-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP13-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP13-', ''), 10),
    );
  for (let i = 0; i < lfguxp13Slices.length - 1; i++) {
    const cur = registry.get(lfguxp13Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp13Slices[i + 1];
    }
  }

  // LFGUXP14 slice tags table: | **LFGUXP14-1** | AFK | none | auto_when_green | ... | LFGUXP14-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP14-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp14Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP14-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP14-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP14-', ''), 10),
    );
  for (let i = 0; i < lfguxp14Slices.length - 1; i++) {
    const cur = registry.get(lfguxp14Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp14Slices[i + 1];
    }
  }

  // LFGUXP15 slice tags table: | **LFGUXP15-1** | AFK | none | auto_when_green | ... | LFGUXP15-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP15-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp15Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP15-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP15-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP15-', ''), 10),
    );
  for (let i = 0; i < lfguxp15Slices.length - 1; i++) {
    const cur = registry.get(lfguxp15Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp15Slices[i + 1];
    }
  }

  // FMR slice tags table: | **FMR-0** | AFK | none | auto_when_green | ... | FMR-1 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(FMR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const fmrSlices = [...registry.keys()]
    .filter((k) => /^FMR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('FMR-', ''), 10) -
        Number.parseInt(b.replace('FMR-', ''), 10),
    );
  for (let i = 0; i < fmrSlices.length - 1; i++) {
    const cur = registry.get(fmrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = fmrSlices[i + 1];
    }
  }

  // LFGUXP10 slice tags table: | **LFGUXP10-1** | AFK | none | auto_when_green | ... | LFGUXP10-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP10-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp10Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP10-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP10-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP10-', ''), 10),
    );
  for (let i = 0; i < lfguxp10Slices.length - 1; i++) {
    const cur = registry.get(lfguxp10Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp10Slices[i + 1];
    }
  }

  // LFGUXP9 slice tags table: | **LFGUXP9-1** | AFK | none | auto_when_green | ... | LFGUXP9-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP9-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp9Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP9-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP9-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP9-', ''), 10),
    );
  for (let i = 0; i < lfguxp9Slices.length - 1; i++) {
    const cur = registry.get(lfguxp9Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp9Slices[i + 1];
    }
  }

  // LFGUXP8 slice tags table: | **LFGUXP8-1** | AFK | none | auto_when_green | ... | LFGUXP8-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP8-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp8Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP8-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP8-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP8-', ''), 10),
    );
  for (let i = 0; i < lfguxp8Slices.length - 1; i++) {
    const cur = registry.get(lfguxp8Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp8Slices[i + 1];
    }
  }

  // LFGUXP7 slice tags table: | **LFGUXP7-1** | AFK | none | auto_when_green | ... | LFGUXP7-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP7-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp7Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP7-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP7-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP7-', ''), 10),
    );
  for (let i = 0; i < lfguxp7Slices.length - 1; i++) {
    const cur = registry.get(lfguxp7Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp7Slices[i + 1];
    }
  }

  // LFGUXP6 slice tags table: | **LFGUXP6-1** | AFK | none | auto_when_green | ... | LFGUXP6-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP6-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp6Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP6-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP6-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP6-', ''), 10),
    );
  for (let i = 0; i < lfguxp6Slices.length - 1; i++) {
    const cur = registry.get(lfguxp6Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp6Slices[i + 1];
    }
  }

  // LFGUXP5 slice tags table: | **LFGUXP5-1** | AFK | none | auto_when_green | ... | LFGUXP5-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP5-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp5Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP5-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP5-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP5-', ''), 10),
    );
  for (let i = 0; i < lfguxp5Slices.length - 1; i++) {
    const cur = registry.get(lfguxp5Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp5Slices[i + 1];
    }
  }

  // LFGUXP4 slice tags table: | **LFGUXP4-1** | AFK | none | auto_when_green | ... | LFGUXP4-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP4-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp4Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP4-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP4-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP4-', ''), 10),
    );
  for (let i = 0; i < lfguxp4Slices.length - 1; i++) {
    const cur = registry.get(lfguxp4Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp4Slices[i + 1];
    }
  }

  // LFGUXP3 slice tags table: | **LFGUXP3-1** | AFK | none | auto_when_green | ... | LFGUXP3-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP3-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp3Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP3-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP3-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP3-', ''), 10),
    );
  for (let i = 0; i < lfguxp3Slices.length - 1; i++) {
    const cur = registry.get(lfguxp3Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp3Slices[i + 1];
    }
  }

  // LFGUXP2 slice tags table: | **LFGUXP2-1** | AFK | none | auto_when_green | ... | LFGUXP2-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(LFGUXP2-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const lfguxp2Slices = [...registry.keys()]
    .filter((k) => /^LFGUXP2-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('LFGUXP2-', ''), 10) -
        Number.parseInt(b.replace('LFGUXP2-', ''), 10),
    );
  for (let i = 0; i < lfguxp2Slices.length - 1; i++) {
    const cur = registry.get(lfguxp2Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = lfguxp2Slices[i + 1];
    }
  }

  // CTU slice tags table: | **CTU-1** | AFK | none | auto_when_green | ... | CTU-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(CTU-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ctuSlices = [...registry.keys()]
    .filter((k) => /^CTU-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('CTU-', ''), 10) -
        Number.parseInt(b.replace('CTU-', ''), 10),
    );
  for (let i = 0; i < ctuSlices.length - 1; i++) {
    const cur = registry.get(ctuSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ctuSlices[i + 1];
    }
  }

  // CCO slice tags table: | **CCO-1** | AFK | none | auto_when_green | ... | CCO-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(CCO-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const ccoSlices = [...registry.keys()]
    .filter((k) => /^CCO-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('CCO-', ''), 10) -
        Number.parseInt(b.replace('CCO-', ''), 10),
    );
  for (let i = 0; i < ccoSlices.length - 1; i++) {
    const cur = registry.get(ccoSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ccoSlices[i + 1];
    }
  }

  // WTW slice tags table: | **WTW-1** | AFK | none | auto_when_green | ... | WTW-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(WTW-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const wtwSlices = [...registry.keys()]
    .filter((k) => /^WTW-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('WTW-', ''), 10) -
        Number.parseInt(b.replace('WTW-', ''), 10),
    );
  for (let i = 0; i < wtwSlices.length - 1; i++) {
    const cur = registry.get(wtwSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = wtwSlices[i + 1];
    }
  }

  // SBIP slice tags table: | **SBIP-1** | AFK | none | auto_when_green | ... | SBIP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(SBIP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const sbipSlices = [...registry.keys()]
    .filter((k) => /^SBIP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('SBIP-', ''), 10) -
        Number.parseInt(b.replace('SBIP-', ''), 10),
    );
  for (let i = 0; i < sbipSlices.length - 1; i++) {
    const cur = registry.get(sbipSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = sbipSlices[i + 1];
    }
  }

  // FILES slice tags table: | **FILES-0** | AFK | none | auto_when_green | ... | FILES-1 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(FILES-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const filesSlices = [...registry.keys()]
    .filter((k) => /^FILES-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('FILES-', ''), 10) -
        Number.parseInt(b.replace('FILES-', ''), 10),
    );
  for (let i = 0; i < filesSlices.length - 1; i++) {
    const cur = registry.get(filesSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = filesSlices[i + 1];
    }
  }

  // BMS slice tags table: | **BMS-0** | AFK | none | recommend_merge | ... | BMS-1 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(BMS-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const bmsSlices = [...registry.keys()]
    .filter((k) => /^BMS-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('BMS-', ''), 10) -
        Number.parseInt(b.replace('BMS-', ''), 10),
    );
  for (let i = 0; i < bmsSlices.length - 1; i++) {
    const cur = registry.get(bmsSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = bmsSlices[i + 1];
    }
  }

  // DS-BC slice tags table: | **DS-BC-1** | AFK | none | auto_when_green | ... | DS-BC-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-BC-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsbcSlices = [...registry.keys()]
    .filter((k) => /^DS-BC-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-BC-', ''), 10) -
        Number.parseInt(b.replace('DS-BC-', ''), 10),
    );
  for (let i = 0; i < dsbcSlices.length - 1; i++) {
    const cur = registry.get(dsbcSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsbcSlices[i + 1];
    }
  }

  // DS-BT slice tags table: | **DS-BT-0** | AFK | none | recommend_merge | ... | DS-BT-1 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-BT-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsbtSlices = [...registry.keys()]
    .filter((k) => /^DS-BT-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-BT-', ''), 10) -
        Number.parseInt(b.replace('DS-BT-', ''), 10),
    );
  for (let i = 0; i < dsbtSlices.length - 1; i++) {
    const cur = registry.get(dsbtSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsbtSlices[i + 1];
    }
  }

  // DS-BT-4 slice tags table: | **DS-BT-4-1** | AFK | none | auto_when_green | ... | DS-BT-4-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-BT-4-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsbt4Slices = [...registry.keys()]
    .filter((k) => /^DS-BT-4-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-BT-4-', ''), 10) -
        Number.parseInt(b.replace('DS-BT-4-', ''), 10),
    );
  for (let i = 0; i < dsbt4Slices.length - 1; i++) {
    const cur = registry.get(dsbt4Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsbt4Slices[i + 1];
    }
  }

  // DS-BIS slice tags table: | **DS-BIS-1** | AFK | none | auto_when_green | ... | DS-BIS-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-BIS-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsbisSlices = [...registry.keys()]
    .filter((k) => /^DS-BIS-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-BIS-', ''), 10) -
        Number.parseInt(b.replace('DS-BIS-', ''), 10),
    );
  for (let i = 0; i < dsbisSlices.length - 1; i++) {
    const cur = registry.get(dsbisSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsbisSlices[i + 1];
    }
  }

  // DS-MPV slice tags table: | **DS-MPV-1** | AFK | none | auto_when_green | ... | DS-MPV-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-MPV-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsmpvSlices = [...registry.keys()]
    .filter((k) => /^DS-MPV-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-MPV-', ''), 10) -
        Number.parseInt(b.replace('DS-MPV-', ''), 10),
    );
  for (let i = 0; i < dsmpvSlices.length - 1; i++) {
    const cur = registry.get(dsmpvSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsmpvSlices[i + 1];
    }
  }

  // DS-SPH slice tags table: | **DS-SPH-1** | AFK | none | auto_when_green | ... | DS-SPH-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-SPH-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dssphSlices = [...registry.keys()]
    .filter((k) => /^DS-SPH-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-SPH-', ''), 10) -
        Number.parseInt(b.replace('DS-SPH-', ''), 10),
    );
  for (let i = 0; i < dssphSlices.length - 1; i++) {
    const cur = registry.get(dssphSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dssphSlices[i + 1];
    }
  }

  // DS-ACP slice tags table: | **DS-ACP-1** | AFK | none | auto_when_green | ... | DS-ACP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-ACP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsacpSlices = [...registry.keys()]
    .filter((k) => /^DS-ACP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-ACP-', ''), 10) -
        Number.parseInt(b.replace('DS-ACP-', ''), 10),
    );
  for (let i = 0; i < dsacpSlices.length - 1; i++) {
    const cur = registry.get(dsacpSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsacpSlices[i + 1];
    }
  }

  // DS-FMF slice tags table: | **DS-FMF-1** | AFK | none | auto_when_green | ... | DS-FMF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-FMF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsfmfSlices = [...registry.keys()]
    .filter((k) => /^DS-FMF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-FMF-', ''), 10) -
        Number.parseInt(b.replace('DS-FMF-', ''), 10),
    );
  for (let i = 0; i < dsfmfSlices.length - 1; i++) {
    const cur = registry.get(dsfmfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsfmfSlices[i + 1];
    }
  }

  // DS-M1 slice tags table: | **DS-M1-1** | AFK | none | auto_when_green | ... | DS-M1-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-M1-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dsm1Slices = [...registry.keys()]
    .filter((k) => /^DS-M1-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-M1-', ''), 10) -
        Number.parseInt(b.replace('DS-M1-', ''), 10),
    );
  for (let i = 0; i < dsm1Slices.length - 1; i++) {
    const cur = registry.get(dsm1Slices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dsm1Slices[i + 1];
    }
  }

  // DS-SBM slice tags table: | **DS-SBM-1** | AFK | none | auto_when_green | ... | DS-SBM-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DS-SBM-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dssbmSlices = [...registry.keys()]
    .filter((k) => /^DS-SBM-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DS-SBM-', ''), 10) -
        Number.parseInt(b.replace('DS-SBM-', ''), 10),
    );
  for (let i = 0; i < dssbmSlices.length - 1; i++) {
    const cur = registry.get(dssbmSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dssbmSlices[i + 1];
    }
  }

  // UMP slice tags table: | **UMP-1** | AFK | none | auto_when_green | ... | UMP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(UMP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const umpSlices = [...registry.keys()]
    .filter((k) => /^UMP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('UMP-', ''), 10) -
        Number.parseInt(b.replace('UMP-', ''), 10),
    );
  for (let i = 0; i < umpSlices.length - 1; i++) {
    const cur = registry.get(umpSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = umpSlices[i + 1];
    }
  }

  // DLH slice tags table: | **DLH-1** | AFK | none | auto_when_green | ... | DLH-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLH-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlhSlices = [...registry.keys()]
    .filter((k) => /^DLH-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLH-', ''), 10) -
        Number.parseInt(b.replace('DLH-', ''), 10),
    );
  for (let i = 0; i < dlhSlices.length - 1; i++) {
    const cur = registry.get(dlhSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlhSlices[i + 1];
    }
  }

  // DLR slice tags table: | **DLR-1** | AFK | none | auto_when_green | ... | DLR-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlrSlices = [...registry.keys()]
    .filter((k) => /^DLR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLR-', ''), 10) -
        Number.parseInt(b.replace('DLR-', ''), 10),
    );
  for (let i = 0; i < dlrSlices.length - 1; i++) {
    const cur = registry.get(dlrSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlrSlices[i + 1];
    }
  }

  // COST-UX slice tags table: | **COST-UX-1** | AFK | none | auto_when_green | ... | COST-UX-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(COST-UX-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const costUxSlices = [...registry.keys()]
    .filter((k) => /^COST-UX-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('COST-UX-', ''), 10) -
        Number.parseInt(b.replace('COST-UX-', ''), 10),
    );
  for (let i = 0; i < costUxSlices.length - 1; i++) {
    const cur = registry.get(costUxSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = costUxSlices[i + 1];
    }
  }

  // DSP-PERF slice tags table: | **DSP-PERF-1** | AFK | none | auto_when_green | ... | DSP-PERF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DSP-PERF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dspPerfSlices = [...registry.keys()]
    .filter((k) => /^DSP-PERF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DSP-PERF-', ''), 10) -
        Number.parseInt(b.replace('DSP-PERF-', ''), 10),
    );
  for (let i = 0; i < dspPerfSlices.length - 1; i++) {
    const cur = registry.get(dspPerfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dspPerfSlices[i + 1];
    }
  }

  // DLN slice tags table: | **DLN-1** | AFK | none | auto_when_green | ... | DLN-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLN-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlnSlices = [...registry.keys()]
    .filter((k) => /^DLN-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLN-', ''), 10) -
        Number.parseInt(b.replace('DLN-', ''), 10),
    );
  for (let i = 0; i < dlnSlices.length - 1; i++) {
    const cur = registry.get(dlnSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlnSlices[i + 1];
    }
  }

  // PB-DL-PREF slice tags table: | **PB-DL-PREF-1** | AFK | none | auto_when_green | ... | PB-DL-PREF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PB-DL-PREF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const pbDlPrefSlices = [...registry.keys()]
    .filter((k) => /^PB-DL-PREF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PB-DL-PREF-', ''), 10) -
        Number.parseInt(b.replace('PB-DL-PREF-', ''), 10),
    );
  for (let i = 0; i < pbDlPrefSlices.length - 1; i++) {
    const cur = registry.get(pbDlPrefSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = pbDlPrefSlices[i + 1];
    }
  }

  // PB-DL-FAM slice tags table: | **PB-DL-FAM-1** | AFK | none | auto_when_green | ... | PB-DL-FAM-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PB-DL-FAM-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const pbDlFamSlices = [...registry.keys()]
    .filter((k) => /^PB-DL-FAM-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PB-DL-FAM-', ''), 10) -
        Number.parseInt(b.replace('PB-DL-FAM-', ''), 10),
    );
  for (let i = 0; i < pbDlFamSlices.length - 1; i++) {
    const cur = registry.get(pbDlFamSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = pbDlFamSlices[i + 1];
    }
  }

  // ENTW-DL slice tags table: | **ENTW-DL-1** | AFK | none | auto_when_green | ... | ENTW-DL-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(ENTW-DL-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const entwDlSlices = [...registry.keys()]
    .filter((k) => /^ENTW-DL-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('ENTW-DL-', ''), 10) -
        Number.parseInt(b.replace('ENTW-DL-', ''), 10),
    );
  for (let i = 0; i < entwDlSlices.length - 1; i++) {
    const cur = registry.get(entwDlSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = entwDlSlices[i + 1];
    }
  }

  // DSS slice tags table: | **DSS-1** | AFK | none | auto_when_green | ... | DSS-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DSS-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dssSlices = [...registry.keys()]
    .filter((k) => /^DSS-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DSS-', ''), 10) -
        Number.parseInt(b.replace('DSS-', ''), 10),
    );
  for (let i = 0; i < dssSlices.length - 1; i++) {
    const cur = registry.get(dssSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dssSlices[i + 1];
    }
  }

  // DLF slice tags table: | **DLF-1** | AFK | none | auto_when_green | ... | DLF-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLF-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlfSlices = [...registry.keys()]
    .filter((k) => /^DLF-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLF-', ''), 10) -
        Number.parseInt(b.replace('DLF-', ''), 10),
    );
  for (let i = 0; i < dlfSlices.length - 1; i++) {
    const cur = registry.get(dlfSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlfSlices[i + 1];
    }
  }

  // DLS slice tags table: | **DLS-1** | AFK | none | auto_when_green | ... | DLS-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLS-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlsSlices = [...registry.keys()]
    .filter((k) => /^DLS-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLS-', ''), 10) -
        Number.parseInt(b.replace('DLS-', ''), 10),
    );
  for (let i = 0; i < dlsSlices.length - 1; i++) {
    const cur = registry.get(dlsSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlsSlices[i + 1];
    }
  }

  // DLB slice tags table: | **DLB-1** | AFK | none | auto_when_green | ... | DLB-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLB-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlbSlices = [...registry.keys()]
    .filter((k) => /^DLB-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLB-', ''), 10) -
        Number.parseInt(b.replace('DLB-', ''), 10),
    );
  for (let i = 0; i < dlbSlices.length - 1; i++) {
    const cur = registry.get(dlbSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlbSlices[i + 1];
    }
  }

  // DLP slice tags table: | **DLP-1** | AFK | none | auto_when_green | ... | DLP-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(DLP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const dlpSlices = [...registry.keys()]
    .filter((k) => /^DLP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('DLP-', ''), 10) -
        Number.parseInt(b.replace('DLP-', ''), 10),
    );
  for (let i = 0; i < dlpSlices.length - 1; i++) {
    const cur = registry.get(dlpSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = dlpSlices[i + 1];
    }
  }

  // NAV slice tags table: | **NAV-1** | AFK | none | auto_when_green | ... | NAV-2 |
  for (const m of masterText.matchAll(
    /\|\s*\*\*(NAV-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|\n]*\|\s*([^|\n]+)\s*\|/gi,
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

  const navSlices = [...registry.keys()]
    .filter((k) => /^NAV-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('NAV-', ''), 10) -
        Number.parseInt(b.replace('NAV-', ''), 10),
    );
  for (let i = 0; i < navSlices.length - 1; i++) {
    const cur = registry.get(navSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = navSlices[i + 1];
    }
  }

  // PPE-DIR slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPE-DIR-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppeDirSlices = [...registry.keys()]
    .filter((k) => /^PPE-DIR-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPE-DIR-', ''), 10) -
        Number.parseInt(b.replace('PPE-DIR-', ''), 10),
    );
  for (let i = 0; i < ppeDirSlices.length - 1; i++) {
    const cur = registry.get(ppeDirSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppeDirSlices[i + 1];
    }
  }

  // PPE-HBT slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPE-HBT-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppeHbtSlices = [...registry.keys()]
    .filter((k) => /^PPE-HBT-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPE-HBT-', ''), 10) -
        Number.parseInt(b.replace('PPE-HBT-', ''), 10),
    );
  for (let i = 0; i < ppeHbtSlices.length - 1; i++) {
    const cur = registry.get(ppeHbtSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppeHbtSlices[i + 1];
    }
  }

  // PPE-COMP slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPE-COMP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppeCompSlices = [...registry.keys()]
    .filter((k) => /^PPE-COMP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPE-COMP-', ''), 10) -
        Number.parseInt(b.replace('PPE-COMP-', ''), 10),
    );
  for (let i = 0; i < ppeCompSlices.length - 1; i++) {
    const cur = registry.get(ppeCompSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppeCompSlices[i + 1];
    }
  }

  // PPE-RDUP slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPE-RDUP-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppeRdupSlices = [...registry.keys()]
    .filter((k) => /^PPE-RDUP-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPE-RDUP-', ''), 10) -
        Number.parseInt(b.replace('PPE-RDUP-', ''), 10),
    );
  for (let i = 0; i < ppeRdupSlices.length - 1; i++) {
    const cur = registry.get(ppeRdupSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppeRdupSlices[i + 1];
    }
  }

  // PPE-LPAY slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(PPE-LPAY-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const ppeLpaySlices = [...registry.keys()]
    .filter((k) => /^PPE-LPAY-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('PPE-LPAY-', ''), 10) -
        Number.parseInt(b.replace('PPE-LPAY-', ''), 10),
    );
  for (let i = 0; i < ppeLpaySlices.length - 1; i++) {
    const cur = registry.get(ppeLpaySlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = ppeLpaySlices[i + 1];
    }
  }

  // BLT slice tags table
  for (const m of masterText.matchAll(
    /\|\s*\*\*(BLT-\d+)\*\*\s*\|\s*(AFK|HITL)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*([^|\n]+)\s*\|/gi,
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

  const bltSlices = [...registry.keys()]
    .filter((k) => /^BLT-\d+$/.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.replace('BLT-', ''), 10) -
        Number.parseInt(b.replace('BLT-', ''), 10),
    );
  for (let i = 0; i < bltSlices.length - 1; i++) {
    const cur = registry.get(bltSlices[i]);
    if (cur && !cur.onSuccess) {
      cur.onSuccess = bltSlices[i + 1];
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
