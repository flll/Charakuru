function once(source, before, after) {
  if(source.split(before).length!==2)throw Error('Three-view UI changed; inspect the upstream source before applying.');
  return source.replace(before,after);
}
export function patchGuideUI(source, projectId = null) {
  if(source.includes('createGuideAdjustmentUI'))throw Error('Guide adjustment UI is already patched.');
  source=once(source,"import * as THREE from 'three';", "import * as THREE from 'three';\nimport {createGuideAdjustmentUI} from './guide-adjustment-ui.mjs';");
  source=once(source,"  let positionRanges,fitting=false,fitAttempt=null,rulerKey='',openGeneration=0;", "  let positionRanges,fitting=false,fitAttempt=null,rulerKey='',openGeneration=0;\n const precision=createGuideAdjustmentUI(dialog,()=>({draft,draftAssets,direction,sizeBasis,bounds,modalCamera,pending}),()=>refreshDialog());");
  source=once(source,"  for(const id of ['threeViewOpacity','threeViewLock','removeThreeViewImage'])$('#'+id).disabled=pending||!has;", "  for(const id of ['threeViewOpacity','threeViewLock','removeThreeViewImage'])$('#'+id).disabled=pending||!has;\n  precision.sync();");
  source=once(source,"modalCamera.updateProjectionMatrix();}", "modalCamera.updateProjectionMatrix();precision.fit();}");
  return once(source,"direction=guideView(view)||'front';bounds=measurement.bounds.clone();",`precision.open(${projectId?`projectId===${JSON.stringify(projectId)}`:''});\n  direction=guideView(view)||'front';bounds=measurement.bounds.clone();`);
}
