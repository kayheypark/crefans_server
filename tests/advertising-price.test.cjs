const {test}=require('node:test'),assert=require('node:assert/strict');
const {adProductInput,adProductView}=require('../dist/src/platform/advertising-catalog');
const input={name:'기간 2배',description:'총 2일',terms:'상품 안내',placement:'featured_creator',amount:3900,durationDays:2,visible:true,onSale:true,sortOrder:0};
test('four event products retain total durations and calculate 50% against the stated comparison price',()=>{
 for(const [days,amount] of [[2,3900],[6,11700],[14,27300],[60,117000]]){
  const row=adProductInput({...input,durationDays:days,amount,comparisonAmount:amount*2,comparisonBasis:`일반 상품 2회(${days}일) 기준`});
  const view=adProductView(row);assert.equal(view.durationDays,days);assert.equal(view.amount,amount);assert.equal(view.comparisonAmount,amount*2);assert.equal(view.discountPercent,50);assert.match(view.comparisonBasis,/일반 상품/);
 }
});
test('ordinary products have no discount and omitted fields preserve legacy update compatibility',()=>{
 const row=adProductInput(input);assert.equal(Object.hasOwn(row,'comparison_amount'),false);
 assert.equal(adProductView(row).comparisonAmount,null);assert.equal(adProductView(row).discountPercent,null);
 const cleared=adProductInput({...input,comparisonAmount:null,comparisonBasis:''});assert.equal(cleared.comparison_amount,null);assert.equal(cleared.comparison_basis,'');
});
test('invalid comparisons and a missing explanation are rejected; fractional rates round down',()=>{
 for(const patch of [{comparisonAmount:3900,comparisonBasis:'기준'},{comparisonAmount:3899,comparisonBasis:'기준'},{comparisonAmount:7800.5,comparisonBasis:'기준'},{comparisonAmount:10000001,comparisonBasis:'기준'},{comparisonAmount:7800},{comparisonAmount:7800,comparisonBasis:' '},{comparisonAmount:null,comparisonBasis:'기준'},{comparisonBasis:'기준'}])assert.throws(()=>adProductInput({...input,...patch}));
 assert.equal(adProductView({amount:6700,comparison_amount:10000}).discountPercent,33);
});
