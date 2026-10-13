// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 등록 기기의 자료실 읽기만 허용하고 나머지는 기존 기본 거부를 유지합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { identifyResource, RESOURCE_IDS } from './resources.mjs';
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

const REQUEST_FIELDS = new Set([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256',
  'at', 'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
]);

function connectionInputIsValid(request) {
  // 엔진 계약에 없는 헤더·위치 정보는 받지 않습니다.
  if (Object.keys(request).some(key => !REQUEST_FIELDS.has(key))) return false;
  if (request.schema !== 'aleph.decision.v1' || typeof request.at !== 'string'
      || !request.at.endsWith('Z') || !Number.isFinite(Date.parse(request.at))) return false;
  const signals = request.signals;
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || Object.keys(signals).sort().join(',') !== 'hour,network,region,source') return false;
  if (!Number.isInteger(signals.hour) || signals.hour < 0 || signals.hour > 23) return false;
  if (signals.source === 'none') {
    // 실제 접속의 지역·네트워크는 근거가 없습니다. unknown 그대로 취급합니다.
    if (signals.region !== 'unknown' || signals.network !== 'unknown') return false;
  } else if (signals.source === 'judge_fixture') {
    // 엔진이 전달한 가상 시험 정보이며 실제 위치 증거와 구분합니다.
    if (typeof signals.region !== 'string' || !signals.region.trim()
        || typeof signals.network !== 'string' || !signals.network.trim()) return false;
  } else return false;
  if (!Array.isArray(request.recentEvents) || request.recentEvents.length > 12) return false;
  return request.recentEvents.every(event => event && typeof event === 'object'
    && Object.keys(event).sort().join(',') === 'ageSeconds,count,kind'
    && typeof event.kind === 'string' && event.kind.trim().length > 0
    && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
    && Number.isInteger(event.count) && event.count >= 0);
}

export async function decide(request) {
  if (request.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }
  if (!connectionInputIsValid(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'starter_not_ready',
      ruleIds: ['starter.deny'],
    };
  }
  if (identifyResource(request) === RESOURCE_IDS.notes && request.method === 'GET'
      && ['GET /notes', 'GET /notes/:id'].includes(request.route)) {
    // 학습용 복합 기준: 가상 이른 시각 + 낯선 네트워크 + 최근 다량 행동.
    // 지역은 이 결정에 쓰지 않으며 실제 접속 위치를 추정하지 않습니다.
    const unusualHour = request.signals.hour >= 0 && request.signals.hour < 6;
    const unusualNetwork = request.signals.network === 'unusual';
    const heavyActivity = request.recentEvents.some(event =>
      event.kind === 'risk_signal' && event.ageSeconds <= 300 && event.count >= 20);
    const compoundRisk = request.signals.source === 'judge_fixture'
      && unusualHour && unusualNetwork && heavyActivity;
    const recentlyVerified = request.stepUp?.verified === true
      && Number.isInteger(request.stepUp.authAgeSeconds)
      && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
    if (compoundRisk && !recentlyVerified) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'step_up',
        reasonCode: 'step_up_required',
        ruleIds: ['device_registered', 'step_up_required'],
      };
    }
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered'],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
