import { commonOptions, positiveNumber } from './helpers/config.js';
import {
  runScenario,
  setupSession,
  summaryOutput,
} from './helpers/scenario.js';

const first = positiveNumber(__ENV.PERF_STRESS_INITIAL_VUS, 50);
const second = positiveNumber(__ENV.PERF_STRESS_SECOND_VUS, 100);
const third = positiveNumber(__ENV.PERF_STRESS_THIRD_VUS, 200);

export const options = {
  ...commonOptions,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '30s',
      stages: [
        { duration: __ENV.PERF_STRESS_RAMP_DURATION || '1m', target: first },
        { duration: __ENV.PERF_STRESS_STAGE_DURATION || '2m', target: first },
        { duration: __ENV.PERF_STRESS_RAMP_DURATION || '1m', target: second },
        { duration: __ENV.PERF_STRESS_STAGE_DURATION || '2m', target: second },
        { duration: __ENV.PERF_STRESS_RAMP_DURATION || '1m', target: third },
        { duration: __ENV.PERF_STRESS_STAGE_DURATION || '2m', target: third },
        { duration: __ENV.PERF_STRESS_COOLDOWN_DURATION || '1m', target: 0 },
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
