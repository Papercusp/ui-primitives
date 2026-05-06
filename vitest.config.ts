import { defineVitestConfig } from '@papercusp/test-config';

const cfg = defineVitestConfig({ layer: 'unit' });
cfg.test = { ...(cfg.test ?? {}), environment: 'jsdom' };
cfg.esbuild = { ...(cfg.esbuild ?? {}), jsx: 'automatic' };
export default cfg;
