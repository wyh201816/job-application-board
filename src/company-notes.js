// Display notes belong to a company. Entry notes remain immutable evidence
// for that application's chronology; sharing text must not share stage facts.
function companyNoteKey(name){return String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function validateCompanyNotes(data){
  if(data?.companyNotes===undefined)return;
  if(!Array.isArray(data.companyNotes))throw Error('公司备注格式不正确');
  const keys=new Set();
  for(const item of data.companyNotes){
    if(!item||typeof item.key!=='string'||item.key!==companyNoteKey(item.key)||keys.has(item.key)||typeof item.note!=='string')throw Error('公司备注格式不正确');
    keys.add(item.key);
  }
}
function mergeCompanyNote(parts,applied){
  const unique=new Set();
  for(const part of parts)for(const fragment of splitNoteFragments(normalizeNoteText(part,applied)))unique.add(fragment);
  return normalizeNoteText([...unique].join('；'),applied);
}
function companyNote(record,data=state){return data.companyNotes?.find(item=>item.key===companyNoteKey(record.base.company))?.note||'';}
function setCompanyNote(record,value,data=state){
  const key=companyNoteKey(record.base.company);
  data.companyNotes??=[];
  let item=data.companyNotes.find(item=>item.key===key);
  if(!item){item={key,note:''};data.companyNotes.push(item);}
  item.note=mergeCompanyNote([String(value||'')],record.base.applied);
}
function reconcileCompanyNotes(data){
  validateCompanyNotes(data);
  const before=JSON.stringify([data.companyNotes,data.records.map(r=>[r.companyNoteKey,...r.entries.map(e=>e.companyNoteSeen)])]);
  data.companyNotes??=[];
  const previous=new Map(data.companyNotes.map(item=>[item.key,item.note]));
  for(const record of data.records){
    const key=companyNoteKey(record.base.company);
    let item=data.companyNotes.find(item=>item.key===key);
    if(!item){item={key,note:''};data.companyNotes.push(item);}
    const additions=[];
    // Renaming carries this company's shared text, and merges into an existing
    // name without joining applications or their histories.
    if(record.companyNoteKey&&record.companyNoteKey!==key)additions.push(previous.get(record.companyNoteKey)||'');
    for(const entry of record.entries){
      const note=String(entry.note||'');
      if(entry.companyNoteSeen!==note){additions.push(note);entry.companyNoteSeen=note;}
    }
    if(additions.some(Boolean))item.note=mergeCompanyNote([item.note,...additions],record.base.applied);
    record.companyNoteKey=key;
  }
  const active=new Set(data.records.map(r=>companyNoteKey(r.base.company)));
  data.companyNotes=data.companyNotes.filter(item=>active.has(item.key));
  return before!==JSON.stringify([data.companyNotes,data.records.map(r=>[r.companyNoteKey,...r.entries.map(e=>e.companyNoteSeen)])]);
}
function showCompanyNoteEditor(rid){
  const record=state.records.find(r=>r.id===rid);if(!record)return;
  modal('公司共享备注 · '+record.base.company,`<div class="hint">同名公司所有阶段、所有岗位共享此备注。处理情况、结果、重要日期和面试表现分别保存；修改备注不修改这些阶段事实。</div><label>备注<textarea id="companyNoteValue" style="width:100%;min-height:160px">${esc(companyNote(record))}</textarea></label>`,`<button id="companyNoteCancel">取消</button><button id="companyNoteSave" class="primary">保存共享备注</button>`);
  $('#companyNoteCancel').onclick=()=>showDetail(rid);
  $('#companyNoteSave').onclick=()=>{const value=$('#companyNoteValue').value;if(mutate(()=>setCompanyNote(record,value),'已同步同名公司的备注'))showDetail(rid);};
}
function stageNoteDisclosure(entry){
  if(!entry.note)return '';
  return `<details class="note-original"><summary>查看本阶段原始记录依据</summary><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px">${esc(noteEvidence(entry))}</div></details>`;
}
