const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {operationsAlertText}=require('../dist/src/platform/operations.service');
const {AI_PHOTO_COSTUME_IDS,costumeEnglishName,costumeReferenceIds}=require('../dist/src/platform/ai-photo-costume-references');

function text(type,data){
 return operationsAlertText({type,data,ip:null,peer_ip:null,created_at:new Date(0),id:'event',request_id:'request'},'synthetic');
}

test('every supported costume and its previous asset name map to the same public English label',()=>{
 const aliases=fs.readdirSync(path.join(__dirname,'../src/platform/ai-photo-costumes')).filter(name=>name.endsWith('-v2.webp'));
 const mapped=new Set();
 for(const file of aliases){
  const alias=file.slice(0,-'-v2.webp'.length),[id]=costumeReferenceIds([alias],['outfit'],'cosplay');
  const name=costumeEnglishName(id);
  assert.match(name,/[A-Za-z]/,id);assert.doesNotMatch(name,/^[0-9a-f]{6}$|[\r\n가-힣]/,id);
  assert.equal(costumeEnglishName(alias),name,alias);
  mapped.add(id);
 }
 assert.deepEqual(mapped,new Set(AI_PHOTO_COSTUME_IDS));
 assert.equal(costumeEnglishName('4a0c8f'),'Modernia');
 assert.equal(costumeEnglishName('overwatch-dva'),'D.Va');
 assert.equal(costumeEnglishName('80bdd0'),'Shiroko');
 for(const unknown of ['abcdef','private-input','__proto__'])assert.equal(costumeEnglishName(unknown),undefined);
});

test('already queued success alerts show character names and preserve the remaining presets',()=>{
 const old=text('ai-photo.succeeded',{presets:'outfit:80bdd0, outfit:abcdef, outfit:70219a, pose:의자에 앉기, background:b7a101'});
 assert.match(old,/^의상: Shiroko, D\.Va$/m);
 assert.match(old,/^presets: pose:의자에 앉기, background:b7a101$/m);
 assert.doesNotMatch(old,/outfit:|80bdd0|abcdef|70219a/);
 const unrelated=text('ai-photo.succeeded',{presets:'pose:팔을 들기'});
 assert.match(unrelated,/^presets: pose:팔을 들기$/m);
 assert.doesNotMatch(unrelated,/의상:/);
});

test('all fourteen selected costumes remain visible in order in success and failure alerts',()=>{
 const ids=['3fce14','6c24e4','6c0778','ecd733','89f2c8','a187d7','18ebd0','2bce38','7b7593','4df3c5','82acd0','0d0a26','0b39ff','19fc2f'];
 const names=ids.map(costumeEnglishName);
 for(const type of ['ai-photo.succeeded','ai-photo.failed']){
  const rendered=text(type,{costumeIds:ids.join(',')});
  assert.ok(rendered.split('\n').includes('의상: '+names.join(', ')));
  assert.doesNotMatch(rendered,new RegExp('costumeIds|'+ids.join('|')));
 }
});
