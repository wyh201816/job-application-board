function supportsAbandonment(stage){return !isSingleStage(stage);}
function isAbandonedEntry(entry){return entry.result==='abandoned';}
function isClosedEntry(entry){return isFailedEntry(entry)||isAbandonedEntry(entry);}

// Migrate the old handling flag into a stage outcome. Keep the previous values
// for audit, and never invalidate a confirmed successful transition.
function normalizeAbandonedStages(data){
  let changed=0;
  for(const record of data.records)for(const entry of record.entries){
    if(entry.handled==='已放弃'&&supportsAbandonment(entry.stage)){
      entry.abandonmentResultBefore??=entry.result;
      entry.abandonmentHandledBefore??=entry.handled;
      if(record.entries.some(next=>next.previousEntryId===entry.id&&next.transitionKind==='advance')){
        entry.abandonmentWarning='旧记录在处理情况中标过放弃，但已有确认的后续流转，保留原阶段通过。请核对实际放弃的是哪个阶段。';
        entry.result='pass';
      }else{
        entry.result='abandoned';
        if(record.current===entry.id)record.currentManual=true;
      }
      clearChronologyResult(entry);entry.resultManual=true;entry.handled='已处理';changed++;
    }else if(isAbandonedEntry(entry)&&entry.handled!=='已处理'){
      entry.handled='已处理';changed++;
    }
  }
  return changed;
}
