// SNS 링크 저장 규칙(2026-11-08): 칸마다 해당 서비스 주소·아이디만, 정규 주소로 저장, 기존 다른 형식 주소는 그대로 다시 보낼 때만 유지.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeSocialLinks}=require('../dist/src/platform/social-links');
const fails=(input,prev)=>assert.throws(()=>normalizeSocialLinks(input,prev),e=>e.getStatus?.()===400&&JSON.stringify(e.getResponse()).includes('INVALID_URL'));
test('handle URLs are saved in canonical full form',()=>{
 assert.deepEqual(normalizeSocialLinks({instagram:'https://www.instagram.com/crefans.official/',youtube:'http://m.youtube.com/@crefans',facebook:'https://facebook.com/crefans'},{}),
  {instagram:'https://instagram.com/crefans.official',youtube:'https://youtube.com/@crefans',facebook:'https://facebook.com/crefans'});
 assert.deepEqual(normalizeSocialLinks({instagram:'',youtube:'  '},{}),{});
 assert.deepEqual(normalizeSocialLinks(undefined,null),{});
});
test('a field only accepts its own service and safe handle characters',()=>{
 fails({instagram:'https://evil.example/crefans'},{});
 fails({instagram:'https://youtube.com/@crefans'},{});
 fails({youtube:'https://youtube.com/channel/UC123'},{});
 fails({instagram:'https://instagram.com/cre fans'},{});
 fails({instagram:'javascript:alert(1)'},{});
 fails({instagram:'crefans'},{});
 fails({facebook:123},{});
});
test('a previously saved other-format URL is kept only when sent back unchanged',()=>{
 const prev={youtube:'https://youtube.com/channel/UC123'};
 assert.deepEqual(normalizeSocialLinks({youtube:'https://youtube.com/channel/UC123'},prev),{youtube:'https://youtube.com/channel/UC123'});
 fails({youtube:'https://youtube.com/channel/UC999'},prev);
});
