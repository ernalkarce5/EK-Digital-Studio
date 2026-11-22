// Single import point for Zod.
//
// `jitless` stops Zod from probing `new Function` (its optional JIT fast path).
// That probe is caught by Zod, but a strict Content-Security-Policy without
// 'unsafe-eval' still reports it as a violation. Validation behaves identically.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
