/**
 * Name pools for procedurally generated players (draft picks, free agents,
 * foreign signings, Asia-quota signings). Player display names are stored
 * without a team prefix; the current team name is combined in only for UI
 * labels.
 */

const KOREAN_SURNAMES: readonly string[] = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍',
  '유', '고', '문', '양', '손', '배', '백', '허', '남', '심',
];

const KOREAN_GIVEN_NAMES: readonly string[] = [
  '민준', '서준', '도윤', '시우', '주원', '하준', '지호', '준서', '준우', '현우',
  '도현', '지훈', '건우', '우진', '선우', '서진', '민재', '현준', '연우', '유준',
  '정우', '승우', '승현', '시윤', '준혁', '은우', '영훈', '동현', '재현', '태양',
  '강산', '도영', '성호', '민호', '태호', '성민', '민기', '지성', '승호', '광민',
  '재호', '영민', '상현', '동훈', '규민', '태민', '진우', '수혁', '광현', '동욱',
];

/** Foreign-player name pools keyed by nationality (used for `origin: 'foreign'`). */
const FOREIGN_NAME_POOLS: Record<string, readonly string[]> = {
  '미국': [
    '타일러 위드너', '코디 폰세', '마이크 모리슨', '라이언 카펜터',
    '알렉스 휠러', '채드 벨', '브룩스 레일리', '자니 클락',
  ],
  '도미니카공화국': [
    '알베르토 바티스타', '라울 알칸타라', '호세 페게로', '윌머 폰트',
    '프란시스코 페냐', '미겔 카스트로', '에르빈 산타나', '페드로 알몬테',
  ],
  '베네수엘라': [
    '카를로스 산타나', '안토니오 산토스', '에디 로사리오', '윌리암 쿠에바스',
    '호세 오수나', '루이스 페르도모', '엔리케 에르난데스', '구스타보 누네즈',
  ],
  '쿠바': [
    '유리스벨 그라시알', '알프레도 데스파이네', '라파엘 오르테가',
    '요엘 에르난데스', '아리엘 마르티네스', '루단 발레',
  ],
};

/** Asia-quota player name pools keyed by nationality (used for `origin: 'asiaQuota'`). */
const ASIA_QUOTA_NAME_POOLS: Record<string, readonly string[]> = {
  '일본': [
    '다나카 유', '사사키 켄', '야마모토 료', '스즈키 하루토', '이토 쇼', '나카무라 다이치',
  ],
  '대만': [
    '린쯔성', '왕보룽', '천관위', '장이신', '곽융린', '천쩌위안',
  ],
  '호주': [
    '라이언 스미스', '잭 윌슨', '트래비스 블랑코', '코너 화이트', '벤 테일러', '루크 하트',
  ],
};

/** Nationalities sampled for `origin: 'foreign'` players. */
export const FOREIGN_NATIONALITIES: readonly string[] = Object.keys(FOREIGN_NAME_POOLS);

/** Nationalities sampled for `origin: 'asiaQuota'` players. */
export const ASIA_QUOTA_NATIONALITIES: readonly string[] = Object.keys(ASIA_QUOTA_NAME_POOLS);

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

/** Generates a Korean surname + given name, e.g. `"김민준"`. */
export function generateKoreanName(rng: () => number): string {
  return `${pick(KOREAN_SURNAMES, rng)}${pick(KOREAN_GIVEN_NAMES, rng)}`;
}

/** Generates a foreign player's name for the given nationality (falls back to a Korean name if unknown). */
export function generateForeignName(nationality: string, rng: () => number): string {
  const pool = FOREIGN_NAME_POOLS[nationality];
  return pool ? pick(pool, rng) : generateKoreanName(rng);
}

/** Generates an Asia-quota player's name for the given nationality (falls back to a Korean name if unknown). */
export function generateAsiaQuotaName(nationality: string, rng: () => number): string {
  const pool = ASIA_QUOTA_NAME_POOLS[nationality];
  return pool ? pick(pool, rng) : generateKoreanName(rng);
}
