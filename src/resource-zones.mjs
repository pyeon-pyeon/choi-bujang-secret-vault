// 서버 운영 설정으로 공급한 권한만 사용합니다. 요청 본문·헤더·role은 사용하지 않습니다.
// 실제 주체 ID는 Git에 저장하지 않고 판정기 서버 환경의 RESOURCE_ZONES_JSON에 둡니다.
export function hasZoneAccess(request, zones) {
  if (!Array.isArray(zones) || typeof request.subjectId !== 'string') return false;
  if (request.queryLength !== 0) return false; // 자료 ID는 path로만 선택합니다.
  return zones.some(zone => zone && zone.classId === request.classId
    && zone.projectId === request.projectId && zone.service === request.service
    && zone.path === request.path && zone.subjectId === request.subjectId
    && Array.isArray(zone.methods) && zone.methods.includes(request.method));
}

export function serverZones() {
  try {
    const value = JSON.parse(process.env.RESOURCE_ZONES_JSON || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
