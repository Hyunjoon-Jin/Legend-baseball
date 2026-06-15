import type { PlateAppearanceResult, PostseasonRoundName, SubstitutionType } from './api/types';

export const RESULT_LABEL_KO: Record<PlateAppearanceResult, string> = {
  strikeoutSwinging: '삼진(스윙)',
  strikeoutLooking: '삼진(루킹)',
  walk: '볼넷',
  intentionalWalk: '고의4구',
  hitByPitch: '몸에 맞는 볼',
  single: '1루타',
  infieldSingle: '내야 안타',
  double: '2루타',
  triple: '3루타',
  homeRun: '홈런',
  insideTheParkHomeRun: '인사이드 더 파크 홈런',
  groundOut: '땅볼 아웃',
  flyOut: '뜬공 아웃',
  lineOut: '직선타 아웃',
  popOut: '팝업 아웃',
  doublePlay: '병살',
  triplePlay: '삼중살',
  sacrificeFly: '희생플라이',
  sacrificeBunt: '희생번트',
  fieldersChoice: '야수선택',
  reachedOnError: '실책',
  catcherInterference: '포수 방해',
  inningEndingCaughtStealing: '도루 실패(이닝 종료)',
};

export const ROUND_LABEL_KO: Record<PostseasonRoundName, string> = {
  wildCard: '와일드카드',
  semiPlayoff: '준플레이오프',
  playoff: '플레이오프',
  koreanSeries: '한국시리즈',
};

export const SUBSTITUTION_LABEL_KO: Record<SubstitutionType, string> = {
  pitchingChange: '투수교체',
  pinchHitter: '대타',
  pinchRunner: '대주자',
};

export const WIND_DIRECTION_LABEL_KO: Record<string, string> = {
  none: '무풍',
  out: '바람 나감 (홈런 유리)',
  in: '바람 불어옴 (홈런 불리)',
  crosswind: '횡풍',
};
