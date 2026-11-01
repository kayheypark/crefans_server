// Subscribing shows the subscriber to the creator (a separate seller), which is a third-party provision needing consent
// (개인정보 보호법 제17조제1항제1호, /pilot-work 2026-10-30). The front shows the same text and sends this version back.
export const CREATOR_PROVISION={
 version:'2026-10-30.1',
 recipient:'가입하는 멤버십의 크리에이터',
 items:'닉네임, 프로필 식별명, 프로필 사진, 구독 상품, 구독 시작·갱신·종료일과 상태',
 purpose:'멤버십 혜택 제공과 구독자 관리',
 retention:'회원 탈퇴 시까지(구독이 끝난 뒤에도 구독 이력으로 표시, 탈퇴 후에는 “탈퇴한 사용자”로 표시)',
 refusal:'동의하지 않으면 멤버십에 가입할 수 없습니다.',
} as const;
// A tip shows the sender to the creator in the received-tips list, the same kind of provision (2026-10-30).
export const TIP_PROVISION={
 version:'2026-10-30.1',
 recipient:'후원받는 크리에이터',
 items:'닉네임, 후원 수량·메시지·일시, 후원한 게시물',
 purpose:'후원 확인과 감사 표시',
 retention:'회원 탈퇴 시까지(탈퇴 후에는 “탈퇴한 회원”으로 표시)',
 refusal:'동의하지 않으면 후원할 수 없습니다.',
} as const;
