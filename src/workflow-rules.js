// Central invariants shared by stage transitions, edits, imports and saved layouts.
const SIZE_VIEWS={
  bigtech:{title:'大厂投递',sizes:['大厂']},
  'bigtech-unicorn':{title:'大厂及独角兽投递',sizes:['大厂','独角兽']},
  'midbig-plus':{title:'中大厂以上',sizes:['大厂','中大厂','独角兽']}
};
function isLatestView(kind=view.kind){return kind==='current'||Object.hasOwn(SIZE_VIEWS,kind);}
function isBigTech(record){return String(record.base.size||'').trim()==='大厂';}
function matchesSizeView(record,kind=view.kind){return !SIZE_VIEWS[kind]||SIZE_VIEWS[kind].sizes.includes(String(record.base.size||'').trim());}
function bigTechNavigation(){return '<div class="nav-label">专项视图</div>'+Object.entries(SIZE_VIEWS).map(([kind,config])=>`<button data-nav="${kind}" class="${view.kind===kind?'active':''}" title="${config.title}：${config.sizes.join('、')}"><span class="stage-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 21V4h10v17M14 9h6v12M2 21h20M7 8h4M7 12h4M7 16h4M16 13h2M16 17h2"/></svg></span><span class="nav-text">${kind==='bigtech-unicorn'?'大厂及<br>独角兽投递':config.title}</span><span class="num">${state.records.filter(r=>matchesSizeView(r,kind)).length}</span></button>`).join('');}
function interviewRound(stage){return ({'一面':1,'二面':2,'三面':3,'四面':4,'五面':5,'HR面':6})[stage]||0;}
function isFailedEntry(entry){return entry.result==='fail'||entryStatusStage(entry)==='简历挂';}
function requiresHandled(entry){return ['pass','fail','abandoned'].includes(entry.result)||['Offer','简历挂'].includes(entry.stage);}
function transitionProblem(record,entry,target,when=''){
  if(!entry||record.current!==entry.id)return '只有最新阶段可以继续流转；历史阶段请使用“编辑阶段记录”。';
  if(!target)return '请选择实际进入的阶段。';
  if(target===entry.stage)return '同一阶段的记录请直接编辑；补充另一次经历请使用“补录历史阶段”。';
  if(entry.stage==='Offer')return 'Offer 已是本次投递的最终阶段；误操作请撤销，新的投递请另建记录。';
  if(target==='简历挂'||target==='泡简历')return '失败请修改本阶段结果，等待反馈无需新建“泡简历”阶段。';
  if(isClosedEntry(entry)&&target!=='简历复活')return '原阶段已失败或放弃，请先进入“简历复活”重新开启，或先更正原阶段结果。';
  if(!isClosedEntry(entry)&&target==='简历复活')return '只有失败或放弃后的重新开启才使用“简历复活”。';
  const fromRound=interviewRound(entry.stage),toRound=interviewRound(target);
  if(fromRound&&toRound&&toRound<=fromRound)return '面试轮次不能向前回退；若为录入错误，请编辑原记录或撤销流转。';
  const nextDate=scheduleDate(when);
  if(when&&!nextDate)return '请填写有效的新阶段日期。';
  if(nextDate){
    const previous=chronologyEntry(record,entry);
    if(previous.points.some(point=>chronologyAfter(point,nextDate)))return '新阶段日期早于原阶段的明确日期，请先核对日期。';
  }
  return '';
}
function linkedNext(record,entry){return record.entries.filter(next=>next.previousEntryId===entry.id&&next.transitionKind==='advance');}
function assertResultAllowed(record,entry,result){
  const next=record&&linkedNext(record,entry);
  if(next?.length&&!isSingleStage(entryStatusStage(entry))&&result!=='pass')throw Error(`已有${next.map(e=>e.stage).join('、')}流转记录，${entry.stage}必须保持通过。更正这次流转请先撤销。`);
}
function appendStageTransition(record,entry,target,when,note){
  const problem=transitionProblem(record,entry,target,when);if(problem)throw Error(problem);
  const kind=target==='简历复活'?'revive':'advance';
  if(kind==='advance'&&!isSingleStage(entryStatusStage(entry)))setManualStageResult(entry,'pass','已处理');
  if(kind==='advance'&&isSingleStage(entryStatusStage(entry)))entry.handled='已处理';
  if(kind==='revive')entry.handled='已处理';
  const next={id:uid(),stage:target,result:'pending',when:when||'',note:note||'',handled:target==='Offer'?'已处理':'未处理',performance:'',enteredAt:new Date().toISOString(),source:'阶段流转',previousEntryId:entry.id,transitionKind:kind};
  record.entries.push(next);record.current=next.id;record.currentManual=true;
  return next;
}
function enforceWorkflowRules(data){
  let count=normalizeAbandonedStages(data);
  for(const record of data.records){
    const before=JSON.stringify(record);
    // Prior versions did not store explicit edges. Recover only unambiguous
    // successful transitions and revivals; never erase an existing failure.
    for(let i=0;i<record.entries.length;i++){
      const next=record.entries[i];
      if(next.source==='阶段流转'&&!next.previousEntryId){
        const previous=record.entries.slice(0,i).reverse().find(e=>!e.inferredFromNote&&e.source!=='手动补录');
        if(previous&&next.stage==='简历复活'&&isClosedEntry(previous)){
          next.previousEntryId=previous.id;next.transitionKind='revive';
        }else if(previous&&!transitionProblem({...record,current:previous.id},previous,next.stage,next.when)){
          next.previousEntryId=previous.id;next.transitionKind='advance';
        }else next.workflowWarning='这条旧流转记录无法确认前后关系，请核对原阶段结果与日期。';
      }
      if(!next.previousEntryId)continue;
      const previous=record.entries.find(e=>e.id===next.previousEntryId);
      if(!previous||previous===next||!['advance','revive'].includes(next.transitionKind))throw Error('阶段流转关系无效，请检查备份中的阶段记录。');
      const problem=transitionProblem({...record,current:previous.id},previous,next.stage,next.when);if(problem)throw Error(problem);
      delete next.workflowWarning;
      if(next.transitionKind==='advance'){
        if(isClosedEntry(previous))throw Error('失败或放弃阶段不能直接推进；请通过简历复活重新开启。');
        if(!isSingleStage(entryStatusStage(previous)))setManualStageResult(previous,'pass','已处理');
        previous.handled='已处理';
      }else if(!isClosedEntry(previous))throw Error('简历复活必须保留原阶段的失败或放弃结果。');
    }
    const visits=new Set(),active=new Set();
    function visit(entry){if(active.has(entry.id))throw Error('阶段流转关系不能形成循环。');if(visits.has(entry.id))return;active.add(entry.id);if(entry.previousEntryId)visit(record.entries.find(e=>e.id===entry.previousEntryId));active.delete(entry.id);visits.add(entry.id);}
    record.entries.forEach(visit);
    for(const entry of record.entries)if(requiresHandled(entry)&&entry.handled!=='已放弃')entry.handled='已处理';
    if(before!==JSON.stringify(record))count++;
  }
  return count;
}
function workflowDisclosure(entry){return [entry.workflowWarning,entry.abandonmentWarning].filter(Boolean).map(warning=>`<div class="chronology-evidence">${esc(warning)}</div>`).join('');}
function showTransition(rid,eid){
  const r=state.records.find(record=>record.id===rid),e=r?.entries.find(entry=>entry.id===eid);if(!e)return;
  const isCurrent=r.current===eid,single=isSingleStage(entryStatusStage(e)),locked=linkedNext(r,e).length>0&&!single;
  const targets=allStages().filter(stage=>!transitionProblem(r,e,stage));
  modal(isCurrent?'更新进展 · '+r.base.company:'修改历史阶段 · '+r.base.company,`<div class="hint">${locked?'这条历史记录已有后续流转，必须保持通过；日期和备注仍可编辑。':isCurrent?'正常推进自动将原阶段标为通过并保留原记录。失败或放弃后重新开启请使用“简历复活”。':'只修改此历史阶段，不改变当前最新阶段。'}</div><div class="form-grid"><label>本阶段结果<select id="stageResult" ${single||locked?'disabled':''}>${resultOptions(entryStatusStage(e),e.result,true)}</select></label><label>是否处理<select id="stageHandled"><option value="">未设置</option>${['未处理','已处理'].map(value=>`<option ${e.handled===value?'selected':''}>${value}</option>`).join('')}</select></label>${isCurrent&&targets.length?`<label class="full" style="flex-direction:row;align-items:center"><input type="checkbox" id="moveNext" style="width:16px">进入另一个阶段，保留当前记录</label><div id="nextFields" class="form-grid full" style="display:none;grid-column:1/-1"><label>实际进入的阶段<select id="nextStage"><option value="" disabled selected>请选择阶段（按实际进展）</option>${targets.map(stage=>`<option>${esc(stage)}</option>`).join('')}</select></label><label>新阶段重要日期<input type="datetime-local" id="nextWhen"></label><label class="full">补充公司备注（保存后同步）<textarea id="nextNote" placeholder="日期未确定可留空，备注记录具体安排"></textarea></label><div class="hint full" id="transitionRule" style="grid-column:1/-1;margin:0">正常推进时原阶段自动标为通过、已处理，不能取消。</div></div>`:''}</div>`,`<button id="cancelTransition">取消</button><button id="saveTransition" class="primary">保存进展</button>`);
  $('#cancelTransition').onclick=closeModal;
  let moveWasOn=false,resultBeforeMove=e.result;
  const sync=()=>{
    const move=!!$('#moveNext')?.checked,target=$('#nextStage')?.value;
    if(move&&!moveWasOn){resultBeforeMove=$('#stageResult').value;if(!single&&!isClosedEntry(e))$('#stageResult').value='pass';}
    if(!move&&moveWasOn)$('#stageResult').value=resultBeforeMove;
    moveWasOn=move;
    if($('#nextFields'))$('#nextFields').style.display=move?'grid':'none';
    $('#stageResult').disabled=single||locked||move;
    const processed=['pass','fail','abandoned'].includes($('#stageResult').value)||isSingleStage(e.stage)&&requiresHandled(e);
    $('#stageHandled').disabled=move||processed;if(processed)$('#stageHandled').value='已处理';
    if($('#transitionRule'))$('#transitionRule').textContent=target==='简历复活'?'重新开启会保留原失败或放弃结果，新增一条简历复活记录。':single?'进入新阶段后，保留当前记录和原状态。':'正常推进时原阶段自动标为通过、已处理，不能取消。';
  };
  $('#moveNext')?.addEventListener('change',sync);$('#nextStage')?.addEventListener('change',sync);$('#stageResult').addEventListener('change',sync);sync();
  $('#saveTransition').onclick=()=>{
    const move=!!$('#moveNext')?.checked,target=$('#nextStage')?.value,when=$('#nextWhen')?.value,note=$('#nextNote')?.value;
    if(move){const problem=transitionProblem(r,e,target,when);if(problem)return notify(problem);}
    const result=$('#stageResult').value,handled=$('#stageHandled').value;
    const saved=mutate(()=>{
      if(move){appendStageTransition(r,e,target,when,note);collapsed.delete(target);}
      else{if(isCurrent||r.chronologyCurrentAuto)r.currentManual=true;setManualStageResult(e,result,handled);}
    },move?'已进入'+target+'，原阶段记录已保留':'已更新阶段结果');
    if(saved)closeModal();else showTransition(rid,eid);
  };
}
function showWorkflowRules(){
  modal('状态流转规则',`<div class="help"><h3>正常推进</h3><p>一面进入二面、测评进入 AI 面等正常推进，会自动将原阶段标为通过、已处理，并新增下一阶段记录。原日期、备注和面试表现保留。已有后续流转的历史阶段不能再改成待定、失败或放弃。</p><h3>实际顺序</h3><p>测评、笔试、AI 面可以按公司实际安排先后进行；面试轮次不能倒退。可以跳过未经历的阶段，不会补造中间记录。新阶段明确日期不能早于原阶段，日期未定时可留空。</p><h3>失败与复活</h3><p>失败在本阶段标为未通过，不新增假的下一阶段。失败后重新获得机会，先进入“简历复活”，保留失败历史，再推进到实际阶段。Offer 为最终阶段。</p><h3>状态与处理情况</h3><p>已做、已面但没结果，仍是待结果。通过或失败自动标为已处理；主动放弃请在本阶段结果中选择“已放弃”，成为一面放弃、笔试放弃等独立的第 4 个状态，以灰色显示。不计入待办和面试进行中；是否处理自动设为已处理。仅时间过去不能证明通过；明确的后续进度可用于日期推定，详情可查看依据。手动设置优先，但不能破坏已确认的流转关系。</p><h3>视图与统计</h3><p>阶段视图保留历史；全部投递、规模专项视图和饼图只取每份投递的最新记录。大厂仅包括“公司规模＝大厂”；同公司不同岗位仍为独立投递。单条与批量修改、导入、重新打开页面均使用同一约束。</p><h3>公司备注与阶段字段</h3><p>同名公司共享一份备注，任何视图修改后同步；同公司不同岗位仅共享备注，最新进度和阶段历史仍独立。是否处理、结果、重要日期、面试表现按阶段保存。备注修改不会自动改写阶段事实；请使用编辑阶段记录或更新进展。新流转的补充备注自动合入公司备注，旧阶段原始依据保留。</p><h3>更正与备份</h3><p>补录历史不改变手动指定的最新阶段。误操作可撤销，定期导出 JSON 保存完整历史。旧版无明确流转关系且存在矛盾的记录保留并提示核对。</p></div>`,`<button id="closeRules" class="primary">知道了</button>`);
  $('#closeRules').onclick=closeModal;
}
