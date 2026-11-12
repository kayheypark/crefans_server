모두싸인 첨부 문서 (2026-11-12 사용자 결정)
- preferential-terms.html → output/crefans-preferential-terms.pdf: 계약서 제8조의 '별도 서면'. 1쪽. 수치 칸은 비워 둔다(추정 수치를 채우지 않음). 모두싸인 템플릿 ②로 등록하고 회사가 요청자 입력란으로 채운다.
- output/crefans-terms-policy-copy-YYYY-MM-DD.pdf: 서명란 "적용 약관 사본" 첨부용. 서버 LegalDocumentsService.catalog()의 그날 시행 이용약관·운영정책을 그대로 렌더한다. 약관이 바뀌면 다시 만들고, 계약일과 같은 날짜의 사본을 첨부한다.
- 재생성: LEGAL_DIST=<운영 배포 커밋으로 빌드한 crefans_server/dist> node build.cjs (형제 crefans_front의 playwright, Apple SD Gothic Neo 필요). output/build-report.json에 PDF 해시와 약관 버전·해시를 남긴다.
- 검수: 모든 페이지 PNG 육안 확인. 약관 사본은 output/verify-terms-copy.txt처럼 머리말·꼬리말을 뺀 PDF 텍스트에 모든 조 제목·본문이 들어 있는지 대조한다(없는 문장을 넣으면 누락으로 잡히는지 대조 검사 포함).
- 서명용 계약서 본문은 ../design-two-column-20261103/crefans-creator-agreement-two-column.pdf (output/pdf 복사본과 같은 파일, SHA-256 0d17f8e1bc151728ce5ca2a80883001d6d237b902b211f8669ba4d336269628d). 법무 검토 없이 체결하기로 사용자 결정(2026-11-12).
