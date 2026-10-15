import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {kitURL as moduleURL} from './kit.mjs';
import {fields,parseDecimal,valuesFor,limitsFor,validateValue,updateValue,steppedValue} from '../public/guide-adjustment-model.mjs';
import {patchGuideUI} from '../lib/patch.mjs';
const {guideMetrics,alignThreeViews}=await import(moduleURL('public/three-view-data.mjs'));
function fixture(){
  const views=Object.fromEntries(['front','side','back'].map((v,i)=>[v,{path:v+'.png',height:2,y:.8,x:i/10,opacity:.65,locked:false,frame:{top:.1,bottom:.9}}]));
  return {draft:{visible:true,views},direction:'front',sizeBasis:1.6,pending:false,metrics:guideMetrics,align:alignThreeViews};
}
test('Numeric input preserves decimal and negative values; empty or incomplete never becomes zero',()=>{
  for(const [text,value]of[['-0.7',-.7],['−０.７',-.7],[' 128.5 ',128.5],['+.1',.1]])assert.equal(parseDecimal(text),value);
  for(const text of['',' ','-','+','.','Infinity','NaN','1e9','0x20','1,2','12px'])assert.equal(parseDecimal(text),null);
});
test('Official geometry math links scale and feet across three images and preserves paths',()=>{
  const ctx=fixture(),paths=Object.values(ctx.draft.views).map(g=>g.path);
  assert.equal(updateValue(ctx,'scale',128),true);
  assert.equal(updateValue(ctx,'bottom',-.7),true);
  for(const g of Object.values(ctx.draft.views)){assert.ok(Math.abs(guideMetrics(g).height-2.048)<1e-9);assert.ok(Math.abs(guideMetrics(g).bottom+.007)<1e-9);}
  assert.deepEqual(Object.values(ctx.draft.views).map(g=>g.path),paths);
});
test('Horizontal and visibility changes affect only the current direction; percentages are intuitive',()=>{
  const ctx=fixture(),side=structuredClone(ctx.draft.views.side);
  updateValue(ctx,'x',-.2);updateValue(ctx,'opacity',57);
  assert.equal(ctx.draft.views.front.x,-.002);assert.equal(ctx.draft.views.front.opacity,.57);
  assert.deepEqual(ctx.draft.views.side,side);
  updateValue(ctx,'opacity',0);assert.equal(ctx.draft.views.front.opacity,0);
  updateValue(ctx,'opacity',100);assert.equal(ctx.draft.views.front.opacity,1);
});
test('Repeated decimal nudges have no visible drift; Shift uses tenfold precision',()=>{
  const ctx=fixture();updateValue(ctx,'bottom',-.7);
  assert.equal(steppedValue(ctx,'bottom',1),-.6);assert.equal(steppedValue(ctx,'bottom',1,true),.3);
  for(let i=0;i<10;i++)updateValue(ctx,'x',steppedValue(ctx,'x',1));
  assert.equal(valuesFor(ctx).x,1);
});
test('Out of range, pending, missing images and locked placement cannot mutate data',()=>{
  const ctx=fixture(),before=structuredClone(ctx.draft);
  for(const [field,value]of[['scale',0],['scale',100000],['x',1001],['bottom',100000],['opacity',-1],['opacity',101],['x',NaN]])assert.equal(updateValue(ctx,field,value),false);
  ctx.pending=true;assert.equal(updateValue(ctx,'x',1),false);ctx.pending=false;
  assert.deepEqual(ctx.draft,before);
  ctx.draft.views.front.locked=true;
  for(const field of['scale','bottom','x'])assert.equal(updateValue(ctx,field,1),false);
  assert.equal(updateValue(ctx,'opacity',50),true);
  delete ctx.draft.views.front;assert.equal(updateValue(ctx,'x',1),false);
});
test('Different transparent image frames share the official bounded height and feet contract',()=>{
  const ctx=fixture();ctx.draft.views.side.frame={top:.3,bottom:.7};
  for(const field of fields){const [min,max]=limitsFor(ctx,field);assert.ok(min<max);assert.equal(validateValue(ctx,field,min-1),false);assert.equal(validateValue(ctx,field,max+1),false);}
  updateValue(ctx,'scale',200);updateValue(ctx,'bottom',10);
  for(const g of Object.values(ctx.draft.views)){assert.ok(g.height<=20);assert.ok(Math.abs(g.y)<=10);assert.ok(Math.abs(guideMetrics(g).bottom-.1)<1e-9);}
});
test('Entrypoint patch is guarded and upstream form has no personal project condition',async()=>{
  let source=await fs.readFile(moduleURL('public/three-view-ui.mjs'),'utf8');

  const patched=patchGuideUI(source);assert.ok(patched.includes('precision.open();'));assert.ok(!patched.includes('precision.open(projectId==='));
  assert.throws(()=>patchGuideUI('other release'));assert.throws(()=>patchGuideUI(patched));
});
