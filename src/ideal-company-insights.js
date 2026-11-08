let idealCompanySelection='';
const IDEAL_COMPANY_CATEGORIES=[
  {key:'active',label:'面试流程中',color:'#36a06a'},
  {key:'failed',label:'已挂',color:'#f16b66'},
  {key:'screening',label:'尚未到面试',color:'#78a2fa'},
  {key:'offer',label:'已获 Offer',color:'#e5ad36'}
];
function isActiveInterviewApplication(record){return isApplicationActive(record)&&record.entries.some(entry=>isHumanInterviewStage(entry.stage));}
function idealCompanyDistribution(records){
  const companies=groupSummaryCompanies(records.filter(record=>record.base.preference==='理想'));
  const groups=IDEAL_COMPANY_CATEGORIES.map(category=>({...category,companies:[],count:0}));
  const abandoned={key:'abandoned',label:'已放弃',color:'#8b95a5',companies:[],count:0};
  for(const company of companies){
    // A company occupies one bucket even when it has several ideal applications.
    // Any real offer wins; otherwise keep live opportunities ahead of closed ones.
    const key=company.records.some(hasReceivedOffer)?'offer'
      :company.records.some(isActiveInterviewApplication)?'active'
      :company.records.some(isApplicationActive)?'screening'
      :company.records.some(record=>isFailedEntry(current(record)))?'failed':'abandoned';
    company.category=key;
    const group=key==='abandoned'?abandoned:groups.find(group=>group.key===key);
    group.companies.push(company);group.count++;
  }
  return {companies,groups,abandoned,total:companies.length,chartTotal:companies.length-abandoned.count};
}
function idealCompanyPie(groups,total){
  if(!total)return '<div class="ideal-pie-empty">暂无四类统计数据</div>';
  const visible=groups.filter(group=>group.count);let angle=-Math.PI/2;
  return `<svg class="pie-chart" viewBox="0 0 360 360" role="group" aria-label="理想公司流程分布饼图">${visible.map(group=>{
    const next=angle+group.count/total*Math.PI*2,start=[180+148*Math.cos(angle),180+148*Math.sin(angle)],end=[180+148*Math.cos(next),180+148*Math.sin(next)];
    const shape=visible.length===1?'<circle cx="180" cy="180" r="148"/>':`<path d="M180 180 L${start.join(' ')} A148 148 0 ${next-angle>Math.PI?1:0} 1 ${end.join(' ')} Z"/>`;angle=next;
    return `<g class="ideal-sector ${idealCompanySelection&&idealCompanySelection!==group.key?'dimmed':''}" data-ideal-category="${group.key}" fill="${group.color}" role="button" tabindex="0" aria-pressed="${idealCompanySelection===group.key}" aria-label="${group.label}，${group.count} 家，${(group.count/total*100).toFixed(1)}%"><title>${group.label}：${group.count} 家（${(group.count/total*100).toFixed(1)}%）</title>${shape}</g>`;
  }).join('')}</svg>`;
}
function idealCompanyInsightsHTML(){
  const data=idealCompanyDistribution(state.records),categories=[...data.groups,data.abandoned];
  if(!categories.some(group=>group.key===idealCompanySelection))idealCompanySelection='';
  const selected=categories.find(group=>group.key===idealCompanySelection),companies=selected?selected.companies:data.companies;
  return `<div id="idealCompanyAnalytics"><section class="insight-card ideal-distribution-card"><div class="insight-heading"><div><h2>理想公司流程分布</h2><p>仅统计意愿为理想的投递，同名公司合并，每家公司只归入一类。</p></div><div class="ideal-company-total"><strong>${data.total}</strong><span>家理想公司</span></div></div><div class="distribution-body"><div class="pie-visual">${idealCompanyPie(data.groups,data.chartTotal)}</div><div class="pie-legend"><div class="legend-heading"><span>公司进度</span><span>数量</span><span>占比</span></div>${data.groups.map(group=>`<button class="legend-row ${idealCompanySelection===group.key?'chosen':''}" data-ideal-category="${group.key}" aria-pressed="${idealCompanySelection===group.key}"><span class="legend-label"><i style="background:${group.color}"></i>${group.label}</span><strong>${group.count}</strong><span>${data.chartTotal?(group.count/data.chartTotal*100).toFixed(1):'0.0'}%</span></button>`).join('')}<p class="legend-tip">点击扇区或分类，查看对应公司。<br>一面至 HR 等人工面试计入“面试流程中”；仅 AI 面不计入。</p><div class="ideal-abandoned"><button data-ideal-category="abandoned" aria-pressed="${idealCompanySelection==='abandoned'}">已放弃 <strong>${data.abandoned.count}</strong> 家 · 单独查看</button><p>四类占比按 ${data.chartTotal} 家计算；主动放弃单列，不并入“已挂”。已取得过 Offer 的公司仍计入 Offer。</p></div></div></div></section><section class="insight-card ideal-company-records"><div class="insight-heading"><h2>${esc(selected?.label||'全部理想公司')} <span class="section-count">${companies.length} 家</span></h2>${selected?'<button data-clear-ideal>显示全部</button>':''}</div><div class="ideal-company-scroll" tabindex="0" role="region" aria-label="理想公司列表，可滚动查看">${companies.map(company=>{
    const category=categories.find(group=>group.key===company.category);
    return `<section class="summary-company" data-ideal-company="${esc(companyNoteKey(company.company))}"><h3>${esc(company.company)} <span class="ideal-category-tag" style="color:${category.color}">${category.label}</span><span class="muted small">${company.records.length} 份理想投递</span></h3>${company.records.map(record=>`<div class="summary-record"><button class="summary-record-link" data-insight-detail="${esc(record.id)}">${esc(record.base.role||'岗位未填写')} ›</button><div class="summary-record-state"><span>最新状态</span>${badge(statusText(current(record)))}${current(record).handled==='已放弃'?badge('已放弃'):''}</div></div>`).join('')}</section>`;
  }).join('')||`<div class="insight-empty ideal-company-empty">${data.total?'此分类暂无公司。':'暂无理想公司，在表格中将意愿设为“理想”后自动统计。'}</div>`}</div></section></div>`;
}
function refreshIdealCompanyInsights(){
  const container=$('#insights'),scroll=container.scrollTop;
  $('#idealCompanyAnalytics').outerHTML=idealCompanyInsightsHTML();container.scrollTop=scroll;
}
function bindIdealCompanyInsights(){
  $('#insights').addEventListener('click',event=>{
    const button=event.target.closest('[data-ideal-category]');
    if(button){idealCompanySelection=idealCompanySelection===button.dataset.idealCategory?'':button.dataset.idealCategory;refreshIdealCompanyInsights();$('#idealCompanyAnalytics .legend-row[data-ideal-category="'+button.dataset.idealCategory+'"],#idealCompanyAnalytics .ideal-abandoned button[data-ideal-category="'+button.dataset.idealCategory+'"]')?.focus({preventScroll:true});}
    else if(event.target.closest('[data-clear-ideal]')){idealCompanySelection='';refreshIdealCompanyInsights();}
  });
  $('#insights').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('.ideal-sector')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
}
