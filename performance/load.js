import { commonOptions, positiveNumber } from './helpers/config.js';
import {
  runScenario,
  setupSession,
  summaryOutput,
} from './helpers/scenario.js';

const initial = positiveNumber(__ENV.PERF_LOAD_INITIAL_VUS, 10);
const normal = positiveNumber(__ENV.PERF_LOAD_NORMAL_VUS, 25);
const peak = positiveNumber(__ENV.PERF_LOAD_PEAK_VUS, 50);

export const options = {
  ...commonOptions,
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '15s',
      stages: [
        { duration: __ENV.PERF_LOAD_RAMP_DURATION || '30s', target: initial },
        { duration: __ENV.PERF_LOAD_INITIAL_DURATION || '1m', target: initial },
        {
          duration: __ENV.PERF_LOAD_NORMAL_RAMP_DURATION || '30s',
          target: normal,
        },
        { duration: __ENV.PERF_LOAD_NORMAL_DURATION || '2m', target: normal },
        { duration: __ENV.PERF_LOAD_PEAK_RAMP_DURATION || '30s', target: peak },
        { duration: __ENV.PERF_LOAD_PEAK_DURATION || '2m', target: peak },
        { duration: __ENV.PERF_LOAD_COOLDOWN_DURATION || '30s', target: 0 },
      ],
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
