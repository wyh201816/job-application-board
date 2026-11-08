// Keep the original evidence separate from the concise, editable display note.
function noteEvidence(entry) {
  return entry.note===entry.noteNormalized&&typeof entry.noteOriginal==='string'?entry.noteOriginal:entry.note||'';
}
function splitNoteFragments(note) {
  return String(note||'').split(/[,，;；\n。]+|\s*[-—–]\s*(?=20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}|\d{1,2}[月./]\d{1,2}|[1-9]\d{2}(?=[^\d]))/).map(s=>s.trim()).filter(Boolean);
}
function normalizeNoteText(note,applied) {
  const progress=[],other=[];
  for(const fragment of splitNoteFragments(note)){
    let text=fragment.trim();
    const dateMatch=text.match(/^(?:(20\d{2})[年./-])?(\d{1,2})[月./-](\d{1,2})(?!\d)(?:日|号)?/)
      ||text.match(/^([1-9]|1[0-2])([0-3]\d)(?=\s*(?:ai|AI|笔试|测评|评测|[一二三四五1-5]面))/);
    if(!dateMatch){other.push(text);continue;}
    const compact=dateMatch.length===3;
    const year=compact?Number(String(applied||'').slice(0,4)):Number(dateMatch[1]||String(applied||'').slice(0,4));
    const month=Number(dateMatch[compact?1:2]),date=Number(dateMatch[compact?2:3]),check=new Date(Date.UTC(year,month-1,date));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==date){other.push(text);continue;}
    const prefix=(!compact&&dateMatch[1]?year+'.':'')+month+'.'+date;
    text=text.slice(dateMatch[0].length).trim();
    const stages=[...text.matchAll(/AI\s*面(?:试)?|人工智能面试|HR\s*面(?:试)?|测评|评测|笔试|[一二三四五1-5]面|面试/gi)];
    // Ambiguous or undated prose is retained, rather than assigning it to a stage.
    if(stages.length!==1){other.push(fragment);continue;}
    const match=stages[0];
    if(/(?:无需|不用|没有|不需要|不参加|无)\s*$/.test(text.slice(0,match.index))){other.push(prefix+text);continue;}
    let stage=match[0].replace(/\s/g,'').replace('评测','测评');
    if(/^ai|人工智能/i.test(stage))stage='ai面';
    else if(/^hr/i.test(stage))stage='HR面';
    else stage=stage.replace(/[1-5]/,n=>'一二三四五'[Number(n)-1]);
    let rest=text.slice(0,match.index)+text.slice(match.index+match[0].length);
    const time=rest.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分)?)/)
      ||rest.match(/(上午|下午|晚上|中午)\s*(\d{1,2})\.(\d{2})/);
    let clock='';
    // A bare "2点" has no AM/PM indication; preserve that wording instead.
    if(time&&(time[1]||/[:：]/.test(time[0]))){
      let hour=Number(time[2]);const min=Number(time[3]||time[4]||0);
      if(/下午|晚上|中午/.test(time[1]||'')&&hour<12)hour+=12;
      if(time[1]==='上午'&&hour===12)hour=0;
      if(hour<24&&min<60){clock=' '+String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0');rest=rest.replace(time[0],'');}
    }
    rest=rest.replace(/(?<!未|没|不)(?:已经完成|已完成|已做|已测|已面)/g,'').trim();
    if(/^(?:完成|结束|面过)$/.test(rest))rest='';
    if(/^（[^（）]*）$|^\([^()]*\)$/.test(rest))rest=rest.slice(1,-1).trim();
    progress.push(prefix+stage+clock+(rest?'（'+rest+'）':''));
  }
  return [progress.join('-'),...other].filter(Boolean).join('；');
}
function normalizeRecordNotes(data) {
  let changed=0;
  for(const record of data.records)for(const entry of record.entries){
    const before=String(entry.note||''),after=normalizeNoteText(before,record.base.applied);
    if(after===before)continue;
    entry.noteOriginal=noteEvidence(entry);
    entry.noteNormalized=after;
    entry.note=after;
    changed++;
  }
  return changed;
}
function originalNoteDisclosure(entry) {
  if(entry.note!==entry.noteNormalized||!entry.noteOriginal||entry.noteOriginal===entry.note)return '';
  return `<details class="note-original"><summary>查看规范前备注</summary><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px">${esc(entry.noteOriginal)}</div></details>`;
}
