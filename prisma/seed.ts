import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 기본 데이터 생성
  // 재화 전송 사유
  await prisma.transferReason.createMany({
    data: [
      {
        id: 1,
        name: "재화 충전",
        description:
          "유저가 사이트 내 재화를 실제 PG사를 통하여 충전한 경우, 해당하는 수량의 사이트 내 재화를 지급하기 위한 전송",
      },
      {
        id: 2,
        name: "재화 환불",
        description: "재화 충전을 완료하였지만 정책에 따라 환불하기 위한 전송",
      },
      {
        id: 3,
        name: "포스팅 언락",
        description:
          "정책에 의해 공개 기간이 만료된 포스팅의 경우, 해당 포스팅을 언락하기 위해 크리에이터로 대금을 결제하기 위한 전송",
      },
      {
        id: 4,
        name: "후원",
        description:
          "어떠한 회원이든 서로 후원이 가능한데, 이 후원을 위한 전송",
      },
      {
        id: 5,
        name: "구독",
        description: "일반회원이 크리에이터를 구독하기 위한 전송",
      },
      {
        id: 6,
        name: "크리에이터 정산요청",
        description:
          "크리에이터가 본인 지갑에 존재하는 재화를 수익 실현하기 위한 시스템 지갑으로의 전송",
      },
    ],
  });

  // 토큰 타입
  await prisma.tokenType.createMany({
    data: [
      { id: 1, name: "콩", symbol: "KNG", description: "기본 사이트 내 재화" },
    ],
  });

  // 시스템 지갑 (출발점)
  await prisma.wallet.create({
    data: {
      id: 1,
      address: "c5fd6ba5-5b21-4c3c-8f13-3f19e5fc9f58",
      amount: 100000000, //1억개
      token_type_id: 1,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
