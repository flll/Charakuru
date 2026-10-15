import {language} from './i18n.mjs';
import {translateGuide,rangeMessage} from './guide-adjustment-i18n.mjs';
import {guideMetrics, alignThreeViews} from './three-view-data.mjs';
import {fields, parseDecimal, valuesFor, limitsFor, validateValue, updateValue, steppedValue} from './guide-adjustment-model.mjs';

const say=(ja,en)=>translateGuide(ja,en,language());
const copy = (ja, en) => `<span translate="no" data-ja="${ja}" data-en="${en}">${ja}</span>`;
const definitions = {
  scale: ['画像の大きさ', 'Image size', '%', '−', '＋', '小さく', '大きく', 'Smaller', 'Larger'],
  bottom: ['足元の高さ', 'Foot height', 'cm', '↓', '↑', '下へ', '上へ', 'Down', 'Up'],
  x: ['左右の位置', 'Horizontal position', 'cm', '←', '→', '左へ', '右へ', 'Left', 'Right'],
  opacity: ['画像の濃さ', 'Image visibility', '%', '−', '＋', '薄く', '濃く', 'Fainter', 'Stronger'],
};

export function createGuideAdjustmentUI(dialog, context, refresh) {
  const $ = selector => dialog.querySelector(selector);
  const original = [...dialog.childNodes];
  const originalControls = $('.three-view-controls');
  const originalHelp = [...dialog.querySelectorAll('.three-view-help')];
  const top = $('.dialog-top'), toolbar = $('.three-view-toolbar'), preview = $('#threeViewPreview');
  const filename = $('#threeViewFilename'), sideHelp = $('#threeViewSideHelp');
  const actions = $('.three-view-actions'), error = $('#threeViewError');
  const layout = document.createElement('div'); layout.className = 'ga-workspace';
  layout.innerHTML = `<section class="ga-stage"><div class="ga-preview-slot"></div><div class="ga-image-meta"></div><div class="ga-preview-tools"><p class="ga-drag-tip">${copy('画像をドラッグして移動', 'Drag the image to move it')}</p><button type="button" data-ga-fit>${copy('全体を見る', 'Fit image and model')}</button></div></section>
    <section class="ga-settings" translate="no" aria-label="Image adjustments">
    <div class="ga-group"><h3>${copy('全方向をそろえる', 'Align all views')}<span class="ga-scope">${copy('3方向に反映', 'All 3 views')}</span></h3><div data-ga-group="shared"></div></div>
    <div class="ga-group"><h3>${copy('この方向を合わせる', 'Adjust this view')}<span class="ga-scope ga-current"></span></h3><div data-ga-group="current"></div></div>
    <p class="ga-key-help">${copy('数値を入力してEnter。↑↓でも微調整できます。Shiftを押すと10倍ずつ。', 'Type a value and press Enter. Arrow keys adjust it; hold Shift for 10× steps.')}</p>
    <p class="ga-status" aria-live="polite"></p><p class="ga-error" role="alert" hidden></p></section>`;
  for (const [key, [ja, en, unit, minus, plus, minusJa, plusJa, minusEn, plusEn]] of Object.entries(definitions)) {
    const row = document.createElement('div'); row.className = 'ga-field'; row.dataset.field = key;
    const action = key === 'scale' ? ['モデルと同じ大きさ', 'Match model height', 'model'] : key === 'bottom' ? ['モデルの足元に合わせる', 'Match model feet', 'floor'] : key === 'x' ? ['中央に戻す', 'Center', 'center'] : null;
    row.innerHTML = `<label for="ga-${key}">${copy(ja, en)}</label>
      <div class="ga-stepper"><button type="button" data-ga-step="-1" aria-label="${minusJa}" title="${minusJa}">${minus}</button>
      <div class="ga-value"><input id="ga-${key}" type="text" inputmode="decimal" role="spinbutton" autocomplete="off" spellcheck="false" translate="no" aria-describedby="ga-${key}-hint"><span>${unit}</span></div>
      <button type="button" data-ga-step="1" aria-label="${plusJa}" title="${plusJa}">${plus}</button></div>
      <div class="ga-field-foot"><span id="ga-${key}-hint" class="ga-value-hint"></span>${action ? `<button type="button" class="ga-anchor" data-ga-anchor="${action[2]}">${copy(action[0], action[1])}</button>` : ''}</div>
      ${key === 'opacity' ? `<div class="ga-presets" role="group" aria-label="画像の濃さの目安">${[[25,'薄く','Faint'],[50,'半透明','Half'],[100,'くっきり','Full']].map(([value,j,e])=>`<button type="button" data-ga-opacity="${value}" aria-pressed="false">${copy(j,e)}<small>${value}%</small></button>`).join('')}</div>` : ''}`;
    const buttons = row.querySelectorAll('[data-ga-step]');
    buttons[0].dataset.labelJa = minusJa; buttons[0].dataset.labelEn = minusEn;
    buttons[1].dataset.labelJa = plusJa; buttons[1].dataset.labelEn = plusEn;
    layout.querySelector(`[data-ga-group="${key==='scale'||key==='bottom'?'shared':'current'}"]`).append(row);
  }
  const intro = document.createElement('p'); intro.className = 'ga-intro';
  intro.innerHTML = copy('三面図の画像をモデルに重ね合わせます。調整した内容は「適用」で反映されます。', 'Align the reference images over the model. Choose Apply to keep your adjustments.');
  const footerNote = document.createElement('span'); footerNote.className = 'ga-footer-note';
  footerNote.innerHTML = copy('モデルの形は変わりません', 'Model geometry stays unchanged');
  const editing = new Set();
  let active = false, previousDirection = null, invalid = false, needsFit = true;
  const get = () => ({...context(), metrics: guideMetrics, align: alignThreeViews});
  const localError = layout.querySelector('.ga-error');
  const inputs = Object.fromEntries(fields.map(key=>[key, layout.querySelector('#ga-'+key)]));
  // Only the preview camera changes; the guide and model coordinates stay untouched.
  function fitPreview() {
    const ctx=get(),camera=ctx.modalCamera,guide=ctx.draft?.views[ctx.direction];
    if(!active||ctx.pending||!camera||!guide)return;
    const rect=preview.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const box=ctx.bounds.clone(),asset=ctx.draftAssets.find(a=>a.path===guide.path),width=guide.height*(asset?.width||1)/(asset?.height||1);
    const axis=ctx.direction==='side'?'z':'x',center=ctx.direction==='back'?-guide.x:guide.x;
    box.min[axis]=Math.min(box.min[axis],center-width/2);box.max[axis]=Math.max(box.max[axis],center+width/2);
    box.min.y=Math.min(box.min.y,guide.y-guide.height/2);box.max.y=Math.max(box.max.y,guide.y+guide.height/2);
    const target=box.getCenter(camera.position.clone()),size=box.getSize(camera.position.clone()),distance=Math.max(5,ctx.bounds.getSize(camera.position.clone()).length()*2);
    const forward=camera.getWorldDirection(camera.position.clone());camera.position.copy(target).addScaledVector(forward,-distance);camera.lookAt(target);
    const span=Math.max(size.y,size[axis]/(rect.width/rect.height),.1)*1.08;
    camera.left=-span*rect.width/rect.height/2;camera.right=-camera.left;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  layout.querySelector('[data-ga-fit]').onclick=()=>{if(commitAll())fitPreview();};
  function message(text='') { localError.hidden=!text; localError.textContent=text; }
  function translate() {
    for (const el of dialog.querySelectorAll('[data-ja]')) el.textContent=say(el.dataset.ja,el.dataset.en);
    for (const el of layout.querySelectorAll('[data-label-ja]')) {el.title=say(el.dataset.labelJa,el.dataset.labelEn);el.setAttribute('aria-label',el.title);}
    layout.querySelector('.ga-settings').setAttribute('aria-label',say('画像の調整','Image adjustments'));
    layout.querySelector('.ga-presets').setAttribute('aria-label',say('画像の濃さの目安','Image visibility presets'));
  }
  function setActive(enable = true) {
    editing.clear(); invalid=false; previousDirection=null; needsFit=true; message();
    if (enable === active) return;
    active=enable; dialog.classList.toggle('ga-dialog',active);
    if (!active) { originalControls.hidden=false; for(const h of originalHelp)h.hidden=false; footerNote.remove(); dialog.replaceChildren(...original); return; }
    if (!document.querySelector('link[data-guide-adjustment]')) {
      const style=document.createElement('link'); style.rel='stylesheet'; style.href=new URL('./guide-adjustment.css',import.meta.url).href; style.dataset.guideAdjustment=''; document.head.append(style);
    }
    originalControls.hidden=true; for(const h of originalHelp)h.hidden=true;
    layout.querySelector('.ga-preview-slot').append(preview);
    layout.querySelector('.ga-image-meta').append(filename,sideHelp);
    actions.prepend(footerNote);
    dialog.replaceChildren(top,intro,toolbar,layout,originalControls,error,actions);
    translate();
  }
  function inputError(key) {
    const ctx=get(), value=parseDecimal(inputs[key].value);
    // Unedited formatted text is never written back over its exact stored value.
    if(!editing.has(key))return '';
    if (value===null) return say('数値を入力してください。例：−0.7', 'Enter a number, for example −0.7.');
    if (!validateValue(ctx,key,value)) {
      const [min,max]=limitsFor(ctx,key);
      return rangeMessage(min,max,language());
    }
    return '';
  }
  function validateEditing() {
    invalid=[...editing].some(key=>!!inputError(key));
    for(const [key,input]of Object.entries(inputs))input.setAttribute('aria-invalid',String(editing.has(key)&&!!inputError(key)));
    $('#applyThreeViews').disabled=get().pending||invalid;
    for(const button of toolbar.querySelectorAll('button'))button.disabled=get().pending||invalid;
    return !invalid;
  }
  function commit(key) {
    if(!editing.has(key))return true;
    if (!active||inputs[key].disabled) return false;
    const problem=inputError(key);
    if(problem){validateEditing();message(problem);return false;}
    const applied=updateValue(get(),key,parseDecimal(inputs[key].value));
    if(applied){editing.delete(key);message();refresh();if(invalid)message(inputError([...editing].find(k=>inputError(k))));}
    return applied;
  }
  function commitAll() {
    if(!active)return true;
    const bad=[...editing].find(key=>inputError(key));
    if(bad){validateEditing();message(inputError(bad));return false;}
    for(const key of [...editing])if(!commit(key))return false;
    return true;
  }
  function change(key,value) {
    if (!commitAll()) return;
    if(updateValue(get(),key,value)){message();refresh();}
  }
  for(const key of fields) {
    const input=inputs[key], row=input.closest('.ga-field');
    input.addEventListener('input',()=>{editing.add(key);message();validateEditing();});
    input.addEventListener('change',()=>commit(key));
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit(key);}
      if(event.key==='Escape'&&editing.has(key)){event.preventDefault();event.stopPropagation();editing.delete(key);message();sync();}
      if(event.key==='ArrowUp'||event.key==='ArrowDown'){
        event.preventDefault();if(!commitAll())return;
        change(key,steppedValue(get(),key,event.key==='ArrowUp'?1:-1,event.shiftKey));
      }
    });
    for(const button of row.querySelectorAll('[data-ga-step]'))button.onclick=event=>{
      if(!commitAll())return;
      change(key,steppedValue(get(),key,Number(button.dataset.gaStep),event.shiftKey));
    };
  }
  for(const button of layout.querySelectorAll('[data-ga-anchor]'))button.onclick=()=>{
    const anchor=button.dataset.gaAnchor;
    change(anchor==='model'?'scale':anchor==='floor'?'bottom':'x',anchor==='model'?100:anchor==='floor'?get().bounds.min.y*100:0);
  };
  for(const button of layout.querySelectorAll('[data-ga-opacity]'))button.onclick=()=>change('opacity',Number(button.dataset.gaOpacity));
  $('#applyThreeViews').addEventListener('click',event=>{
    if(active&&!commitAll()){event.preventDefault();event.stopImmediatePropagation();inputs[[...editing].find(key=>inputError(key))||[...editing][0]]?.focus();}
  },true);
  preview.addEventListener('pointerdown',event=>{
    if(active&&event.button===0&&!commitAll()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  toolbar.addEventListener('click',event=>{
    if(active&&event.target.closest('button')&&!commitAll()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  $('#threeViewLock').addEventListener('change',event=>{
    if(!active)return;
    const requested=event.target.checked;
    if(!commitAll()){event.stopImmediatePropagation();event.target.checked=!!get().draft?.views[get().direction]?.locked;}
    else event.target.checked=requested;
  },true);
  function sync() {
    if(!active)return;
    const ctx=get(), values=valuesFor(ctx),guide=ctx.draft?.views[ctx.direction];
    const switched=previousDirection!==ctx.direction;
    if(switched){editing.clear();invalid=false;needsFit=true;message();previousDirection=ctx.direction;}
    if(!guide){editing.clear();invalid=false;message();}
    translate();
    layout.querySelector('.ga-current').textContent=say({front:'正面のみ',side:'側面のみ',back:'背面のみ'}[ctx.direction],{front:'Front only',side:'Side only',back:'Back only'}[ctx.direction]);
    for(const key of fields){
      const input=inputs[key], row=input.closest('.ga-field'),disabled=ctx.pending||!guide||(guide.locked&&key!=='opacity');
      input.disabled=disabled;
      const value=values?.[key]??0;
      if(!editing.has(key))input.value=values?String(Number(value.toFixed(3))):'';
      if(values){const [min,max]=limitsFor(ctx,key);input.setAttribute('aria-valuemin',min);input.setAttribute('aria-valuemax',max);input.setAttribute('aria-valuenow',value);}
      else {input.removeAttribute('aria-valuenow');input.removeAttribute('aria-valuemin');input.removeAttribute('aria-valuemax');}
      for(const button of row.querySelectorAll('button'))button.disabled=disabled;
      if(values)for(const button of row.querySelectorAll('[data-ga-step]')){const [min,max]=limitsFor(ctx,key);button.disabled=disabled||(Number(button.dataset.gaStep)<0?value<=min:value>=max);}
    }
    const hints = {
      scale: say('1回 1% · 100%=モデルの全高', '1% per step · 100%=model height'),
      bottom: say('1回 0.1cm · ＋で上へ', '0.1 cm per step · + moves up'),
      x: say('1回 0.1cm · ＋で画面の右へ', '0.1 cm per step · + moves right'),
      opacity: say('0%=非表示 · 100%=くっきり', '0%=hidden · 100%=fully visible'),
    };
    for(const key of fields)layout.querySelector('#ga-'+key+'-hint').textContent=hints[key];
    for(const button of layout.querySelectorAll('[data-ga-opacity]'))button.setAttribute('aria-pressed',String(!!values&&Math.abs(values.opacity-Number(button.dataset.gaOpacity))<.001));
    const status=ctx.pending?say('画像を読み込み中…','Loading image…'):!guide?say('この方向の画像を選ぶと調整できます。','Choose an image for this view to adjust it.'):guide.locked?say('位置と大きさを固定中。下のチェックを外すと調整できます。','Position and size are locked. Uncheck the box below to adjust them.'):'';
    layout.querySelector('.ga-status').textContent=status;
    preview.classList.toggle('ga-locked',!guide||guide.locked||ctx.pending);
    layout.querySelector('[data-ga-fit]').disabled=ctx.pending||!guide;
    validateEditing();
    if(needsFit&&!ctx.pending){fitPreview();needsFit=false;}
  }
  dialog.addEventListener('close',()=>{editing.clear();invalid=false;message();});
  return {open:setActive,sync,fit:fitPreview};
}
