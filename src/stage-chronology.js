// Infer progress from this application's own dated events, never a global stage order.
const CHRONOLOGY_STAGES=new Set(['测评','笔试','AI面','一面','二面','三面','四面','五面','HR面','Offer']);
function chronologyAfter(a,b) {
  return a.date>b.date||a.date===b.date&&!!a.time&&!!b.time&&a.time>b.time;
}
function chronologyEntry(record,entry) {
  const parsed=noteStageEvents(noteEvidence(entry),record.base.applied,{includeCancelled:true}).filter(event=>event.stage===entry.stage);
  const cancelled=parsed.some(event=>/取消|无需|不用|不参加/.test(event.note))||/^(?:本次|本阶段)?(?:已)?取消[。!！]?$/.test(noteEvidence(entry).trim());
  const dates=[scheduleDate(entry.when),...parsed.map(event=>scheduleDate(event.when))].filter(Boolean);
  const points=[...new Map(dates.map(point=>[point.date+'|'+point.time,point])).values()]
    .filter(point=>point.time||!dates.some(other=>other.date===point.date&&other.time));
  // Missing dates stay unknown here. The schedule's application-date fallback is
  // only a display convenience, not evidence of recruitment progression.
  return {entry,points,parsed,cancelled,eligible:CHRONOLOGY_STAGES.has(entry.stage)&&entry.result!=='abandoned'&&entry.handled!=='已放弃'&&!cancelled&&points.length>0};
}
function chronologyFollows(later,earlier) {
  return later.entry.stage!==earlier.entry.stage&&later.eligible&&earlier.eligible
    &&earlier.points.every(before=>later.points.every(after=>chronologyAfter(after,before)));
}
function chronologyDateText(info) {
  return [...new Set(info.points.map(point=>point.date.replaceAll('-','/')+(point.time?' '+point.time:'')))].join('、');
}
function clearChronologyResult(entry) {
  delete entry.chronologyResultBefore;delete entry.chronologyHandledBefore;delete entry.chronologyReason;
}
function setManualStageResult(entry,result,handled) {
  const owner=typeof state!=='undefined'?state.records.find(record=>record.entries.includes(entry)):null;
  if(owner)assertResultAllowed(owner,entry,result);
  clearChronologyResult(entry);entry.result=result;entry.handled=handled;entry.resultManual=true;
}
function reconcileStageChronology(data,today=day()) {
  let changed=0;
  for(const record of data.records){
    const before=JSON.stringify({current:record.current,entries:record.entries,currentOriginal:record.chronologyCurrentOriginal,currentAuto:record.chronologyCurrentAuto,currentReason:record.chronologyCurrentReason});
    // Re-evaluate our own inference when dates or notes change. Explicit user
    // results take precedence and are never silently replaced on the next save.
    for(const entry of record.entries){
      if(entry.chronologyReason&&!entry.resultManual){
        if(entry.result==='pass'){
          entry.result=entry.chronologyResultBefore||'pending';
          if(entry.handled==='已处理')entry.handled=entry.chronologyHandledBefore||'';
        }
        clearChronologyResult(entry);
      }
    }
    if(record.chronologyCurrentAuto){
      if(!record.currentManual&&record.current===record.chronologyCurrentAuto&&record.entries.some(e=>e.id===record.chronologyCurrentOriginal))record.current=record.chronologyCurrentOriginal;
      delete record.chronologyCurrentAuto;delete record.chronologyCurrentOriginal;delete record.chronologyCurrentReason;
    }
    const infos=record.entries.map(entry=>chronologyEntry(record,entry));
    const selected=infos.find(info=>info.entry.id===record.current);
    if(selected?.eligible&&!record.currentManual&&!selected.entry.resultManual&&selected.entry.result!=='fail'&&!['阶段流转','手动新增'].includes(selected.entry.source)){
      const later=infos.filter(info=>chronologyFollows(info,selected));
      // Only a uniquely latest dated stage can replace an imported latest stage.
      const latest=later.filter(info=>later.every(other=>other===info||other.points.every(a=>info.points.every(b=>chronologyAfter(b,a)))));
      if(latest.length===1){
        const target=latest[0];
        record.chronologyCurrentOriginal=record.current;record.current=target.entry.id;record.chronologyCurrentAuto=target.entry.id;
        record.chronologyCurrentReason=`按日期校准最新阶段：${chronologyDateText(selected)}${selected.entry.stage} → ${chronologyDateText(target)}${target.entry.stage}`;
      }
    }
    for(const info of infos){
      const entry=info.entry;
      if(!info.eligible||entry.result!=='pending'||entry.resultManual||entry.stage==='Offer')continue;
      if(info.parsed.some(event=>event.result==='fail'||/未做|未测|未面|没做|没面|还没|待做|待面|待结果|结果待定|未通过|没过/.test(event.note))||/^(?:本次|本阶段)?(?:未做|未完成|未通过|没过|待结果|结果待定|待通知)[。!！]?$/.test(noteEvidence(entry).trim()))continue;
      // Two future appointments alone do not imply that the first has passed.
      const finished=entry.handled==='已处理'||info.parsed.some(event=>event.handled==='已处理')||info.points.every(point=>point.date<today);
      if(!finished)continue;
      const next=infos.filter(later=>chronologyFollows(later,info)).sort((a,b)=>a.points[0].date.localeCompare(b.points[0].date))[0];
      if(!next)continue;
      entry.chronologyResultBefore=entry.result;entry.chronologyHandledBefore=entry.handled||'';
      entry.result='pass';entry.handled='已处理';
      entry.chronologyReason=`按后续进度推定通过：${chronologyDateText(info)}${entry.stage} → ${chronologyDateText(next)}${next.entry.stage}`;
    }
    const after=JSON.stringify({current:record.current,entries:record.entries,currentOriginal:record.chronologyCurrentOriginal,currentAuto:record.chronologyCurrentAuto,currentReason:record.chronologyCurrentReason});
    if(before!==after)changed++;
  }
  return changed;
}
function chronologyDisclosure(entry) {
  return entry.chronologyReason?`<div class="chronology-evidence">${esc(entry.chronologyReason)}<br><span>可通过“修改结果”手动调整。</span></div>`:'';
}
