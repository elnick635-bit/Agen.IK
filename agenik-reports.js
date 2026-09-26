/* ================================================================
   AGENIK · Informes Premium
   Datos reales + preview + exportación PDF vectorial multipágina.
   No depende de AGENIK AI; si está disponible, puede enriquecer recomendaciones.
   ================================================================ */
(function(){
"use strict";

const REPORT_TYPES={
  week:{label:"Informe semanal",short:"Semanal",desc:"Tu semana actual comparada con la anterior."},
  month:{label:"Informe mensual",short:"Mensual",desc:"Una lectura completa del mes y su evolución."},
  year:{label:"Informe anual",short:"Anual",desc:"Panorama general del año y comparación anterior."},
  goal:{label:"Informe de una meta",short:"Meta",desc:"Hábitos, objetivos y progreso de una meta específica."}
};

function reportCanUsePremium(){return typeof hasPremiumAccess==="function"&&hasPremiumAccess()}
function reportEnsureHistory(){if(!Array.isArray(state.reportHistory))state.reportHistory=[];return state.reportHistory}
function reportDateLabel(d){try{return d.toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"})}catch(_){return String(d)}}
function reportIsoDate(d){return iso(new Date(d.getFullYear(),d.getMonth(),d.getDate()))}
function reportPctDiff(a,b){return b&&b.tot?((a.pct||0)-(b.pct||0)):null}
function reportClamp(n,a,b){return Math.max(a,Math.min(b,n))}
function reportAllGoals(){return typeof allGoals==="function"?allGoals():(state.goals||[])}
function reportActiveGoals(){return reportAllGoals().filter(g=>!g.archived)}
function reportGoalById(id){return typeof goalById==="function"?goalById(id):reportAllGoals().find(g=>g.id===id)}
function reportObjectivesForGoal(g){return (state.objectives||[]).filter(o=>o.goalId===g.id)}
function reportHabitsForGoal(g){
  if(typeof goalHabits==="function")return goalHabits(g);
  const ids=new Set(reportObjectivesForGoal(g).map(o=>o.id));
  return (state.habits||[]).filter(h=>ids.has(h.objectiveId));
}
function reportHabitStats(h,days){return typeof habitStats==="function"?habitStats(h,days):rangeStats([h],days)}
function reportObjStats(o){return typeof objectiveStats==="function"?objectiveStats(o):{pct:o.completed?100:0}}
function reportGoalStats(g){return typeof goalStats==="function"?goalStats(g):{pct:0,total:0,doneCount:0}}
function reportStatusText(o,st){
  if(st&&st.pct>=100)return "Completado";
  if(o.deadline){const delta=Math.round((fromIso(o.deadline)-today())/86400000);if(delta<0)return "Atrasado";if(delta<=3)return "Próximo a vencer"}
  return "En curso";
}

function reportRange(type,goalId,anchorDate){
  const a=anchorDate?new Date(anchorDate):new Date();a.setHours(0,0,0,0);
  if(type==="week"){
    const s=startWeek(a),e=addDays(s,6),ps=addDays(s,-7),pe=addDays(e,-7);
    return {days:daysRange(iso(s),iso(e)),prevDays:daysRange(iso(ps),iso(pe)),label:"Semana del "+fmtDate(iso(s))+" al "+fmtDate(iso(e)),prevLabel:"semana anterior",anchor:iso(a)};
  }
  if(type==="month"){
    const s=new Date(a.getFullYear(),a.getMonth(),1),e=new Date(a.getFullYear(),a.getMonth()+1,0),ps=new Date(a.getFullYear(),a.getMonth()-1,1),pe=new Date(a.getFullYear(),a.getMonth(),0);
    return {days:daysRange(iso(s),iso(e)),prevDays:daysRange(iso(ps),iso(pe)),label:cap(MONTHS[a.getMonth()])+" "+a.getFullYear(),prevLabel:"mes anterior",anchor:iso(a)};
  }
  if(type==="year"){
    const s=new Date(a.getFullYear(),0,1),e=new Date(a.getFullYear(),11,31),ps=new Date(a.getFullYear()-1,0,1),pe=new Date(a.getFullYear()-1,11,31);
    return {days:daysRange(iso(s),iso(e)),prevDays:daysRange(iso(ps),iso(pe)),label:String(a.getFullYear()),prevLabel:"año anterior",anchor:iso(a)};
  }
  const g=reportGoalById(goalId);let start=iso(addDays(a,-29));
  if(g){
    if(g.startDate)start=g.startDate;
    else{const objs=reportObjectivesForGoal(g),hs=reportHabitsForGoal(g),dates=[];objs.forEach(o=>{if(o.startDate)dates.push(o.startDate);else if(o.since)dates.push(o.since)});hs.forEach(h=>{if(h.since)dates.push(h.since)});if(dates.length)start=dates.sort()[0]}
  }
  const end=iso(a);if(start>end)start=end;
  return {days:daysRange(start,end),prevDays:[],label:g?("Meta · "+g.name):"Meta",prevLabel:"",anchor:iso(a)};
}

function reportStreakForRange(hs,days){
  let run=0,best=0,current=0,lastBreak=null;
  days.forEach((d,idx)=>{const act=hs.filter(h=>counts(h,d));if(!act.length)return;const ok=act.every(h=>done(h,d));if(ok){run++;best=Math.max(best,run);if(idx===days.length-1||d===iso(today()))current=run}else{if(run)lastBreak=d;run=0;current=0}});
  if(days.length&&days[days.length-1]<iso(today()))current=run;
  return {current,best,lastBreak};
}
function reportWeekdayStats(hs,days){
  const rows=Array.from({length:7},(_,i)=>({i,scheduled:0,done:0,pct:null}));
  days.forEach(d=>{const i=dow(fromIso(d));hs.forEach(h=>{if(counts(h,d)){rows[i].scheduled++;if(done(h,d))rows[i].done++}})});
  rows.forEach(r=>r.pct=r.scheduled?Math.round(r.done/r.scheduled*100):null);return rows;
}
function reportEvolution(hs,days,type){
  const out=[];
  if(type==="year"){
    const first=fromIso(days[0]);for(let m=0;m<12;m++){const d=new Date(first.getFullYear(),m,1),md=monthDays(d).filter(x=>x>=days[0]&&x<=days[days.length-1]),st=rangeStats(hs,md);if(st.tot)out.push({label:MONTHS[m].slice(0,3),pct:st.pct,hours:st.hours})}
  }else{
    let i=0;while(i<days.length){const chunk=days.slice(i,i+7),st=rangeStats(hs,chunk);if(st.tot)out.push({label:type==="week"?DAYN[dow(fromIso(chunk[0]))]:("S"+(Math.floor(i/7)+1)),pct:st.pct,hours:st.hours});i+=7}
  }
  return out;
}
function reportLocalRecommendations(data){
  const r=[];const m=data.metrics,delta=m.delta;
  if(delta!=null&&delta<=-8)r.push("Tu cumplimiento bajó "+Math.abs(delta)+" puntos frente al período anterior. Reducir carga o redistribuir hábitos puede ayudarte a recuperar regularidad.");
  else if(delta!=null&&delta>=8)r.push("Tu cumplimiento subió "+delta+" puntos. Conviene mantener la estructura que usaste en este período antes de sumar más exigencia.");
  if(data.habits.length){const weak=[...data.habits].filter(x=>x.scheduled>=2).sort((a,b)=>a.pct-b.pct)[0];if(weak&&weak.pct<65)r.push("“"+weak.name+"” es el hábito con menor cumplimiento del informe ("+weak.pct+"%). Podés revisar su frecuencia, horario o dificultad.");const best=[...data.habits].sort((a,b)=>b.pct-a.pct)[0];if(best&&best.pct>=80)r.push("“"+best.name+"” es una buena referencia de constancia ("+best.pct+"%). Intentá replicar su contexto en otros hábitos.")}
  const valid=data.weekdays.filter(x=>x.pct!=null);if(valid.length){const worst=[...valid].sort((a,b)=>a.pct-b.pct)[0],best=[...valid].sort((a,b)=>b.pct-a.pct)[0];if(best&&worst&&best.i!==worst.i&&best.pct-worst.pct>=15)r.push(cap(DAYFULL[worst.i])+" es tu día más difícil ("+worst.pct+"%) y "+DAYFULL[best.i]+" el más fuerte ("+best.pct+"%). Podés mover tareas exigentes hacia tus días más constantes.")}
  if(m.perfectDays===0&&m.records>0)r.push("No hubo días perfectos en el período. En vez de buscar cumplir todo, priorizá 1 o 2 hábitos clave por día.");
  if(data.type==="goal"&&data.goal){const gs=reportGoalStats(data.goal);if(gs.daysLeft!=null&&gs.daysLeft>=0&&gs.pct<50&&gs.daysLeft<14)r.push("La meta está en "+gs.pct+"% y quedan "+gs.daysLeft+" días. Conviene revisar objetivos pendientes y fechas intermedias.")}
  if(!r.length)r.push("Tus datos no muestran una alerta clara. Mantené el ritmo y acumulá más registros para obtener recomendaciones más específicas.");
  return r.slice(0,5);
}

function reportBuildData(type,goalId,options,anchorDate){
  const opts=Object.assign({habits:true,goals:true,objectives:true,charts:true,recommendations:true,ai:false},options||{}),range=reportRange(type,goalId,anchorDate),goal=type==="goal"?reportGoalById(goalId):null;
  const hs=goal?reportHabitsForGoal(goal):(typeof statsHabitsOf==="function"?statsHabitsOf():habitsOf());
  const st=rangeStats(hs,range.days),prev=range.prevDays.length?rangeStats(hs,range.prevDays):null,delta=prev?reportPctDiff(st,prev):null,streak=reportStreakForRange(hs,range.days),weekdays=reportWeekdayStats(hs,range.days),evolution=reportEvolution(hs,range.days,type);
  const habits=hs.map(h=>{const x=reportHabitStats(h,range.days),si=typeof streakInfo==="function"?streakInfo(h):{cur:0,best:0};return {id:h.id,name:h.name,pct:x.tot?x.pct:0,scheduled:x.tot,records:x.fullDays,hours:x.hours||0,currentStreak:si.cur||0,bestStreak:si.best||0,type:h.type}}).filter(x=>x.scheduled||x.hours).sort((a,b)=>b.pct-a.pct);
  let goals=goal?[goal]:reportActiveGoals();goals=goals.map(g=>{const s=reportGoalStats(g);return {id:g.id,name:g.name,pct:Math.round(s.pct||0),done:s.doneCount||0,total:s.total||0,deadline:g.deadline||null}}).sort((a,b)=>b.pct-a.pct);
  let objectives=goal?reportObjectivesForGoal(goal):(state.objectives||[]).filter(o=>!o.archived&&!o.parentObjectiveId&&(!o.goalId||!reportGoalById(o.goalId)?.archived));objectives=objectives.map(o=>{const s=reportObjStats(o);return {id:o.id,name:o.name,pct:Math.round(s.pct||0),goalName:o.goalId?(reportGoalById(o.goalId)?.name||""):"",status:reportStatusText(o,s),deadline:o.deadline||null}}).sort((a,b)=>b.pct-a.pct);
  const title=type==="week"?"Tu informe semanal":type==="month"?"Tu informe mensual":type==="year"?"Tu informe anual":("Informe de "+(goal?goal.name:"meta"));
  const data={type,title,periodLabel:range.label,anchorDate:range.anchor,generatedAt:Date.now(),goal,options:opts,metrics:{compliance:st.tot?st.pct:0,scheduled:st.tot,records:st.fullDays,hours:st.hours||0,perfectDays:typeof statsPerfectDays==="function"?statsPerfectDays(hs,range.days):0,currentStreak:streak.current,bestStreak:streak.best,delta,prevCompliance:prev&&prev.tot?prev.pct:null},habits,goals,objectives,weekdays,evolution,recommendations:[],aiRecommendation:""};
  data.recommendations=reportLocalRecommendations(data);return data;
}

function reportMetricNode(value,label,extra){const d=el("div","report-metric");d.append(el("b","",String(value)),el("span","",label+(extra?" · "+extra:"")));return d}
function reportSection(title,sub){const s=el("section","report-section");s.append(el("h3","",title));if(sub)s.append(el("div","sub",sub));return s}
function reportListRows(items,valueFn){const w=el("div","report-list");items.forEach(x=>{const r=el("div","report-list-row"),cp=el("div");cp.append(el("b","",x.name));const sub=[];if(x.goalName)sub.push(x.goalName);if(x.status)sub.push(x.status);if(x.deadline)sub.push("hasta "+fmtDate(x.deadline));if(x.records!=null)sub.push(x.records+" de "+x.scheduled+" registros");if(sub.length)cp.append(el("span","",sub.join(" · ")));r.append(cp,el("strong","",valueFn(x)));w.appendChild(r)});return w}
function reportChartNode(data){const c=el("div","report-chart");const max=Math.max(100,...data.map(x=>x.pct||0));data.forEach(x=>{const col=el("div","report-chart-col"),bar=el("i");bar.style.height=Math.max(3,Math.round((x.pct||0)/max*100))+"%";col.append(bar,el("small","",x.label));c.appendChild(col)});return c}

function reportRenderPreview(data){
  const shell=el("div","report-preview-shell");
  const cover=el("section","report-cover");cover.append(el("small","","AGENIK · INFORME"),el("h2","",data.title),el("p","",data.periodLabel+" · generado "+reportDateLabel(new Date(data.generatedAt))));shell.appendChild(cover);
  const summary=reportSection("Resumen","Datos calculados con los registros reales de AGENIK"),grid=el("div","report-metric-grid");grid.append(reportMetricNode(data.metrics.compliance+"%","cumplimiento general"),reportMetricNode(data.metrics.records+" / "+data.metrics.scheduled,"registros completados"),reportMetricNode(fmtH(data.metrics.hours),"horas registradas"),reportMetricNode(data.metrics.perfectDays,"días perfectos"),reportMetricNode(data.metrics.currentStreak,"racha actual"),reportMetricNode(data.metrics.bestStreak,"mejor racha"));if(data.metrics.delta!=null)grid.append(reportMetricNode((data.metrics.delta>=0?"+":"")+data.metrics.delta+" pts","vs. período anterior",data.metrics.prevCompliance+"% antes"));summary.appendChild(grid);shell.appendChild(summary);
  if(data.options.charts&&data.evolution.length){const sec=reportSection("Evolución","Cumplimiento por períodos con actividad registrada");sec.appendChild(reportChartNode(data.evolution));shell.appendChild(sec)}
  if(data.options.habits){const sec=reportSection("Hábitos",data.habits.length?"Más constantes arriba; todos los porcentajes salen del período seleccionado":"Sin hábitos con actividad en el período");if(data.habits.length)sec.appendChild(reportListRows(data.habits,x=>x.pct+"%"));shell.appendChild(sec)}
  if(data.options.goals){const sec=reportSection("Metas","Estado actual de las metas incluidas en el informe");if(data.goals.length)sec.appendChild(reportListRows(data.goals,x=>x.pct+"%"));else sec.appendChild(el("p","sub","No hay metas para mostrar."));shell.appendChild(sec)}
  if(data.options.objectives){const sec=reportSection("Objetivos","Progreso actual y estado de objetivos principales");if(data.objectives.length)sec.appendChild(reportListRows(data.objectives,x=>x.pct+"%"));else sec.appendChild(el("p","sub","No hay objetivos para mostrar."));shell.appendChild(sec)}
  const valid=data.weekdays.filter(x=>x.pct!=null);if(valid.length){const sec=reportSection("Días de la semana","Promedio de cumplimiento según el día");const w=el("div","report-weekdays");data.weekdays.forEach(x=>{const d=el("div","report-weekday");d.append(el("b","",DAYN[x.i]),el("span","",x.pct==null?"—":x.pct+"%"));w.appendChild(d)});sec.appendChild(w);shell.appendChild(sec)}
  if(data.options.recommendations){const sec=reportSection("Qué podés mejorar","Recomendaciones locales; el informe no depende de IA"),w=el("div","report-recommendations");data.recommendations.forEach(t=>w.appendChild(el("div","report-recommendation",t)));sec.appendChild(w);if(typeof agenikAiRecommendationsReply==="function"){const ai=el("button","btn sec","Mejorar recomendaciones con AGENIK AI");ai.onclick=()=>{try{const rr=agenikAiRecommendationsReply(),txt=typeof rr==="string"?rr:(rr&&rr.text)||"";data.aiRecommendation=txt;if(txt){let box=sec.querySelector(".report-ai-box");if(!box){box=el("div","report-ai-box");sec.appendChild(box)}box.textContent=txt;ai.textContent="Recomendaciones de AGENIK AI generadas"}}catch(e){toast("AGENIK AI no pudo generar recomendaciones ahora")}};sec.appendChild(ai)}shell.appendChild(sec)}
  return shell;
}

function openReportPremiumPreview(){
  openModal(m=>{m.classList.add("report-center-modal");m.append(el("div","premium-kicker","AGENIK PREMIUM"),el("h2","","Informes profesionales"),el("p","sub","Descubrí cómo evolucionaste este mes y exportá un PDF estructurado con tus datos reales."));const p=el("div","report-premium-preview");p.append(el("b","","Tu informe mensual"),el("div","fake-line"),el("div","fake-line"),el("div","fake-line"));m.appendChild(p);const b=el("button","btn pri","Generar informe con Premium");b.onclick=()=>{if(typeof statsOpenPremiumInfo==="function"){closeModal();setTimeout(statsOpenPremiumInfo,50)}else toast("AGENIK Premium desbloquea los informes")};m.appendChild(b);const c=el("button","btn sec","Cancelar");c.onclick=closeModal;m.appendChild(c)})
}

function reportHistoryBlock(){const hist=reportEnsureHistory().slice(-6).reverse();if(!hist.length)return null;const box=el("div","report-history");box.append(el("b","","Historial de referencias"),el("div","sub","AGENIK guarda solo la referencia del informe, no el PDF pesado."));const l=el("div","report-history-list");hist.forEach(h=>{const r=el("div","report-history-item"),cp=el("div");cp.append(el("b","",h.title||"Informe"),el("span","",h.periodLabel||""));r.append(cp,el("span","",reportDateLabel(new Date(h.createdAt))));l.appendChild(r)});box.appendChild(l);return box}

function openAgenikReportsCenter(){
  if(!reportCanUsePremium()){openReportPremiumPreview();return}
  let type="month",goalId=(reportActiveGoals()[0]||reportAllGoals()[0]||{}).id||"",opts={habits:true,goals:true,objectives:true,charts:true,recommendations:true};
  openModal(m=>{m.classList.add("report-center-modal");m.append(el("div","premium-kicker","AGENIK PREMIUM"),el("h2","","Generar informe"),el("p","sub","Elegí el período y qué información querés incluir. El PDF solo contendrá lo que marques acá."));
    const tg=el("div","report-type-grid"),goalWrap=el("div");function paintTypes(){tg.replaceChildren();Object.entries(REPORT_TYPES).forEach(([id,x])=>{const b=el("button","report-type-btn"+(type===id?" on":""));b.type="button";b.append(el("b","",x.short),el("span","",x.desc));b.onclick=()=>{type=id;paintTypes();paintGoal()};tg.appendChild(b)})}paintTypes();m.appendChild(tg);
    function paintGoal(){goalWrap.replaceChildren();if(type!=="goal")return;const goals=reportAllGoals();if(!goals.length){goalWrap.appendChild(el("p","sub","Todavía no tenés metas para generar un informe específico."));return}const s=el("select","report-goal-select");goals.forEach(g=>s.appendChild(new Option(g.name+(g.archived?" · archivada":""),g.id)));if(!goalId)goalId=goals[0].id;s.value=goalId;s.onchange=()=>goalId=s.value;goalWrap.append(el("label","sub","Meta específica"),s)}paintGoal();m.appendChild(goalWrap);
    const op=el("div","report-options");[["habits","Incluir hábitos"],["goals","Incluir metas"],["objectives","Incluir objetivos"],["charts","Incluir gráficos"],["recommendations","Incluir recomendaciones"]].forEach(([k,t])=>{const l=el("label","report-option"),i=el("input");i.type="checkbox";i.checked=opts[k];i.onchange=()=>opts[k]=i.checked;l.append(i,el("span","",t));op.appendChild(l)});m.appendChild(op);
    const gen=el("button","btn pri","Generar vista previa");gen.onclick=()=>{if(type==="goal"&&!goalId){toast("Elegí una meta");return}const data=reportBuildData(type,goalId,opts);closeModal();setTimeout(()=>openAgenikReportPreview(data),50)};m.appendChild(gen);const h=reportHistoryBlock();if(h)m.appendChild(h);const c=el("button","btn sec","Cancelar");c.onclick=closeModal;m.appendChild(c)
  })
}

function openAgenikReportPreview(data){
  openModal(m=>{m.classList.add("agenik-report-modal");m.append(el("div","premium-kicker","INFORME AGENIK"),el("h2","",data.title),el("p","sub",data.periodLabel));m.appendChild(reportRenderPreview(data));const acts=el("div","report-preview-actions"),pdf=el("button","btn pri","Exportar como PDF"),back=el("button","btn sec","Editar selección"),cancel=el("button","btn sec","Cerrar");pdf.onclick=()=>reportExportPdf(data);back.onclick=()=>{closeModal();setTimeout(openAgenikReportsCenter,50)};cancel.onclick=closeModal;acts.append(pdf,back,cancel);m.appendChild(acts)})
}

function reportStatsEntryCard(){
  const premium=reportCanUsePremium(),c=el("section","card report-entry-card"+(premium?"":" is-free")),cp=el("div","report-entry-copy");cp.append(el("div","stats-premium-label",premium?"INFORMES PREMIUM":"AGENIK PREMIUM"),el("h2","",premium?"Convertí tus datos en un informe":"Descubrí cómo evolucionaste este mes"),el("p","sub",premium?"Generá informes semanales, mensuales, anuales o de una meta y exportalos como PDF.":"Vista previa de informes profesionales basados en tus registros reales."));if(!premium){const mini=el("div","report-mini-preview");mini.append(el("span","","82% cumplimiento"),el("span","","12 días perfectos"),el("span","","+9 pts vs anterior"));cp.appendChild(mini)}const a=el("div","report-entry-actions"),b=el("button","btn pri",premium?"Generar informe":"Generar informe con Premium");b.onclick=()=>premium?openAgenikReportsCenter():openReportPremiumPreview();a.appendChild(b);c.append(cp,a);return c
}
function reportProfileRow(){return settingRow("▤","Informes",reportCanUsePremium()?"Semanal, mensual, anual o por meta":"Premium · informes y PDF",()=>reportCanUsePremium()?openAgenikReportsCenter():openReportPremiumPreview())}

/* --------------------------- PDF -------------------------------- */
function reportPdfClean(s){return String(s==null?"":s).replace(/[–—]/g,"-").replace(/→/g,"->").replace(/↑/g,"+").replace(/↓/g,"-").replace(/•/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/€/g,"EUR").replace(/[^\x09\x0A\x0D\x20-\xFF]/g,"")}
function reportPdfEsc(s){return reportPdfClean(s).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function reportPdfWrap(s,maxChars){const words=reportPdfClean(s).split(/\s+/),lines=[];let cur="";words.forEach(w=>{const n=cur?cur+" "+w:w;if(n.length>maxChars&&cur){lines.push(cur);cur=w}else cur=n});if(cur)lines.push(cur);return lines}
function reportPdfRgb(hex){hex=String(hex||"#0D5A3E").replace("#","");if(hex.length===3)hex=hex.split("").map(x=>x+x).join("");return [parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255]}
class AgenikPdf{
  constructor(){this.pages=[];this.W=595;this.H=842;this.current=null}
  page(bg){const p={cmd:[]};this.pages.push(p);this.current=p;if(bg)this.rect(0,0,this.W,this.H,bg,null);return p}
  cmd(s){this.current.cmd.push(s)}
  rect(x,y,w,h,fill,stroke){if(fill){const c=reportPdfRgb(fill);this.cmd(c.join(" ")+" rg")}if(stroke){const c=reportPdfRgb(stroke);this.cmd(c.join(" ")+" RG")}this.cmd(x+" "+(this.H-y-h)+" "+w+" "+h+" re "+(fill&&stroke?"B":fill?"f":"S"))}
  line(x1,y1,x2,y2,color,width){const c=reportPdfRgb(color);this.cmd(c.join(" ")+" RG "+(width||1)+" w "+x1+" "+(this.H-y1)+" m "+x2+" "+(this.H-y2)+" l S")}
  text(s,x,y,size,bold,color){const c=reportPdfRgb(color||"#173329");this.cmd("BT /"+(bold?"F2":"F1")+" "+size+" Tf "+c.join(" ")+" rg "+x+" "+(this.H-y)+" Td ("+reportPdfEsc(s)+") Tj ET")}
  build(){
    const objs=[];const add=s=>{objs.push(s);return objs.length};const font1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),font2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");const contentIds=[],pageIds=[];
    this.pages.forEach(p=>{const stream=p.cmd.join("\n");contentIds.push(add("<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream"));pageIds.push(add("PENDING"))});
    const pagesId=add("PAGESPENDING"),catalogId=add("<< /Type /Catalog /Pages "+pagesId+" 0 R >>");
    pageIds.forEach((id,i)=>{objs[id-1]="<< /Type /Page /Parent "+pagesId+" 0 R /MediaBox [0 0 "+this.W+" "+this.H+"] /Resources << /Font << /F1 "+font1+" 0 R /F2 "+font2+" 0 R >> >> /Contents "+contentIds[i]+" 0 R >>"});
    objs[pagesId-1]="<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>";
    let out="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n",offsets=[0];objs.forEach((o,i)=>{offsets.push(out.length);out+=(i+1)+" 0 obj\n"+o+"\nendobj\n"});const xref=out.length;out+="xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n";for(let i=1;i<offsets.length;i++)out+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";out+="trailer\n<< /Size "+(objs.length+1)+" /Root "+catalogId+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;return bytes
  }
}
function reportPdfBuildBytes(data){
  const pdf=new AgenikPdf(),green="#0F6A4A",dark="#071B14",ink="#173329",muted="#6C7E76",light="#EEF5F1",line="#D7E5DE";let y=0;
  function newContentPage(){pdf.page("#F8FBF9");pdf.rect(0,0,595,48,dark,null);pdf.text("AGENIK",38,31,16,true,"#EAF7F0");pdf.text(data.title,390,30,8,false,"#B5D7C7");y=78}
  function ensure(h){if(y+h>790)newContentPage()}
  function heading(t,sub){ensure(56);pdf.text(t,38,y,17,true,ink);y+=18;if(sub){reportPdfWrap(sub,82).slice(0,2).forEach(l=>{pdf.text(l,38,y,9,false,muted);y+=12})}y+=8}
  function metricBoxes(items){const cols=3,w=164,h=58,g=8,rowsN=Math.ceil(items.length/cols);ensure(rowsN*(h+g)+16);for(let i=0;i<items.length;i++){const c=i%cols,row=Math.floor(i/cols),x=38+c*(w+g),yy=y+row*(h+g);pdf.rect(x,yy,w,h,light,line);pdf.text(items[i][0],x+12,yy+23,16,true,green);pdf.text(items[i][1],x+12,yy+42,8,false,muted)}y+=rowsN*(h+g)+18}
  function rows(items,valueFn,subFn,max){items=(items||[]).slice(0,max||12);items.forEach(x=>{ensure(38);pdf.line(38,y+28,557,y+28,line,.6);pdf.text(x.name,38,y+13,10,true,ink);const sub=subFn?subFn(x):"";if(sub)pdf.text(sub,38,y+25,7.5,false,muted);pdf.text(valueFn(x),500,y+16,10,true,green);y+=34});y+=20}
  function chart(series){ensure(190);const x=48,yy=y+12,w=495,h=130;pdf.line(x,yy+h,x+w,yy+h,line,1);if(!series.length){pdf.text("Sin datos suficientes para graficar.",x,yy+60,9,false,muted);y+=175;return}const max=100,bw=Math.max(7,Math.min(22,(w/series.length)*.55)),step=w/series.length;series.forEach((p,i)=>{const bh=Math.max(2,reportClamp((p.pct||0)/max*h,0,h)),bx=x+i*step+(step-bw)/2,by=yy+h-bh;pdf.rect(bx,by,bw,bh,green,null);pdf.text(p.label,bx-2,yy+h+14,6.5,false,muted)});y+=180}
  // portada
  pdf.page(dark);pdf.rect(0,0,595,842,dark,null);pdf.rect(38,90,5,92,green,null);pdf.text("AGENIK",52,114,17,true,"#B8F0D1");pdf.text("INFORME PROFESIONAL",52,139,9,true,"#76CBA4");const titleLines=reportPdfWrap(data.title,28);titleLines.forEach((l,i)=>pdf.text(l,52,215+i*37,30,true,"#F4FBF7"));pdf.text(data.periodLabel,52,330,13,false,"#B8CEC3");pdf.text("Generado el "+reportDateLabel(new Date(data.generatedAt)),52,358,9,false,"#7FA495");pdf.text(data.metrics.compliance+"%",52,675,48,true,"#8CE5B7");pdf.text("cumplimiento general",52,700,10,false,"#B8CEC3");pdf.text(data.metrics.records+" / "+data.metrics.scheduled+" registros · "+fmtH(data.metrics.hours)+" · "+data.metrics.perfectDays+" días perfectos",52,735,9,false,"#B8CEC3");
  newContentPage();heading("Resumen",data.periodLabel);const mets=[[data.metrics.compliance+"%","Cumplimiento"],[data.metrics.records+" / "+data.metrics.scheduled,"Registros"],[fmtH(data.metrics.hours),"Horas"],[String(data.metrics.perfectDays),"Días perfectos"],[String(data.metrics.currentStreak),"Racha actual"],[String(data.metrics.bestStreak),"Mejor racha"]];if(data.metrics.delta!=null)mets.push([(data.metrics.delta>=0?"+":"")+data.metrics.delta+" pts","Vs. anterior"]);metricBoxes(mets);
  if(data.options.charts){heading("Evolución","Cumplimiento por períodos con actividad registrada");chart(data.evolution)}
  if(data.options.habits){heading("Hábitos","Cumplimiento dentro del período seleccionado");rows(data.habits,x=>x.pct+"%",x=>x.records+" de "+x.scheduled+" registros" ,18)}
  if(data.options.goals){heading("Metas","Estado actual");rows(data.goals,x=>x.pct+"%",x=>(x.done+" de "+x.total+" objetivos")+(x.deadline?" · hasta "+fmtDate(x.deadline):""),14)}
  if(data.options.objectives){heading("Objetivos","Progreso y estado actual");rows(data.objectives,x=>x.pct+"%",x=>(x.goalName?x.goalName+" · ":"")+x.status,18)}
  const wd=data.weekdays.filter(x=>x.pct!=null);if(wd.length){heading("Días de la semana","Promedio de cumplimiento por día");const items=data.weekdays.map(x=>[DAYFULL[x.i],x.pct==null?"—":x.pct+"%"]);items.forEach(([n,v])=>{ensure(27);pdf.text(cap(n),38,y+12,9,true,ink);const p=v==="—"?0:Number(v.replace("%",""));pdf.rect(130,y+4,330,10,"#E7EFEA",null);if(p)pdf.rect(130,y+4,330*p/100,10,green,null);pdf.text(v,485,y+12,9,true,green);y+=23});y+=26}
  if(data.options.recommendations){heading("Qué podés mejorar","Recomendaciones calculadas localmente con tus datos");data.recommendations.forEach(t=>{const lines=reportPdfWrap(t,88);ensure(lines.length*12+18);pdf.rect(38,y-3,5,Math.max(22,lines.length*12+8),green,null);lines.forEach((l,i)=>pdf.text(l,52,y+9+i*12,9,false,ink));y+=lines.length*12+17});if(data.aiRecommendation){ensure(60);pdf.text("AGENIK AI",38,y,10,true,green);y+=14;reportPdfWrap(data.aiRecommendation,88).slice(0,14).forEach(l=>{ensure(15);pdf.text(l,38,y,8.5,false,ink);y+=11})}}
  return pdf.build()
}
function reportBytesToBase64(bytes){let out="",chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk){const sub=bytes.subarray(i,Math.min(i+chunk,bytes.length));out+=String.fromCharCode.apply(null,sub)}return btoa(out)}
function reportFileName(data){const base=data.type==="week"?"semanal":data.type==="month"?"mensual":data.type==="year"?"anual":"meta";return "AGENIK-informe-"+base+"-"+String(data.anchorDate||iso(today())).replace(/[^0-9-]/g,"")+".pdf"}
function reportRemember(data,filename){const h=reportEnsureHistory();h.push({id:"rep_"+Date.now().toString(36),type:data.type,title:data.title,periodLabel:data.periodLabel,goalId:data.goal?data.goal.id:null,anchorDate:data.anchorDate,createdAt:Date.now(),filename,options:Object.assign({},data.options)});if(h.length>30)h.splice(0,h.length-30);if(typeof touch==="function")touch();else if(typeof persist==="function")persist()}
let reportPendingAndroidExport=null;
function reportExportPdf(data){
  try{const bytes=reportPdfBuildBytes(data),fn=reportFileName(data);if(window.AndroidBridge&&typeof AndroidBridge.savePdf==="function"){reportPendingAndroidExport={data,fn};AndroidBridge.savePdf(fn,reportBytesToBase64(bytes));toast("Elegí dónde guardar el PDF");return}const blob=new Blob([bytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);reportRemember(data,fn);toast("Informe PDF generado") }catch(e){console.error("AGENIK reports PDF",e);toast("No se pudo generar el PDF")}
}
function reportAndroidPdfSaved(ok,msg){if(ok&&reportPendingAndroidExport){reportRemember(reportPendingAndroidExport.data,reportPendingAndroidExport.fn);toast("Informe PDF guardado")}else if(!ok&&msg!=="cancelled")toast("No se pudo guardar el PDF");reportPendingAndroidExport=null}

// API pública para el index y para tests de la capa PDF.
globalThis.openAgenikReportsCenter=openAgenikReportsCenter;
globalThis.openReportPremiumPreview=openReportPremiumPreview;
globalThis.reportStatsEntryCard=reportStatsEntryCard;
globalThis.reportProfileRow=reportProfileRow;
globalThis.reportBuildData=reportBuildData;
globalThis.reportExportPdf=reportExportPdf;
globalThis.__agenikPdfSaved=reportAndroidPdfSaved;
globalThis.AGENIK_REPORTS_TEST={buildPdfBytes:reportPdfBuildBytes};
})();
