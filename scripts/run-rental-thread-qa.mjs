import RentalThreadTimelineService from '../src/services/RentalThreadTimelineService.js';
import {
  getCanonicalRentalStage,
  getRentalBucket,
  getRentalConditionSummaryLabel,
  getRentalDepositSummaryLabel,
  getRentalExtensionSummaryLabel,
  getRentalPaymentSummaryLabel,
  getRentalThreadPresentation,
  normalizeRentalThreadContext,
} from '../src/utils/rentalThreadState.js';
import { RENTAL_THREAD_QA_SCENARIOS } from '../src/dev/rentalThreadQaFixtures.js';

const includesText = (value, expected) =>
  String(value || '').toLowerCase().includes(String(expected || '').toLowerCase());

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const formatCheck = (label, value) => `  - ${label}: ${value}`;

const runScenario = (scenario) => {
  const rental = normalizeRentalThreadContext(scenario.rental);
  const timeline = RentalThreadTimelineService.buildTimeline(rental);
  const presentation = getRentalThreadPresentation(rental, timeline, { isFrench: false });
  const stage = getCanonicalRentalStage(rental, timeline);
  const bucket = getRentalBucket(rental, timeline, new Date('2026-04-23T12:00:00.000Z'));
  const paymentLabel = getRentalPaymentSummaryLabel(rental, { isFrench: false, locale: 'en' });
  const depositLabel = getRentalDepositSummaryLabel(rental, { isFrench: false, locale: 'en' });
  const extensionLabel = getRentalExtensionSummaryLabel(rental, { isFrench: false });
  const conditionLabel = getRentalConditionSummaryLabel(rental, { isFrench: false });
  const timelineTypes = timeline.map((event) => String(event?.payload?.rentalEventType || event?.event_type || '').trim().toLowerCase());

  assert(stage === scenario.expect.stage, `expected stage "${scenario.expect.stage}", got "${stage}"`);
  assert(bucket === scenario.expect.bucket, `expected bucket "${scenario.expect.bucket}", got "${bucket}"`);

  for (const eventType of scenario.expect.eventTypes || []) {
    assert(
      timelineTypes.includes(String(eventType).toLowerCase()),
      `expected event type "${eventType}" in [${timelineTypes.join(', ')}]`
    );
  }

  assert(
    includesText(paymentLabel, scenario.expect.paymentIncludes),
    `expected payment label to include "${scenario.expect.paymentIncludes}", got "${paymentLabel}"`
  );
  assert(
    includesText(depositLabel, scenario.expect.depositIncludes),
    `expected deposit label to include "${scenario.expect.depositIncludes}", got "${depositLabel}"`
  );
  assert(
    includesText(extensionLabel, scenario.expect.extensionIncludes),
    `expected extension label to include "${scenario.expect.extensionIncludes}", got "${extensionLabel}"`
  );
  assert(
    includesText(conditionLabel, scenario.expect.conditionIncludes),
    `expected condition label to include "${scenario.expect.conditionIncludes}", got "${conditionLabel}"`
  );

  return {
    id: scenario.id,
    title: scenario.title,
    stage,
    bucket,
    label: presentation.label,
    nextAction: presentation.nextAction,
    timelineTypes,
    paymentLabel,
    depositLabel,
    extensionLabel,
    conditionLabel,
  };
};

const main = () => {
  const results = [];
  const failures = [];

  for (const scenario of RENTAL_THREAD_QA_SCENARIOS) {
    try {
      results.push(runScenario(scenario));
    } catch (error) {
      failures.push({
        id: scenario.id,
        title: scenario.title,
        message: error?.message || String(error),
      });
    }
  }

  console.log('Rental Thread QA');
  console.log(`Scenarios: ${RENTAL_THREAD_QA_SCENARIOS.length}`);
  console.log(`Passed: ${results.length}`);
  console.log(`Failed: ${failures.length}`);
  console.log('');

  results.forEach((result) => {
    console.log(`PASS ${result.id} — ${result.title}`);
    console.log(formatCheck('stage', result.stage));
    console.log(formatCheck('bucket', result.bucket));
    console.log(formatCheck('label', result.label));
    console.log(formatCheck('payment', result.paymentLabel));
    console.log(formatCheck('deposit', result.depositLabel));
    console.log(formatCheck('extension', result.extensionLabel));
    console.log(formatCheck('condition', result.conditionLabel));
    console.log(formatCheck('events', result.timelineTypes.join(', ')));
    console.log('');
  });

  if (failures.length > 0) {
    failures.forEach((failure) => {
      console.error(`FAIL ${failure.id} — ${failure.title}`);
      console.error(formatCheck('reason', failure.message));
      console.error('');
    });
    process.exitCode = 1;
    return;
  }

  console.log('All rental thread QA scenarios passed.');
};

main();
