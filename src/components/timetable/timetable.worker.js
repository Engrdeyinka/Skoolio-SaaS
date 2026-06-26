/**
 * Timetable Web Worker
 * Runs solver algorithms off the main thread so the browser stays responsive.
 *
 * Messages in:  { type: 'generate' | 'deepOptimize', payload: { ... } }
 * Messages out: { type: 'result', payload: { ... } }
 *               { type: 'error',  payload: { message } }
 */

import { generateAllTimetables, deepOptimize } from './cspsa-solver.js';
import { generateCPSAT } from './cpsat/solver.jsx';
import { generateAdaptive } from './adaptive/solver.js';

self.onmessage = function (e) {
  const { type, payload } = e.data;
  const emitProgress = (phase, percent) => {
    self.postMessage({ type: 'progress', payload: { phase, percent } });
  };
  try {
    let result;
    if (type === 'generate') {
      emitProgress('Preparing constraints...', 10);
      if (payload.algorithm === 'cpsat_lns') {
        emitProgress('Running CP-SAT feasibility search...', 35);
        result = generateCPSAT(payload);
        emitProgress('Applying LNS improvements...', 85);
      } else if (payload.algorithm === 'adaptive_tabu') {
        emitProgress('Running multi-restart CSP...', 35);
        result = generateAdaptive({ ...payload, onProgress: emitProgress });
        emitProgress('Running tabu optimization...', 85);
      } else {
        emitProgress('Running greedy placement...', 35);
        result = generateAllTimetables(payload);
        emitProgress('Running repair and optimization...', 85);
      }
    } else if (type === 'deepOptimize') {
      emitProgress('Rebuilding current timetable state...', 20);
      result = deepOptimize(payload);
      emitProgress('Applying deep optimization passes...', 85);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    emitProgress('Finalizing output...', 98);
    self.postMessage({ type: 'result', payload: result });
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: err?.message || String(err) } });
  }
};
