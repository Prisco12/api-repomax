import { commonOptions, positiveNumber } from './helpers/config.js';
import {
  runScenario,
  setupSession,
  summaryOutput,
} from './helpers/scenario.js';

export const options = {
  ...commonOptions,
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: positiveNumber(__ENV.PERF_SMOKE_VUS, 2),
      duration: __ENV.PERF_SMOKE_DURATION || '30s',
    },
  },
};

export function setup() {
  return setupSession();
}

export default function (data) {
  runScenario(data);
}

export function handleSummary(data) {
  return summaryOutput(data);
}
