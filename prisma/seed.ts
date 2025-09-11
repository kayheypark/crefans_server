import { PeriodUnit, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 기본 데이터 생성
  // 재화 전송 사유
  await prisma.transferReason.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "8f4e7c2a-9b1d-4e3f-8a5b-6c9d0e1f2a3b",
        name: "재화 충전",
        description:
          "유저가 사이트 내 재화를 실제 PG사를 통하여 충전한 경우, 해당하는 수량의 사이트 내 재화를 지급하기 위한 전송",
      },
      {
        id: "2d6f8a9c-4e1b-7f3a-9c5e-8b2d4f6a9c1e",
        name: "재화 환불",
        description: "재화 충전을 완료하였지만 정책에 따라 환불하기 위한 전송",
      },
      {
        id: "7b3e9f1c-8d4a-6e2f-1c5b-9f3e7c1d4a6e",
        name: "포스팅 언락",
        description:
          "정책에 의해 공개 기간이 만료된 포스팅의 경우, 해당 포스팅을 언락하기 위해 크리에이터로 대금을 결제하기 위한 전송",
      },
      {
        id: "4a6c8e2f-1d9b-3f7c-8e4a-6c2f8e1d9b3f",
        name: "후원",
        description:
          "어떠한 회원이든 서로 후원이 가능한데, 이 후원을 위한 전송",
      },
      {
        id: "9e1f3c7d-6b4a-8f2e-3c9e-1f7d6b4a8f2e",
        name: "구독",
        description: "일반회원이 크리에이터를 구독하기 위한 전송",
      },
      {
        id: "5c9f1e7d-8a4b-6f2c-9f5c-1e7d8a4b6f2c",
        name: "크리에이터 정산요청",
        description:
          "크리에이터가 본인 지갑에 존재하는 재화를 수익 실현하기 위한 시스템 지갑으로의 전송",
      },
    ],
  });

  // 토큰 타입
  await prisma.tokenType.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "3f7a9c1e-4d6b-8f2a-9c3f-7a1e4d6b8f2a",
        name: "콩",
        symbol: "KNG",
        description: "기본 사이트 내 재화",
        price: 100,
      },
    ],
  });

  // 시스템 지갑 (출발점)
  const existingWallet = await prisma.wallet.findUnique({
    where: { id: "6b8f2a4c-9e1d-7f3a-8f6b-2a4c9e1d7f3a" },
  });

  if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        id: "6b8f2a4c-9e1d-7f3a-8f6b-2a4c9e1d7f3a",
        address: "c5fd6ba5-5b21-4c3c-8f13-3f19e5fc9f58",
        amount: 100000000, //1억개
        token_type_id: "3f7a9c1e-4d6b-8f2a-9c3f-7a1e4d6b8f2a",
      },
    });
  }

  // 크리에이터 카테고리 초기 데이터
  await prisma.creatorCategory.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "1d7f3a8e-6c4b-9f2d-7f1d-3a8e6c4b9f2d",
        name: "ASMR",
        description: "자율감각 쾌감반응 콘텐츠",
        color_code: "#9C27B0",
        icon: "🎧",
        sort_order: 1,
      },
      {
        id: "8e2f4c9a-1d6b-3f7e-2f8e-4c9a1d6b3f7e",
        name: "버튜버",
        description: "가상 캐릭터 기반 콘텐츠 크리에이터",
        color_code: "#E91E63",
        icon: "🎭",
        sort_order: 2,
      },
      {
        id: "a4f6c8e2-9d1b-7f3a-4f6c-8e29d1b7f3a4",
        name: "먹방",
        description: "음식 관련 방송 및 콘텐츠",
        color_code: "#FF5722",
        icon: "🍽️",
        sort_order: 3,
      },
      {
        id: "b9e2f5c8-3a6d-1f4b-9e2f-5c83a6d1f4b9",
        name: "운동",
        description: "피트니스 및 헬스케어 콘텐츠",
        color_code: "#4CAF50",
        icon: "💪",
        sort_order: 4,
      },
      {
        id: "c1f8a5e3-7d4b-9f2c-1f8a-5e37d4b9f2c1",
        name: "게임",
        description: "게임 플레이 및 리뷰 콘텐츠",
        color_code: "#2196F3",
        icon: "🎮",
        sort_order: 5,
      },
      {
        id: "d6c3f9a2-8e5b-4f1d-6c3f-9a28e5b4f1d6",
        name: "주식",
        description: "투자 및 경제 관련 콘텐츠",
        color_code: "#FF9800",
        icon: "📈",
        sort_order: 6,
      },
    ],
  });

  //멤버십 상품 초기 데이터
  await prisma.membershipItem.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "f2a8e4c6-7b3d-9f1a-2a8e-4c67b3d9f1a2",
        name: "멤버십 1",
        benefits: "월 1회 전용 콘텐츠 제공,우선 댓글 답변,전용 커뮤니티 접근",
        price: 10000,
        level: 1,
        creator_id: "502f09cb-9aed-4d16-93e6-b1dc35e98089",
        billing_unit: PeriodUnit.MONTH,
        billing_period: 1,
        trial_unit: PeriodUnit.WEEK,
        trial_period: 7,
      },
    ],
  });

  console.log("All seed data completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
