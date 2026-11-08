// These views derive their data from the saved records without changing stage history.
let pieSelection='', distributionMode='all', scheduleQuery='', scheduleCategory='activities';
const SCHEDULE_CATEGORIES=['面试','笔试','AI面','测评','其他进度'];

function latestDistribution(records) {
  const groups=new Map();
  for(const r of records){
    const label=statusText(current(r))||'未设置';
    if(!groups.has(label))groups.set(label,{label,records:[],count:0});
    const group=groups.get(label);group.records.push(r);group.count++;
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'zh-CN'));
}
function scheduleDate(value) {
  const match=String(value||'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if(!match)return null;
  const [,ys,ms,ds,hs,mins]=match,y=+ys,m=+ms,d=+ds,date=new Date(Date.UTC(y,m-1,d));
  if(y<2000||y>2100||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
  return {date:`${ys}-${ms.padStart(2,'0')}-${ds.padStart(2,'0')}`,time:hs!==undefined&&+hs<24&&+mins<60?`${hs.padStart(2,'0')}:${mins}`:''};
}
function scheduleCategoryFor(stage) {
  if(stage==='AI面')return 'AI面';
  if(/面/.test(stage))return '面试';
  return ['笔试','测评'].includes(stage)?stage:'其他进度';
}
function scheduleEvents(records) {
  const events=[];
  for(const r of records)for(const e of r.entries){
    const explicit=scheduleDate(e.when),applied=scheduleDate(r.base.applied);
    const noteEvents=noteStageEvents(noteEvidence(e),r.base.applied,{includeCancelled:true}).filter(x=>x.stage===e.stage&&scheduleDate(x.when));
    // Prefer the recorded date. When it is missing, each dated occurrence in the
    // stage's own note remains an event (e.g. two written tests at one company).
    const dates=explicit?[{...explicit,source:e.inferredFromNote?'备注日期':'重要日期'}]
      :noteEvents.length?noteEvents.map(x=>({...scheduleDate(x.when),source:'备注日期',evidence:x}))
      :[{date:applied?.date||'',time:'',source:applied?'投递日期':'日期待补充'}];
    const seen=new Set();
    for(const item of dates){
      const key=item.date+'|'+item.time;if(seen.has(key))continue;seen.add(key);
      const note=item.evidence?.note||e.note||'';
      // A cancelled activity stays visible but must not look like an appointment.
      const fragments=String(note).split(/[,，;；\n。]+/);
      const cancelled=fragments.some(s=>s.toLowerCase().includes(e.stage.toLowerCase())&&/(?:已)?取消/.test(s));
      const handled=e.handled==='已放弃'?'已放弃':item.evidence?.handled||e.handled;
      events.push({r,e,date:item.date,time:item.time,source:item.source,
        category:scheduleCategoryFor(e.stage),note,cancelled,
        progress:e.result==='abandoned'||handled==='已放弃'?'已放弃':cancelled?'已取消':e.result==='fail'?'未通过':e.result==='pass'?'已通过':handled==='已处理'?'已处理':handled==='未处理'?'未处理':'未标记处理情况'});
    }
  }
  return events.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99:99').localeCompare(b.time||'99:99')||String(a.r.base.company).localeCompare(String(b.r.base.company),'zh-CN'));
}
function partitionSchedule(events,today=day()) {
  return {past:events.filter(x=>x.date&&x.date<today),upcoming:events.filter(x=>x.date&&x.date>=today),undated:events.filter(x=>!x.date)};
}
function insightIcon(kind) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kind==='distribution'?'<path d="M10 3a9 9 0 1 0 11 11H10Z"/><path d="M14 2v8h8a9 9 0 0 0-8-8Z"/>':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 4h3"/>'}</svg>`;
}
function insightsNavigation() {
  return [['distribution','状态分布'],['schedule','时间安排']].map(([kind,label])=>`<button data-nav="${kind}" class="${view.kind===kind?'active':''}"><span class="stage-icon">${insightIcon(kind)}</span><span class="nav-text">${label}</span><span class="num"></span></button>`).join('');
}
function switchMainSurface() {
  const active=['distribution','schedule'].includes(view.kind);
  const distribution=view.kind==='distribution';
  $('#distributionTabs').hidden=!distribution;$('#viewTitle').hidden=distribution;
  if(distribution){$('#insights').setAttribute('role','tabpanel');$('#insights').setAttribute('aria-labelledby','distribution-tab-'+distributionMode);}
  else{$('#insights').removeAttribute('role');$('#insights').removeAttribute('aria-labelledby');}
  $('#insights').hidden=!active;$('#tableWrap').hidden=active;$('.toolbar').hidden=active;$('#bulk').hidden=active;
  $('#csvExport').hidden=active;
  $('.foot-note').textContent=active?'点击公司查看详情、编辑进度':'双击单元格编辑 · 点击公司查看完整记录';
  return active;
}
function chartColor(label,index) {
  if(/放弃/.test(label))return '#8b95a5';
  const known={'泡简历':'#d4e47f','简历复活':'#78a2fa','简历挂':'#f16b66','测评':'#9060e8','笔试':'#713be0','AI面':'#b88af2','一面':'#36a06a','二面':'#148b87','三面':'#397fbb','HR面':'#4e67a9','Offer':'#e5ad36'};
  if(known[label])return known[label];
  const palette=['#d98292','#c98446','#5f9eb5','#927fba','#a0aa65','#b5637c'];
  return palette[index%palette.length];
}
function pieSVG(groups,total) {
  if(!total)return '<div class="pie-empty">暂无投递数据</div>';
  let angle=-Math.PI/2;
  const sectors=groups.map((g,i)=>{
    const next=angle+g.count/total*Math.PI*2,start=[180+148*Math.cos(angle),180+148*Math.sin(angle)],end=[180+148*Math.cos(next),180+148*Math.sin(next)];
    const shape=groups.length===1?'<circle cx="180" cy="180" r="148"/>':`<path d="M180 180 L${start.join(' ')} A148 148 0 ${next-angle>Math.PI?1:0} 1 ${end.join(' ')} Z"/>`;
    angle=next;
    return `<g data-pie-status="${esc(g.label)}" role="button" tabindex="0" aria-label="${esc(g.label)}，${g.count} 份，${(g.count/total*100).toFixed(1)}%" aria-pressed="${pieSelection===g.label}" fill="${chartColor(g.label,i)}" class="pie-sector ${pieSelection&&pieSelection!==g.label?'dimmed':''}"><title>${esc(g.label)}：${g.count} 份（${(g.count/total*100).toFixed(1)}%）</title>${shape}</g>`;
  }).join('');
  return `<svg class="pie-chart" viewBox="0 0 360 360" role="group" aria-label="最新投递状态饼状图">${sectors}</svg>`;
}
function renderInsights() {
  const schedule=view.kind==='schedule';
  $('#viewTitle').textContent=schedule?'时间安排':'状态分布';
  $('#viewDescription').textContent=schedule?'保留所有阶段 · 没有明确日期时按投递日期排列':'理想公司按公司汇总 · 全部投递按最新状态统计';
  if(!schedule){renderDistribution();return;}
  $('#insights').innerHTML=`<div class="insight-tools"><div class="schedule-jumps"><button data-jump="past">过去记录</button><button data-jump="upcoming">今天及未来</button></div><label class="schedule-type">阶段 <select id="scheduleCategory" aria-label="筛选安排阶段"><option value="activities" ${scheduleCategory==='activities'?'selected':''}>面试、笔试等</option><option value="all" ${scheduleCategory==='all'?'selected':''}>全部进度</option>${SCHEDULE_CATEGORIES.map(c=>`<option value="${c}" ${scheduleCategory===c?'selected':''}>${c}</option>`).join('')}</select></label><input id="scheduleSearch" type="search" value="${esc(scheduleQuery)}" aria-label="搜索时间安排" placeholder="搜索公司、岗位、备注…"></div><div id="scheduleContent"></div>`;
  renderScheduleContent();
}
function renderDistributionTabs(){
  $('#distributionTabs').innerHTML=[['all','全部流程'],['ideal','理想公司']].map(([key,label])=>`<button id="distribution-tab-${key}" class="distribution-tab" type="button" role="tab" data-distribution-mode="${key}" aria-selected="${distributionMode===key}" aria-controls="insights" tabindex="${distributionMode===key?'0':'-1'}">${label}</button>`).join('');
  $('#insights').setAttribute('aria-labelledby','distribution-tab-'+distributionMode);
  $('#viewDescription').textContent=distributionMode==='all'?'每份投递仅统计一次 · 以最新状态为准':'仅理想投递 · 按公司合并统计';
}
function setDistributionMode(mode,focus=false){
  if(view.kind!=='distribution'||!['all','ideal'].includes(mode))return;
  distributionMode=mode;renderDistribution();$('#insights').scrollTop=0;
  if(focus)$('#distribution-tab-'+mode).focus({preventScroll:true});
}
function renderDistribution() {
  renderDistributionTabs();
  if(distributionMode==='ideal'){
    const data=idealCompanyDistribution(state.records);
    $('#recordCount').textContent=`${data.total} 家理想公司 · 四类统计 ${data.chartTotal} 家 · 已放弃 ${data.abandoned.count} 家`;
    $('#insights').innerHTML=idealCompanyInsightsHTML();return;
  }
  const groups=latestDistribution(state.records),total=state.records.length;
  if(!groups.some(g=>g.label===pieSelection))pieSelection='';
  $('#recordCount').textContent=`${total} 份投递 · ${groups.length} 种最新状态`;
  $('#insights').innerHTML=`<section class="insight-card distribution-card"><div class="insight-heading"><div><h2>最新状态分布</h2><p>每份投递计入当前状态，历史阶段不重复计数。</p></div><div class="insight-total"><strong>${total}</strong><span>份投递</span></div></div><div class="distribution-body"><div class="pie-visual">${pieSVG(groups,total)}</div><div class="pie-legend"><div class="legend-heading"><span>投递状态</span><span>数量</span><span>占比</span></div>${groups.map((g,i)=>`<button class="legend-row ${pieSelection===g.label?'chosen':''}" data-pie-status="${esc(g.label)}" aria-pressed="${pieSelection===g.label}"><span class="legend-label"><i style="background:${chartColor(g.label,i)}"></i>${esc(g.label)}</span><strong>${g.count}</strong><span>${(g.count/total*100).toFixed(1)}%</span></button>`).join('')||'<p class="muted">新增投递后自动生成饼图。</p>'}<p class="legend-tip">点击扇区或状态，查看对应公司</p></div></div></section><section class="insight-card distribution-records"><div class="insight-heading"><h2>${esc(pieSelection||'全部最新投递')} <span class="section-count">${(pieSelection?groups.find(g=>g.label===pieSelection)?.count:total)||0}</span></h2>${pieSelection?'<button data-clear-pie>显示全部</button>':''}</div><div class="insight-table-scroll"><table class="insight-table"><thead><tr><th>公司名称</th><th>岗位</th><th>投递日期</th><th>最新状态</th></tr></thead><tbody>${state.records.filter(r=>!pieSelection||statusText(current(r))===pieSelection).map(r=>`<tr><td><button class="company-link" data-insight-detail="${esc(r.id)}">${esc(r.base.company||'未命名')}</button></td><td>${esc(r.base.role||'—')}</td><td class="tabular">${esc(r.base.applied||'—')}</td><td>${badge(statusText(current(r)))}</td></tr>`).join('')||'<tr><td colspan="4" class="insight-empty">暂无投递</td></tr>'}</tbody></table></div></section>`;
}
function scheduleDateLabel(value) {
  if(!value)return '日期待补充';
  const [year,month,date]=value.split('-');
  const weekday=['周日','周一','周二','周三','周四','周五','周六'][new Date(+year,+month-1,+date).getDay()];
  return `${year}/${month}/${date} <span class="weekday">${value===day()?'今天':weekday}</span>`;
}
function dateSourceLabel(event) {
  return event.source==='投递日期'?'按投递日期':event.source;
}
function eventTitle(event) {
  return `${event.r.base.company} · ${event.e.stage}\n${event.date||'日期待补充'} ${event.time||'未注明时间'} · ${dateSourceLabel(event)}\n${event.progress}${event.note?'\n'+event.note:''}`;
}
function scheduleChip(event) {
  return `<button class="schedule-chip ${event.cancelled?'cancelled':''}" data-insight-detail="${esc(event.r.id)}" title="${esc(eventTitle(event))}"><span class="chip-company">${esc(event.r.base.company||'未命名')}</span>${['面试','其他进度'].includes(event.category)?`<span class="chip-stage">${esc(statusText(event.e))}</span>`:''}${event.time?`<span class="chip-time">${event.time}</span>`:''}${event.source==='投递日期'?'<span class="fallback-mark">投递日</span>':''}${event.progress==='已放弃'?'<span class="abandoned-mark">已放弃</span>':event.cancelled?'<span class="cancelled-mark">已取消</span>':event.progress==='未处理'?'<span class="pending-dot" aria-label="未处理"></span>':''}</button>`;
}
function scheduleSection(id,title,events,past=false) {
  const categories=scheduleCategory==='all'?SCHEDULE_CATEGORIES:scheduleCategory==='activities'?SCHEDULE_CATEGORIES.slice(0,4):[scheduleCategory];
  const summary=categories.map(c=>`${c} ${events.filter(e=>e.category===c).length}`).join(' · ');
  let table;
  if(past){
    const dates=[...new Set(events.map(e=>e.date))];
    table=`<table class="insight-table schedule-matrix"><thead><tr><th>日期</th>${categories.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${dates.map(d=>`<tr><td class="schedule-date">${scheduleDateLabel(d)}</td>${categories.map(c=>`<td><div class="schedule-cell">${events.filter(e=>e.date===d&&e.category===c).map(scheduleChip).join('')||'<span class="muted">—</span>'}</div></td>`).join('')}</tr>`).join('')||`<tr><td colspan="${categories.length+1}" class="insight-empty">暂无过去的记录</td></tr>`}</tbody></table>`;
  }else{
    table=`<table class="insight-table schedule-agenda"><thead><tr><th>日期</th><th>时间</th><th>公司与事项</th><th>安排信息</th></tr></thead><tbody>${events.map(event=>`<tr class="${event.date===day()?'is-today':''} ${event.cancelled?'cancelled':''}"><td class="schedule-date">${scheduleDateLabel(event.date)}</td><td class="tabular ${event.time?'':'muted'}">${event.time||'未注明时间'}</td><td><div class="agenda-company"><button class="company-link" data-insight-detail="${esc(event.r.id)}" title="${esc(eventTitle(event))}">${esc(event.r.base.company||'未命名')}</button>${badge(statusText(event.e))}</div><div class="agenda-role">${esc(event.r.base.role||'')}</div></td><td><span class="source-tag ${event.source==='投递日期'?'fallback':''}">${dateSourceLabel(event)}</span><span class="agenda-progress">${esc(event.progress)}</span></td></tr>`).join('')||`<tr><td colspan="4" class="insight-empty">${id==='undated'?'没有日期待补充的记录':'暂无今天及未来的安排'}</td></tr>`}</tbody></table>`;
  }
  return `<section id="schedule-${id}" class="insight-card schedule-section"><div class="insight-heading"><div><h2>${title}<span class="section-count">${events.length} 条</span></h2><p>${summary}</p></div></div><div class="insight-table-scroll schedule-scroll" tabindex="0" role="region" aria-label="${title}，可滚动查看">${table}</div></section>`;
}
function renderScheduleContent() {
  const all=scheduleEvents(state.records),q=scheduleQuery.trim().toLowerCase();
  const events=all.filter(x=>(scheduleCategory==='all'||scheduleCategory==='activities'&&x.category!=='其他进度'||x.category===scheduleCategory)&&(!q||[x.r.base.company,x.r.base.role,x.note,x.e.stage].join(' ').toLowerCase().includes(q)));
  const {past,upcoming,undated}=partitionSchedule(events),fallback=events.filter(e=>e.source==='投递日期').length;
  $('#recordCount').textContent=`${events.length} 条进度 · 过去 ${past.length} · 今天及未来 ${upcoming.length}${undated.length?' · 日期待补充 '+undated.length:''}`;
  $('#scheduleContent').innerHTML=`<div class="schedule-overview"><span>今天 <strong>${day().replaceAll('-','/')}</strong></span><span>过去 <strong>${past.length}</strong></span><span>今天及未来 <strong>${upcoming.length}</strong></span><span>按投递日期 <strong>${fallback}</strong></span></div><p class="schedule-explanation">日期优先使用重要日期，其次使用备注日期；标有“投递日”的 ${fallback} 条进度按投递日期排列。未注明时间不补为零点；过去记录不等同于已完成。</p>${scheduleSection('past','过去记录',past,true)}${scheduleSection('upcoming','今天及未来',upcoming)}${undated.length?scheduleSection('undated','日期待补充',undated):''}`;
}
function bindInsights() {
  bindIdealCompanyInsights();
  $('#distributionTabs').addEventListener('click',event=>{const button=event.target.closest('[data-distribution-mode]');if(button)setDistributionMode(button.dataset.distributionMode,true);});
  $('#distributionTabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const modes=['all','ideal'],index=modes.indexOf(distributionMode);
    const next=event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowRight'?1:-1)+2)%2;
    setDistributionMode(modes[next],true);
  });
  $('#insights').addEventListener('click',event=>{
    const company=event.target.closest('[data-insight-detail]');if(company)return showDetail(company.dataset.insightDetail);
    const status=event.target.closest('[data-pie-status]');
    if(status){pieSelection=pieSelection===status.dataset.pieStatus?'':status.dataset.pieStatus;const scroll=$('#insights').scrollTop;renderDistribution();$('#insights').scrollTop=scroll;$$('.legend-row').find(b=>b.dataset.pieStatus===status.dataset.pieStatus)?.focus({preventScroll:true});return;}
    if(event.target.closest('[data-clear-pie]')){pieSelection='';return renderDistribution();}
    const jump=event.target.closest('[data-jump]');if(jump){const section=$('#schedule-'+jump.dataset.jump),container=$('#insights');container.scrollTo({top:container.scrollTop+section.getBoundingClientRect().top-container.getBoundingClientRect().top-$('.insight-tools').offsetHeight-16,behavior:'smooth'});}
  });
  $('#insights').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('.pie-sector')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  $('#insights').addEventListener('input',event=>{if(event.target.id==='scheduleSearch'){scheduleQuery=event.target.value;renderScheduleContent();}});
  $('#insights').addEventListener('change',event=>{if(event.target.id==='scheduleCategory'){scheduleCategory=event.target.value;renderScheduleContent();}});
}
