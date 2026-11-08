// Extract only explicitly named stages. Completing a stage does not imply passing it.
function noteStageEvents(note, applied, {includeCancelled=false}={}) {
  const events=[];
  const year=Number(String(applied||'').slice(0,4));
  for (const fragment of splitNoteFragments(note)) {
    const pattern=/AI\s*面(?:试)?|人工智能面试|测评|评测|笔试|HR\s*面(?:试)?|[一二三四五1-5]面/gi;
    const matches=[...fragment.matchAll(pattern)];
    for (let i=0;i<matches.length;i++) {
      const match=matches[i], before=fragment.slice(0,match.index), tail=fragment.slice(match.index+match[0].length,matches[i+1]?.index??fragment.length);
      if (/(?:无需|不用|没有|不需要|不参加|无)\s*$/.test(before)||!includeCancelled&&/^\s*[（(]?(?:取消|已取消)/.test(tail)) continue;
      let stage=match[0].replace(/\s+/g,'').replace(/评测/,'测评');
      if (/^ai|人工智能/i.test(stage)) stage='AI面';
      else if (/^hr/i.test(stage)) stage='HR面';
      else stage=stage.replace(/[1-5]/,d=>'一二三四五'[Number(d)-1]);
      const relevant=matches.length===1?fragment:match[0]+tail;
      let dateMatch=before.match(/(?:(20\d{2})[年./-])?(\d{1,2})[月./-](\d{1,2})(?!\d)(?:日|号)?/);
      if (!dateMatch&&matches.length===1) dateMatch=fragment.match(/(?:(20\d{2})[年./-])?(\d{1,2})[月./-](\d{1,2})(?!\d)(?:日|号)?/);
      if (!dateMatch) dateMatch=before.match(/(?<!\d)([1-9]|1[0-2])([0-3]\d)\s*$/);
      let when='';
      if (dateMatch) {
        const compact=dateMatch.length===3;
        const y=compact?year:Number(dateMatch[1]||year),m=Number(dateMatch[compact?1:2]),d=Number(dateMatch[compact?2:3]);
        const date=new Date(Date.UTC(y,m-1,d));
        if(y>=2000&&y<=2100&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d){
          when=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          // A date without a stated time stays date-only; do not invent midnight.
          const time=fragment.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分)?)/)||fragment.match(/(上午|下午|晚上|中午)\s*(\d{1,2})\.(\d{2})/);
          if(time){let h=Number(time[2]),min=Number(time[3]||time[4]||0);if(/下午|晚上|中午/.test(time[1]||'')&&h<12)h+=12;if(time[1]==='上午'&&h===12)h=0;if(h<24&&min<60)when+=`T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;}
        }
      }
      const fail=/未通过|没过|不通过|挂了|淘汰/.test(relevant);
      const pass=!fail&&(/已通过|通过|已过/.test(relevant)||/(?:测评|评测|笔试|面试|面)过(?:了|$)/i.test(relevant));
      const abandoned=/放弃/.test(relevant)&&!/不放弃|未放弃/.test(relevant);
      const completed=abandoned||!/未做|未测|未面|没做|没面|还没|待做|待面/.test(relevant)&&(/已做|已测|已面|完成|结束|面过/.test(relevant)||fail||pass);
      events.push({stage,when,result:abandoned?'abandoned':fail?'fail':pass?'pass':'pending',handled:completed?'已处理':'',note:fragment});
    }
  }
  return events;
}

function backfillNoteHistory(data) {
  let added=0;
  for (const record of data.records) {
    const manualStages=new Set(record.entries.filter(e=>!e.inferredFromNote).map(e=>e.stage));
    const evidence=record.entries.filter(e=>!e.inferredFromNote).flatMap(e=>noteStageEvents(noteEvidence(e),record.base.applied));
    const newEntries=[];
    for (const event of evidence) {
      // Existing explicitly recorded stages take precedence; never overwrite user edits.
      if(manualStages.has(event.stage)) continue;
      const evidenceKey=event.stage+'|'+(event.when||event.note.replace(/\s/g,''));
      if([...record.entries,...newEntries].some(e=>e.noteEvidenceKey===evidenceKey || e.stage===event.stage&&event.when&&e.when===event.when))continue;
      let id='note_'+record.id+'_'+(record.entries.length+newEntries.length);
      while([...record.entries,...newEntries].some(e=>e.id===id))id+='x';
      newEntries.push({...event,id,performance:'',enteredAt:'',source:'备注补录',inferredFromNote:true,noteEvidenceKey:evidenceKey});
      added++;
    }
    newEntries.sort((a,b)=>(a.when||'9999').localeCompare(b.when||'9999'));
    record.entries.unshift(...newEntries);
  }
  return added;
}
