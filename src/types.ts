export interface STARData {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface CheatKeyProject {
  id: string;
  companyName: string;
  jobTitle: string;
  rawExperience: string;
  rawJobAd: string;
  starData: STARData;
  question: string;
  targetLength: number; // 목표 글자수
  tone: string; // 톤앤매너
  generatedCoverLetter: string;
  createdAt: string;
  updatedAt: string;
}

export type StepType = 'info' | 'star' | 'final' | 'history';

export const TONE_PRESETS = [
  { id: 'professional', label: '신뢰감 있는 (전문성 강조)', desc: '지적이고 신뢰할 수 있는 비즈니스 어조로 역량 중심 설명' },
  { id: 'sincere', label: '진중한 (성실함과 태도 강조)', desc: '책임감 있고 차분하며 조직 융화력을 돋보이게 하는 어조' },
  { id: 'challenging', label: '도전적인 (열정과 성장 중심)', desc: '적극적이고 진취적이며 문제 해결의 패기를 표현하는 어조' },
  { id: 'innovative', label: '혁신적인 (창의성과 유연함)', desc: '새로운 시각과 트렌디함을 무기로 창의성을 부각하는 어조' },
];

export const QUESTION_PRESETS = [
  '본인의 핵심 역량과 이를 개발하기 위해 노력했던 과정을 구체적으로 기술해 주십시오.',
  '공동의 목표를 달성하기 위해 타인과 협업하는 과정에서 갈등을 극복한 경험을 기술해 주십시오.',
  '예상치 못한 문제나 어려움에 맞닥뜨렸을 때 적극적으로 대안을 찾아 해결한 경험을 기술해 주십시오.',
  '지원 직무에 관심을 갖게 된 계기와 이를 위해 본인이 준비해 온 차별화된 노력을 서술해 주십시오.',
];
