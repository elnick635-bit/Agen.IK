/* ================================================================
   AGENIK · Motor de Plantillas
   Una plantilla describe preguntas + meta + objetivos + hábitos + notas + tablero.
   El motor resuelve la definición, muestra vista previa y recién crea tras confirmación.
   ================================================================ */
(function(){
"use strict";

let agenikTemplateCategory="Todos";

function canUsePremiumTemplates(){return typeof hasPremiumAccess==="function"&&hasPremiumAccess()}
function agenikTemplatePremiumBadge(){return el("span","stats-premium-badge","AGENIK Premium")}
function agenikTemplateUid(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function agenikTemplateDatePlus(days){return iso(addDays(today(),Number(days)||0))}
function agenikTemplateDateShift(base,days){if(!base||!/\d{4}-\d{2}-\d{2}/.test(base))return null;return iso(addDays(fromIso(base),Number(days)||0))}
function agenikTemplateDayNames(days){return (Array.isArray(days)?days:[]).map(i=>DAYFULL[i]).join(", ")}
function agenikTemplateRoundStep(v,step){step=Number(step)||1;return Math.round((Number(v)||0)/step)*step}

function agenikTemplateDefault(q){
  if(q.default&&typeof q.default==="object"&&q.default.todayPlus!=null)return agenikTemplateDatePlus(q.default.todayPlus);
  if(q.type==="days")return Array.isArray(q.default)?q.default.slice():[0,1,2,3,4,5,6];
  return q.default!=null?q.default:"";
}
function agenikTemplateText(value,answers,ctx={}){
  if(value==null)return "";
  return String(value).replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,k)=>{
    const v=(k in ctx)?ctx[k]:answers[k];
    if(Array.isArray(v))return agenikTemplateDayNames(v);
    return v==null?"":String(v);
  });
}
function agenikTemplateValue(spec,answers,ctx={}){
  if(spec==null)return null;
  if(typeof spec==="number")return spec;
  if(typeof spec==="string"){
    if(/^\{\{.*\}\}$/.test(spec.trim())){const k=spec.trim().slice(2,-2).trim();return (k in ctx)?ctx[k]:answers[k]}
    return agenikTemplateText(spec,answers,ctx);
  }
  if(Array.isArray(spec))return spec.map(x=>agenikTemplateValue(x,answers,ctx));
  if(typeof spec!=="object")return spec;
  if(spec.answer)return answers[spec.answer];
  if(spec.literal!==undefined)return spec.literal;
  if(spec.daysCount)return Math.max(1,(answers[spec.daysCount]||[]).length);
  if(spec.spreadDate){
    const cfg=spec.spreadDate,endRaw=answers[cfg.end],count=Math.max(1,Number(answers[cfg.count])||1),idx=Math.max(1,Number(ctx.index)||1);
    if(!endRaw)return null;const start=fromIso(answers.today||iso(today())),end=addDays(fromIso(endRaw),-(Number(cfg.reserveDays)||0)),span=Math.max(1,Math.round((end-start)/86400000)),offset=Math.max(1,Math.round(span*(idx/(count+1))));return iso(addDays(start,offset));
  }
  if(spec.dateFrom)return agenikTemplateDateShift(answers[spec.dateFrom],spec.offsetDays||0);
  if(spec.op){
    const args=(spec.args||[]).map(x=>Number(agenikTemplateValue(x,answers,ctx))||0);let v=0;
    if(spec.op==="divide")v=args[1]?args[0]/args[1]:0;
    else if(spec.op==="multiply")v=args.reduce((a,b)=>a*b,1);
    else if(spec.op==="add")v=args.reduce((a,b)=>a+b,0);
    else if(spec.op==="subtract")v=(args[0]||0)-(args[1]||0);
    if(spec.min!=null)v=Math.max(Number(spec.min),v);if(spec.max!=null)v=Math.min(Number(spec.max),v);
    if(spec.roundStep)v=agenikTemplateRoundStep(v,spec.roundStep);
    return v;
  }
  return null;
}
function agenikTemplateWhen(cond,answers){
  if(!cond)return true;
  const v=answers[cond.answer];
  if(cond.equals!==undefined)return v===cond.equals;
  if(cond.notEquals!==undefined)return v!==cond.notEquals;
  if(cond.truthy)return !!v;
  return true;
}
function agenikTemplateExpand(defs,answers){
  const out=[];(defs||[]).forEach(def=>{
    if(!agenikTemplateWhen(def.when,answers))return;
    if(def.repeat&&def.repeat.from){
      let n=Math.floor(Number(answers[def.repeat.from])||0);n=Math.max(def.repeat.min||1,Math.min(def.repeat.max||30,n));
      for(let i=1;i<=n;i++)out.push(Object.assign({},def,{repeat:null,__ctx:{index:i}}));
    }else out.push(Object.assign({},def,{__ctx:{}}));
  });return out;
}
function agenikTemplateResolveEntity(def,answers){
  const ctx=def.__ctx||{};const out={};
  for(const [k,v] of Object.entries(def)){
    if(k==="__ctx"||k==="repeat"||k==="when")continue;
    if(k==="key")out.key=agenikTemplateText(v,answers,ctx);
    else if(["name","desc","title","text","unit","description","icon"].includes(k))out[k]=agenikTemplateText(v,answers,ctx);
    else if(k==="days")out.days=Array.isArray(v)?v.slice():agenikTemplateValue(v,answers,ctx);
    else if(k==="target")out.target=agenikTemplateValue(v,answers,ctx);
    else if(k==="deadline")out.deadline=agenikTemplateValue(v,answers,ctx);
    else if(k==="startDate")out.startDate=agenikTemplateValue(v,answers,ctx);
    else out[k]=v;
  }
  return out;
}
function agenikTemplateBuildPlan(tpl,answers){
  const goalDef=agenikTemplateResolveEntity(Object.assign({__ctx:{}},tpl.goalTemplate||{}),answers);
  const objectives=agenikTemplateExpand(tpl.objectiveTemplates,answers).map(d=>agenikTemplateResolveEntity(d,answers));
  const habits=agenikTemplateExpand(tpl.habitTemplates,answers).map(d=>agenikTemplateResolveEntity(d,answers));
  const notes=agenikTemplateExpand(tpl.notes,answers).map(d=>agenikTemplateResolveEntity(d,answers));
  const board=tpl.board?agenikTemplateResolveBoard(tpl.board,answers):null;
  return {templateId:tpl.id,templateName:tpl.name,answers:Object.assign({},answers),goal:goalDef,objectives,habits,notes,board};
}
function agenikTemplateResolveBoard(def,answers){
  const b={title:agenikTemplateText(def.title,answers),description:agenikTemplateText(def.description||"",answers),icon:def.icon||"▦",color:def.color||"#3F9E63",sections:[],items:[]};
  (def.sections||[]).forEach(s=>b.sections.push(Object.assign({},s,{title:agenikTemplateText(s.title,answers)})));
  (def.items||[]).forEach(it=>{
    const x=Object.assign({},it);if(x.title)x.title=agenikTemplateText(x.title,answers);if(x.text)x.text=agenikTemplateText(x.text,answers);if(Array.isArray(x.entries))x.entries=x.entries.map(v=>agenikTemplateText(v,answers));b.items.push(x)
  });
  return b;
}

const AGENIK_TEMPLATES=[
  {
    id:"routine-basic",name:"Rutina básica",icon:"☀",description:"Armá una rutina simple con hábitos, una meta, una nota y un tablero.",category:"Personal",premium:false,color:"#3F9E63",
    questions:[
      {key:"routineName",label:"¿Cómo querés llamar a tu rutina?",help:"Ej. Rutina diaria, Semana ordenada…",type:"text",placeholder:"Mi rutina",default:"Mi rutina",required:true},
      {key:"focus",label:"¿Qué querés priorizar?",type:"select",options:["Orden","Energía","Bienestar","Constancia"]},
      {key:"days",label:"¿Qué días querés seguirla?",type:"days",default:[0,1,2,3,4]},
      {key:"minutes",label:"¿Cuánto tiempo querés dedicar al bloque principal?",type:"number",suffix:"minutos",min:10,max:180,default:30,required:true}
    ],
    goalTemplate:{name:"Sostener {{routineName}}",desc:"Construir una rutina centrada en {{focus}}.",startDate:"{{today}}"},
    objectiveTemplates:[{key:"routine",name:"Cumplir la rutina con constancia",mode:"auto"},{key:"review",name:"Revisar cómo funcionó mi semana",mode:"auto"}],
    habitTemplates:[{key:"plan",name:"Planificar 10 minutos",days:{answer:"days"},type:"check",objectiveKey:"review"},{key:"main",name:"Bloque de {{focus}} · {{minutes}} min",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"minutes"},{literal:60}],min:.25,roundStep:.25},objectiveKey:"routine"}],
    notes:[{key:"improve",title:"Qué quiero mejorar",text:"Mi foco principal con {{routineName}} es {{focus}}. Anotar acá qué funciona y qué quiero ajustar."}],
    board:{title:"{{routineName}}",description:"Vista rápida de mi rutina.",icon:"☀",color:"#3F9E63",items:[{type:"note",title:"FOCO",text:"Prioridad: {{focus}}"}]}
  },
  {
    id:"study-organizer",name:"Organizar estudios",icon:"✎",description:"Ordená una materia con meta, objetivos, hábitos, notas y tablero.",category:"Estudio",premium:false,color:"#5468D4",
    questions:[
      {key:"subject",label:"¿Qué materia querés organizar?",type:"text",placeholder:"Matemática",required:true},
      {key:"days",label:"¿Qué días podés estudiar?",type:"days",default:[0,1,2,3,4]},
      {key:"dailyMinutes",label:"¿Cuántos minutos por día?",type:"number",min:15,max:360,default:60,required:true},
      {key:"goalDate",label:"¿Tenés una fecha objetivo?",help:"Es opcional.",type:"date",required:false}
    ],
    goalTemplate:{name:"Organizar {{subject}}",desc:"Estudiar {{subject}} con un sistema semanal claro.",deadline:"{{goalDate}}",startDate:"{{today}}"},
    objectiveTemplates:[{key:"study",name:"Mantener el estudio semanal",mode:"auto",deadline:"{{goalDate}}"},{key:"review",name:"Repasar contenidos pendientes",mode:"auto",deadline:"{{goalDate}}"}],
    habitTemplates:[{key:"studyhabit",name:"Estudiar {{subject}} · {{dailyMinutes}} min",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"dailyMinutes"},{literal:60}],min:.25,roundStep:.25},objectiveKey:"study"},{key:"reviewhabit",name:"Revisar apuntes de {{subject}}",days:{answer:"days"},type:"check",objectiveKey:"review"}],
    notes:[{key:"pending",title:"Temas pendientes · {{subject}}",text:"Anotá acá temas que todavía necesitás entender o practicar."}],
    board:{title:"Estudio · {{subject}}",description:"Organización visual de {{subject}}.",icon:"✎",color:"#5468D4",items:[{type:"note",title:"PENDIENTES",text:"Usá este tablero para ordenar temas, ejercicios y repasos."}]}
  },
  {
    id:"gym",name:"Gym",icon:"◈",description:"Entrenamiento, seguimiento y progresión en un solo sistema.",category:"Salud",premium:true,color:"#E2574C",
    questions:[{key:"gymGoal",label:"¿Cuál es tu objetivo principal?",type:"select",options:["Ganar masa muscular","Ganar fuerza","Mejorar condición física","Mantenerme activo"]},{key:"days",label:"¿Qué días entrenás?",type:"days",default:[0,2,4]},{key:"sessionMinutes",label:"Duración aproximada de cada sesión",type:"number",min:20,max:180,default:60,required:true},{key:"level",label:"¿Cuál es tu nivel actual?",type:"select",options:["Principiante","Intermedio","Avanzado"]}],
    goalTemplate:{name:"{{gymGoal}}",desc:"Plan de gimnasio · nivel {{level}}.",startDate:"{{today}}"},
    objectiveTemplates:[{key:"sessions",name:"Cumplir mis sesiones semanales",mode:"auto"},{key:"progress",name:"Registrar mi progresión",mode:"auto"}],
    habitTemplates:[{key:"train",name:"Entrenar {{sessionMinutes}} min",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"sessionMinutes"},{literal:60}],min:.25,roundStep:.25},objectiveKey:"sessions"},{key:"loads",name:"Registrar cargas y repeticiones",days:{answer:"days"},type:"check",objectiveKey:"progress"}],
    notes:[{key:"marks",title:"Marcas y progresos",text:"Nivel inicial: {{level}}. Registrar pesos, repeticiones y sensaciones importantes."}],
    board:{title:"Gym · {{gymGoal}}",description:"Entrenamientos y progresión.",icon:"◈",color:"#E2574C",sections:[{title:"SEMANA",x:100,y:170,width:560,height:400,style:"area"},{title:"PROGRESIÓN",x:760,y:170,width:560,height:400,style:"area"}],items:[{type:"heading",title:"GYM",x:100,y:80,width:420,height:70},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:600,width:300,height:165}]}
  },
  {
    id:"university",name:"Universidad",icon:"▤",description:"Organizá cursada, práctica y repaso con una estructura completa.",category:"Estudio",premium:true,color:"#5468D4",
    questions:[{key:"studyArea",label:"¿Qué carrera, materia o bloque querés organizar?",type:"text",placeholder:"Primer cuatrimestre",required:true},{key:"semesterEnd",label:"¿Hasta qué fecha querés organizarte?",type:"date",default:{todayPlus:90},required:true},{key:"days",label:"¿Qué días podés estudiar?",type:"days",default:[0,1,2,3,4]},{key:"hoursWeek",label:"¿Cuántas horas semanales tenés disponibles?",type:"number",min:1,max:60,default:10,required:true}],
    goalTemplate:{name:"Organizar {{studyArea}}",desc:"Plan universitario con estudio, práctica y revisión.",deadline:"{{semesterEnd}}",startDate:"{{today}}"},
    objectiveTemplates:[{key:"classes",name:"Mantener clases y apuntes al día",mode:"auto",deadline:"{{semesterEnd}}"},{key:"practice",name:"Practicar cada semana",mode:"auto",deadline:"{{semesterEnd}}"},{key:"review",name:"Hacer revisión semanal",mode:"auto",deadline:"{{semesterEnd}}"}],
    habitTemplates:[{key:"deep",name:"Estudiar {{studyArea}}",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"hoursWeek"},{daysCount:"days"}],min:.25,roundStep:.25},objectiveKey:"practice"},{key:"notes",name:"Ordenar apuntes",days:{answer:"days"},type:"check",objectiveKey:"classes"},{key:"weekly",name:"Revisión semanal",days:[6],type:"check",objectiveKey:"review"}],
    notes:[{key:"questions",title:"Dudas de {{studyArea}}",text:"Preguntas para llevar a clase, tutoría o resolver durante la semana."},{key:"pending",title:"Pendientes universitarios",text:"Entregas, lecturas y temas que no quiero perder de vista."}],
    board:{title:"Universidad · {{studyArea}}",description:"Cursada, práctica y pendientes.",icon:"▤",color:"#5468D4",sections:[{title:"CURSADA",x:100,y:160,width:520,height:430,style:"area"},{title:"PRÁCTICA",x:700,y:160,width:520,height:430,style:"area"},{title:"PENDIENTES",x:1300,y:160,width:520,height:430,style:"area"}],items:[{type:"heading",title:"{{studyArea}}",x:100,y:75,width:520,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:640,width:300,height:165}]}
  },
  {
    id:"personal-growth",name:"Desarrollo personal",icon:"◇",description:"Convertí un área personal en acciones concretas y revisables.",category:"Personal",premium:true,color:"#8E56CC",
    questions:[{key:"growthArea",label:"¿Qué aspecto querés desarrollar?",type:"text",placeholder:"Confianza, disciplina, comunicación…",required:true},{key:"desiredChange",label:"¿Qué cambio concreto querés notar?",type:"textarea",placeholder:"Quiero poder…",required:true},{key:"days",label:"¿Qué días querés trabajarlo?",type:"days",default:[0,2,4,6]},{key:"minutes",label:"Tiempo por sesión",type:"number",min:10,max:120,default:30,required:true}],
    goalTemplate:{name:"Desarrollar {{growthArea}}",desc:"{{desiredChange}}",startDate:"{{today}}"},
    objectiveTemplates:[{key:"practice",name:"Practicar {{growthArea}} de forma consistente",mode:"auto"},{key:"review",name:"Revisar avances y aprendizajes",mode:"auto"}],
    habitTemplates:[{key:"practiceh",name:"Practicar {{growthArea}} · {{minutes}} min",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"minutes"},{literal:60}],min:.25,roundStep:.25},objectiveKey:"practice"},{key:"reflection",name:"Registrar una reflexión",days:{answer:"days"},type:"check",objectiveKey:"review"}],
    notes:[{key:"journal",title:"Aprendizajes · {{growthArea}}",text:"Cambio que busco: {{desiredChange}}\n\nRegistrar avances, trabas y pequeñas victorias."}],
    board:{title:"Desarrollo · {{growthArea}}",description:"Práctica y reflexiones.",icon:"◇",color:"#8E56CC",items:[{type:"heading",title:"{{growthArea}}",x:100,y:80,width:420,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:180,width:300,height:165}]}
  },
  {
    id:"finances",name:"Finanzas",icon:"$",description:"Presupuesto, ahorro y revisión periódica sin mezclarlo con una planilla enorme.",category:"Finanzas",premium:true,color:"#C9A227",
    questions:[{key:"savingTarget",label:"¿Cuánto querés ahorrar por mes?",type:"number",min:0,default:50000,required:true},{key:"currency",label:"Moneda",type:"select",options:["ARS","USD","EUR"]},{key:"reviewDay",label:"¿Qué día preferís revisar tus finanzas?",type:"select",options:["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]},{key:"mainReason",label:"¿Cuál es tu prioridad?",type:"select",options:["Ahorrar","Controlar gastos","Salir de deudas","Crear un fondo de emergencia"]}],
    goalTemplate:{name:"Ordenar mis finanzas",desc:"Prioridad: {{mainReason}}. Objetivo mensual de ahorro: {{currency}} {{savingTarget}}.",startDate:"{{today}}"},
    objectiveTemplates:[{key:"register",name:"Registrar movimientos",mode:"auto"},{key:"save",name:"Ahorrar {{currency}} {{savingTarget}} por mes",mode:"manual"},{key:"review",name:"Revisar presupuesto semanal",mode:"auto"}],
    habitTemplates:[{key:"expenses",name:"Registrar gastos del día",days:[0,1,2,3,4,5,6],type:"check",objectiveKey:"register"},{key:"budget",name:"Revisión de finanzas · {{reviewDay}}",daysFromWeekday:"reviewDay",type:"check",objectiveKey:"review"}],
    notes:[{key:"expensesnote",title:"Gastos a revisar",text:"Anotá compras o gastos que quieras revisar antes del próximo cierre."},{key:"ideas",title:"Ideas para {{mainReason}}",text:"Acciones concretas que pueden ayudar con mi prioridad financiera."}],
    board:{title:"Finanzas personales",description:"Ahorro, presupuesto y decisiones.",icon:"$",color:"#C9A227",sections:[{title:"PRESUPUESTO",x:100,y:160,width:560,height:420,style:"area"},{title:"AHORRO",x:760,y:160,width:560,height:420,style:"area"}],items:[{type:"heading",title:"FINANZAS",x:100,y:80,width:420,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:620,width:300,height:165}]}
  },
  {
    id:"reading",name:"Lectura",icon:"▥",description:"Transformá un libro o meta de lectura en un sistema constante.",category:"Personal",premium:true,color:"#E08A2E",
    questions:[{key:"book",label:"¿Qué querés leer?",type:"text",placeholder:"Cartas a Lucilio",required:true},{key:"pages",label:"Páginas por sesión",type:"number",min:1,max:200,default:10,required:true},{key:"days",label:"¿Qué días querés leer?",type:"days",default:[0,1,2,3,4,5,6]},{key:"finishDate",label:"¿Tenés una fecha objetivo?",type:"date",required:false}],
    goalTemplate:{name:"Leer {{book}}",desc:"Mantener una lectura constante y registrar ideas importantes.",deadline:"{{finishDate}}",startDate:"{{today}}"},
    objectiveTemplates:[{key:"read",name:"Avanzar con {{book}}",mode:"auto",deadline:"{{finishDate}}"},{key:"ideas",name:"Registrar ideas clave",mode:"auto",deadline:"{{finishDate}}"}],
    habitTemplates:[{key:"readingh",name:"Leer {{pages}} páginas",days:{answer:"days"},type:"check",objectiveKey:"read"},{key:"idea",name:"Guardar una idea de la lectura",days:{answer:"days"},type:"check",objectiveKey:"ideas"}],
    notes:[{key:"quotes",title:"Ideas · {{book}}",text:"Frases, conceptos y preguntas que quiero conservar de esta lectura."}],
    board:{title:"Lectura · {{book}}",description:"Seguimiento e ideas del libro.",icon:"▥",color:"#E08A2E",items:[{type:"heading",title:"{{book}}",x:100,y:80,width:500,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:180,width:300,height:165}]}
  },
  {
    id:"morning",name:"Rutina de mañana",icon:"☼",description:"Diseñá una mañana simple que se adapte a tus días reales.",category:"Salud",premium:true,color:"#E08A2E",
    questions:[{key:"wakeTime",label:"¿A qué hora suele empezar tu mañana?",type:"text",placeholder:"07:00",default:"07:00",required:true},{key:"days",label:"¿Qué días querés seguir esta rutina?",type:"days",default:[0,1,2,3,4]},{key:"morningFocus",label:"¿Qué querés priorizar?",type:"select",options:["Energía","Estudio","Trabajo","Calma","Entrenamiento"]}],
    goalTemplate:{name:"Construir una rutina de mañana",desc:"Empezar mis días a las {{wakeTime}} con foco en {{morningFocus}}.",startDate:"{{today}}"},
    objectiveTemplates:[{key:"start",name:"Empezar la mañana con intención",mode:"auto"},{key:"focus",name:"Completar mi bloque principal",mode:"auto"}],
    habitTemplates:[{key:"plan",name:"Planificar el día · 10 min",days:{answer:"days"},type:"check",objectiveKey:"start"},{key:"move",name:"Moverme 10 minutos",days:{answer:"days"},type:"check",objectiveKey:"start"},{key:"focusblock",name:"Bloque de {{morningFocus}}",days:{answer:"days"},type:"check",objectiveKey:"focus"}],
    notes:[{key:"morningnote",title:"Ajustes de mi mañana",text:"Hora de inicio: {{wakeTime}}. Prioridad: {{morningFocus}}. Anotar qué hace que la rutina sea más fácil de sostener."}],
    board:{title:"Rutina de mañana",description:"Secuencia y ajustes de la mañana.",icon:"☼",color:"#E08A2E",items:[{type:"note",title:"INICIO",text:"Hora objetivo: {{wakeTime}}"},{type:"linked",entityType:"goal",entityKey:"goal"}]}
  },
  {
    id:"productivity",name:"Productividad",icon:"↗",description:"Foco, planificación y revisión para un proyecto o área importante.",category:"Productividad",premium:true,color:"#3F9E63",
    questions:[{key:"focusArea",label:"¿En qué querés ser más productivo?",type:"text",placeholder:"YouTube, trabajo, estudio…",required:true},{key:"days",label:"¿Qué días vas a trabajar en esto?",type:"days",default:[0,1,2,3,4]},{key:"deepMinutes",label:"Duración del bloque de foco",type:"number",min:20,max:240,default:60,required:true},{key:"review",label:"¿Cómo preferís cerrar la semana?",type:"select",options:["Revisión corta","Revisión detallada","Planificar la siguiente semana"]}],
    goalTemplate:{name:"Mejorar mi productividad en {{focusArea}}",desc:"Sistema de foco y revisión para {{focusArea}}.",startDate:"{{today}}"},
    objectiveTemplates:[{key:"focus",name:"Completar bloques de foco",mode:"auto"},{key:"plan",name:"Planificar el trabajo",mode:"auto"},{key:"reviewobj",name:"Revisar la semana",mode:"auto"}],
    habitTemplates:[{key:"deep",name:"Foco en {{focusArea}} · {{deepMinutes}} min",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"deepMinutes"},{literal:60}],min:.25,roundStep:.25},objectiveKey:"focus"},{key:"dailyplan",name:"Definir 3 prioridades",days:{answer:"days"},type:"check",objectiveKey:"plan"},{key:"weeklyreview",name:"{{review}}",days:[6],type:"check",objectiveKey:"reviewobj"}],
    notes:[{key:"ideas",title:"Ideas y bloqueos · {{focusArea}}",text:"Registrar tareas, ideas o bloqueos que no quiero mantener en la cabeza."}],
    board:{title:"Productividad · {{focusArea}}",description:"Foco, pendientes y revisión.",icon:"↗",color:"#3F9E63",sections:[{title:"PRIORIDAD",x:100,y:160,width:540,height:420,style:"area"},{title:"EN CURSO",x:720,y:160,width:540,height:420,style:"area"},{title:"DESPUÉS",x:1340,y:160,width:540,height:420,style:"area"}],items:[{type:"heading",title:"{{focusArea}}",x:100,y:80,width:480,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:640,width:300,height:165}]}
  },
  {
    id:"business",name:"Crear un negocio",icon:"◆",description:"Pasá de una idea a validación, oferta y primer lanzamiento.",category:"Productividad",premium:true,color:"#2C8CB4",
    questions:[{key:"businessName",label:"¿Cómo se llama tu proyecto?",type:"text",placeholder:"Mi negocio",required:true},{key:"businessIdea",label:"¿Qué querés ofrecer?",type:"textarea",placeholder:"Producto, servicio y a quién ayuda…",required:true},{key:"launchDate",label:"¿Cuándo te gustaría lanzar una primera versión?",type:"date",default:{todayPlus:60},required:true},{key:"days",label:"¿Qué días podés trabajar en esto?",type:"days",default:[0,1,2,3,4]},{key:"hoursWeek",label:"Horas disponibles por semana",type:"number",min:1,max:70,default:8,required:true}],
    goalTemplate:{name:"Lanzar {{businessName}}",desc:"{{businessIdea}}",deadline:"{{launchDate}}",startDate:"{{today}}"},
    objectiveTemplates:[{key:"proposal",name:"Definir propuesta de valor",mode:"manual",deadline:{dateFrom:"launchDate",offsetDays:-42}},{key:"validate",name:"Validar la idea con personas reales",mode:"manual",deadline:{dateFrom:"launchDate",offsetDays:-28}},{key:"offer",name:"Preparar una oferta inicial",mode:"manual",deadline:{dateFrom:"launchDate",offsetDays:-14}},{key:"launch",name:"Publicar la primera versión",mode:"manual",deadline:"{{launchDate}}"}],
    habitTemplates:[{key:"work",name:"Trabajar en {{businessName}}",days:{answer:"days"},type:"hours",target:{op:"divide",args:[{answer:"hoursWeek"},{daysCount:"days"}],min:.25,roundStep:.25},objectiveKey:"validate"}],
    notes:[{key:"customers",title:"Personas y problemas",text:"Negocio: {{businessName}}\nIdea: {{businessIdea}}\n\nRegistrar problemas reales, conversaciones y señales de interés."},{key:"ideas",title:"Ideas para {{businessName}}",text:"Pruebas, mejoras y decisiones pendientes."}],
    board:{title:"Negocio · {{businessName}}",description:"De idea a lanzamiento.",icon:"◆",color:"#2C8CB4",sections:[{title:"IDEA",x:100,y:160,width:500,height:420,style:"area"},{title:"VALIDACIÓN",x:680,y:160,width:500,height:420,style:"area"},{title:"LANZAMIENTO",x:1260,y:160,width:500,height:420,style:"area"}],items:[{type:"heading",title:"{{businessName}}",x:100,y:80,width:500,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:640,width:300,height:165}]}
  },
  {
    id:"exam",name:"Preparar un parcial",icon:"◎",description:"Generá un plan personalizado según materia, fecha, unidades y tiempo disponible.",category:"Estudio",premium:true,color:"#5468D4",
    questions:[
      {key:"subject",label:"¿Qué materia rendís?",type:"text",placeholder:"Matemática",required:true},
      {key:"examDate",label:"¿Cuándo es el parcial?",type:"date",default:{todayPlus:30},required:true},
      {key:"units",label:"¿Cuántas unidades entran?",type:"number",min:1,max:20,default:4,required:true},
      {key:"hoursAvailable",label:"¿Cuántas horas por semana podés dedicarle?",type:"number",min:1,max:70,default:10,required:true},
      {key:"availableDays",label:"¿Qué días podés estudiar?",type:"days",default:[0,1,2,3,4,5]},
      {key:"level",label:"¿Cómo te sentís hoy con la materia?",type:"select",options:["Muy flojo","Me falta bastante","Intermedio","Bastante bien"]},
      {key:"preferences",label:"¿Qué querés priorizar?",type:"select",options:["Teoría","Práctica","Mixto","Simulacros"]}
    ],
    goalTemplate:{name:"Aprobar {{subject}}",desc:"Preparar el parcial con foco {{preferences}}. Nivel inicial: {{level}}.",deadline:"{{examDate}}",startDate:"{{today}}"},
    objectiveTemplates:[
      {key:"unit_{{index}}",name:"Repasar Unidad {{index}}",mode:"manual",deadline:{spreadDate:{end:"examDate",count:"units",reserveDays:5}},repeat:{from:"units",min:1,max:20}},
      {key:"practice",name:"Resolver ejercicios",mode:"auto",deadline:{dateFrom:"examDate",offsetDays:-3}},
      {key:"mock",name:"Realizar simulacro",mode:"manual",deadline:{dateFrom:"examDate",offsetDays:-1}}
    ],
    habitTemplates:[
      {key:"study",name:"Estudiar {{subject}}",days:{answer:"availableDays"},type:"hours",target:{op:"divide",args:[{answer:"hoursAvailable"},{daysCount:"availableDays"}],min:.25,roundStep:.25},objectiveKey:"practice"},
      {key:"exercises",name:"Resolver ejercicios de {{subject}}",days:{answer:"availableDays"},type:"check",objectiveKey:"practice"},
      {key:"review",name:"Revisar apuntes de {{subject}}",days:{answer:"availableDays"},type:"check",objectiveKey:"practice"}
    ],
    notes:[{key:"hard",title:"Temas difíciles · {{subject}}",text:"Anotá acá los temas que más cuestan para priorizarlos antes del parcial."},{key:"errors",title:"Errores frecuentes · {{subject}}",text:"Registrar errores de ejercicios y simulacros para no repetirlos."}],
    board:{title:"Preparación {{subject}}",description:"Plan para el parcial del {{examDate}}.",icon:"◎",color:"#5468D4",sections:[{title:"TEORÍA",x:100,y:160,width:520,height:430,style:"area"},{title:"PRÁCTICA",x:700,y:160,width:520,height:430,style:"area"},{title:"SIMULACRO",x:1300,y:160,width:520,height:430,style:"area"}],items:[{type:"heading",title:"PARCIAL · {{subject}}",x:100,y:75,width:540,height:72},{type:"linked",entityType:"goal",entityKey:"goal",x:100,y:650,width:300,height:165},{type:"list",title:"ANTES DEL PARCIAL",entries:["Repasar errores frecuentes","Resolver ejercicios clave","Hacer al menos un simulacro"],x:470,y:650,width:330,height:190}]}
  }
];

function agenikTemplateNormalizeSpecials(plan){
  const weekMap={lunes:0,martes:1,"miércoles":2,miercoles:2,jueves:3,viernes:4,"sábado":5,sabado:5,domingo:6};
  plan.habits.forEach(h=>{
    if(h.daysFromWeekday){const raw=String(plan.answers[h.daysFromWeekday]||"").toLowerCase();h.days=[weekMap[raw]??0];delete h.daysFromWeekday}
    if(!Array.isArray(h.days)||!h.days.length)h.days=[0,1,2,3,4,5,6];
    h.days=[...new Set(h.days.map(Number).filter(x=>x>=0&&x<=6))].sort();
    if(h.type!=="hours")h.type="check";
    if(h.type==="hours"&&(!Number.isFinite(Number(h.target))||Number(h.target)<=0))h.target=.5;
  });
  return plan;
}
function agenikTemplateFind(id){return AGENIK_TEMPLATES.find(t=>t.id===id)||null}
function agenikTemplateOpenPremium(){
  openModal(m=>{m.classList.add("template-premium-modal");m.append(el("div","premium-kicker","AGENIK PREMIUM"),el("h2","","Plantillas completas"),el("p","sub","Las 2 plantillas básicas son gratis. Premium desbloquea planes completos para estudio, salud, productividad, finanzas y proyectos."));const g=el("div","premium-feature-grid");[["✦","Planes personalizados"],["◎","Metas + objetivos"],["✓","Hábitos listos"],["✎","Notas útiles"],["▦","Tableros preparados"],["↗","Más plantillas en el futuro"]].forEach(([i,t])=>{const r=el("div","premium-feature");r.append(el("span","",i),el("b","",t));g.appendChild(r)});m.appendChild(g);const b=el("button","btn pri","Entendido");b.onclick=closeModal;m.appendChild(b)})
}
function agenikTemplateGuard(tpl){if(!tpl.premium||canUsePremiumTemplates())return true;agenikTemplateOpenPremium();return false}

function viewTemplates(){
  const wrapPage=el("div","templates-page");
  const hero=el("section","card templates-hero");hero.append(el("div","stats-premium-label","PLANTILLAS AGENIK"),el("h2","","Empezá con un sistema completo, no con una pantalla vacía"),el("p","","Cada plantilla puede crear metas, objetivos, hábitos, notas y un tablero usando tus respuestas. Siempre ves la propuesta antes de guardar nada."));const meta=el("div","templates-hero-meta");meta.append(el("span","","2 plantillas Free"),el("span","","9 plantillas Premium"),el("span","","Vista previa antes de crear"));hero.appendChild(meta);wrapPage.appendChild(hero);
  const filters=el("div","template-filters");["Todos","Estudio","Salud","Productividad","Personal","Finanzas"].forEach(cat=>{const b=el("button","template-filter"+(agenikTemplateCategory===cat?" on":""),cat);b.onclick=()=>{agenikTemplateCategory=cat;render()};filters.appendChild(b)});wrapPage.appendChild(filters);
  const list=AGENIK_TEMPLATES.filter(t=>agenikTemplateCategory==="Todos"||t.category===agenikTemplateCategory),grid=el("div","template-catalog");
  list.forEach(t=>{const card=el("button","template-card");card.type="button";card.style.setProperty("--template-accent",t.color||"var(--ok)");const top=el("div","template-card-top");top.append(el("span","template-icon",t.icon||"✦"),el("span","template-access"+(t.premium?" premium":""),t.premium?"PREMIUM":"FREE"));card.append(top,el("h3","",t.name),el("p","",t.description));const foot=el("div","template-card-foot");foot.append(el("span","",t.category),el("strong","",t.premium&&!canUsePremiumTemplates()?"Ver Premium →":"Usar plantilla →"));card.appendChild(foot);card.onclick=()=>{if(agenikTemplateGuard(t))agenikTemplateWizard(t,{})};grid.appendChild(card)});
  if(!list.length)grid.appendChild(el("div","card template-empty","No hay plantillas en esta categoría."));wrapPage.appendChild(grid);view.appendChild(wrapPage)
}

function agenikTemplateWizard(tpl,seed){
  if(!agenikTemplateGuard(tpl))return;
  const answers=Object.assign({today:iso(today())},seed||{});tpl.questions.forEach(q=>{if(answers[q.key]===undefined)answers[q.key]=agenikTemplateDefault(q)});let step=0;
  openModal(m=>{m.classList.add("template-wizard");
    const head=el("div","template-wizard-head"),cp=el("div");cp.append(el("div","stats-premium-label",tpl.premium?"PLANTILLA PREMIUM":"PLANTILLA FREE"),el("h2","",tpl.name),el("p","sub",tpl.description));head.append(cp,tpl.premium?agenikTemplatePremiumBadge():el("span","template-access","FREE"));m.appendChild(head);
    const progress=el("div","template-wizard-progress"),bar=el("i");progress.appendChild(bar);m.appendChild(progress);const stage=el("div");m.appendChild(stage);const nav=el("div","template-wizard-nav"),back=el("button","btn sec","Atrás"),next=el("button","btn pri","Siguiente");nav.append(back,next);m.appendChild(nav);const cancel=el("button","btn sec","Cancelar");cancel.style.width="100%";cancel.onclick=closeModal;m.appendChild(cancel);
    let readCurrent=()=>true;
    function paint(){
      stage.replaceChildren();const q=tpl.questions[step];bar.style.width=Math.round(((step+1)/tpl.questions.length)*100)+"%";back.disabled=step===0;next.textContent=step===tpl.questions.length-1?"Ver propuesta":"Siguiente";
      const box=el("div","template-step");box.append(el("div","template-step-kicker","PASO "+(step+1)+" DE "+tpl.questions.length),el("h3","",q.label));if(q.help)box.appendChild(el("p","",q.help));
      let input;
      if(q.type==="select"){input=el("select");(q.options||[]).forEach(x=>input.appendChild(new Option(x,x)));input.value=answers[q.key]||q.options?.[0]||"";box.appendChild(input);readCurrent=()=>{answers[q.key]=input.value;return true}}
      else if(q.type==="days"){const picked=new Set(Array.isArray(answers[q.key])?answers[q.key]:[]),dp=el("div","template-daypick");DAYN.forEach((d,i)=>{const b=el("button",picked.has(i)?"on":"",d);b.type="button";b.onclick=()=>{if(picked.has(i)){if(picked.size>1)picked.delete(i)}else picked.add(i);b.classList.toggle("on",picked.has(i))};dp.appendChild(b)});box.appendChild(dp);readCurrent=()=>{if(!picked.size){toast("Elegí al menos un día");return false}answers[q.key]=[...picked].sort();return true}}
      else if(q.type==="textarea"){input=el("textarea");input.rows=4;input.placeholder=q.placeholder||"";input.value=answers[q.key]||"";box.appendChild(input);readCurrent=()=>{const v=input.value.trim();if(q.required&&!v){input.focus();return false}answers[q.key]=v;return true}}
      else {input=el("input");input.type=q.type==="number"?"number":q.type==="date"?"date":"text";if(q.min!=null)input.min=q.min;if(q.max!=null)input.max=q.max;if(q.placeholder)input.placeholder=q.placeholder;input.value=answers[q.key]??"";box.appendChild(input);if(q.suffix)box.appendChild(el("p","","Unidad: "+q.suffix));readCurrent=()=>{let v=input.value;if(q.type==="number")v=Number(v);if(q.required&&(v===""||v==null||q.type==="number"&&!Number.isFinite(v))){input.focus();return false}if(q.type==="number"){if(q.min!=null&&v<q.min){toast("El mínimo es "+q.min);return false}if(q.max!=null&&v>q.max){toast("El máximo es "+q.max);return false}}answers[q.key]=v;return true}}
      stage.appendChild(box)
    }
    back.onclick=()=>{if(readCurrent()&&step>0){step--;paint()}};
    next.onclick=()=>{if(!readCurrent())return;if(step<tpl.questions.length-1){step++;paint();return}answers.today=iso(today());const plan=agenikTemplateNormalizeSpecials(agenikTemplateBuildPlan(tpl,answers));closeModal();setTimeout(()=>agenikTemplatePreview(tpl,answers,plan),35)};paint()
  })
}

function agenikTemplatePreview(tpl,answers,plan){
  const boardBlocked=!!plan.board&&typeof canCreateBoard==="function"&&!canCreateBoard();
  openModal(m=>{m.classList.add("template-preview");m.append(el("div","stats-premium-label","VISTA PREVIA"),el("h2","",tpl.name),el("p","sub","AGENIK propone crear esto con tus respuestas. No se guarda nada hasta que toques Crear."));
    const summary=el("div","template-preview-summary");[[1,"meta"],[plan.objectives.length,"objetivos"],[plan.habits.length,"hábitos"],[plan.notes.length,"notas"],[plan.board?1:0,"tablero"]].forEach(([n,l])=>{const d=el("div");d.append(el("strong","",String(n)),el("span","",l));summary.appendChild(d)});m.appendChild(summary);
    const goal=el("div","template-preview-block");goal.append(el("strong","","META"),el("h3","",plan.goal.name||"Meta"));if(plan.goal.deadline)goal.appendChild(el("p","sub","Fecha objetivo · "+plan.goal.deadline));m.appendChild(goal);
    function listBlock(title,arr,label){if(!arr.length)return;const b=el("div","template-preview-block"),l=el("div","template-preview-list");b.appendChild(el("strong","",title));arr.forEach(x=>{const r=el("div","template-preview-item");r.append(el("i","","•"),el("span","",label(x)));l.appendChild(r)});b.appendChild(l);m.appendChild(b)}
    listBlock("OBJETIVOS",plan.objectives,x=>x.name+(x.deadline?" · "+x.deadline:""));
    listBlock("HÁBITOS",plan.habits,x=>x.name+" · "+agenikTemplateDayNames(x.days)+(x.type==="hours"?" · "+fmtH(x.target):""));
    listBlock("NOTAS",plan.notes,x=>x.title||"Nota");
    if(plan.board){const b=el("div","template-preview-block");b.append(el("strong","","TABLERO"),el("h3","",plan.board.title),el("p","sub",plan.board.description||"Tablero generado por la plantilla."));m.appendChild(b)}
    if(boardBlocked)m.appendChild(el("div","template-preview-note warn","Tu plan Free ya llegó al límite de 3 tableros activos. No voy a crear parcialmente la plantilla: archivá o eliminá un tablero, o activá Premium, y volvé a intentarlo."));else m.appendChild(el("div","template-preview-note","Podés editar las respuestas antes de crear. La plantilla usa el sistema real de Metas, Objetivos, Hábitos, Notas y Tableros de AGENIK."));
    const actions=el("div","template-preview-actions"),cancel=el("button","btn sec","Cancelar"),edit=el("button","btn sec","Editar"),create=el("button","btn pri","Crear");cancel.onclick=closeModal;edit.onclick=()=>{closeModal();setTimeout(()=>agenikTemplateWizard(tpl,answers),35)};create.disabled=boardBlocked;create.onclick=()=>{const result=agenikTemplateApply(plan);if(!result.ok){toast(result.error||"No se pudo crear la plantilla");return}closeModal();tab="metas";goalDetailId=result.goalId;goalsTab="active";render();window.scrollTo(0,0);toast("Plantilla creada · "+tpl.name)};actions.append(cancel,edit,create);m.appendChild(actions)
  })
}

function agenikTemplateApply(plan){
  if(!plan||!plan.goal)return {ok:false,error:"La propuesta no es válida."};
  if(plan.board&&typeof canCreateBoard==="function"&&!canCreateBoard())return {ok:false,error:"Llegaste al límite de tableros del plan Free."};
  const now=Date.now(),color=AGENIK_TEMPLATES.find(t=>t.id===plan.templateId)?.color||COLORS[(state.goals.length+2)%COLORS.length];
  const ids={objectives:{},habits:{},notes:{}};
  const g={id:agenikTemplateUid("g"),name:plan.goal.name||plan.templateName,desc:plan.goal.desc||"",color,deadline:plan.goal.deadline||null,startDate:plan.goal.startDate||iso(today()),createdAt:new Date().toISOString(),archived:false,progressHistory:[],stages:[]};state.goals.push(g);
  (plan.objectives||[]).forEach((op,idx)=>{const o={id:agenikTemplateUid("o"),goalId:g.id,name:op.name||("Objetivo "+(idx+1)),mode:op.mode||"auto",target:op.target||null,unit:op.unit||"",deadline:op.deadline||g.deadline||null,since:op.startDate||g.startDate,startDate:op.startDate||g.startDate,color:op.color||color,archived:false,completed:false,parentObjectiveId:null,stageId:null,weight:Number(op.weight)||1,recurrence:null,dependsOn:[]};state.objectives.push(o);if(op.key)ids.objectives[op.key]=o.id});
  (plan.habits||[]).forEach((hp,idx)=>{const oid=hp.objectiveKey?ids.objectives[hp.objectiveKey]||null:null,h={id:agenikTemplateUid("h"),name:hp.name||("Hábito "+(idx+1)),color:hp.color||color,days:Array.isArray(hp.days)&&hp.days.length?hp.days:[0,1,2,3,4,5,6],type:hp.type==="hours"?"hours":"check",target:hp.type==="hours"?(Number(hp.target)||.5):null,since:g.startDate};if(oid)h.objectiveId=oid;state.habits.push(h);if(hp.key)ids.habits[hp.key]=h.id});
  (plan.notes||[]).forEach((np,idx)=>{const n={id:agenikTemplateUid("n"),title:np.title||("Nota "+(idx+1)),text:np.text||"",color:np.color||"",pinned:!!np.pinned,updatedAt:now};state.notes.push(n);if(np.key)ids.notes[np.key]=n.id});
  let boardId=null;
  if(plan.board){const p=boardHomeDefaultPosition(boardsOf().length),b={id:agenikTemplateUid("b_"),title:plan.board.title||plan.templateName,description:plan.board.description||"",icon:plan.board.icon||"▦",color:plan.board.color||color,linkedHabitId:null,linkedGoalId:g.id,archived:false,createdAt:now,updatedAt:now,homeX:p.x,homeY:p.y,items:[],sections:[],view:{panX:80,panY:90,scale:1}};const secMap={};(plan.board.sections||[]).forEach((s,i)=>{const sid=agenikTemplateUid("bs_"),key=s.key||("section"+i);secMap[key]=sid;b.sections.push({id:sid,title:s.title||("SECCIÓN "+(i+1)),x:Number(s.x)||100+i*600,y:Number(s.y)||160,width:Number(s.width)||520,height:Number(s.height)||400,color:s.color||color,style:s.style||"basic"})});(plan.board.items||[]).forEach((it,i)=>{let x={id:agenikTemplateUid("bi_"),type:it.type||"note",x:Number(it.x)||120+(i%3)*340,y:Number(it.y)||120+Math.floor(i/3)*210,width:Number(it.width)||280,height:Number(it.height)||160,zIndex:5+i,accent:it.accent||color,sectionId:it.sectionKey?secMap[it.sectionKey]||null:null};if(x.type==="note"){x.title=it.title||"Nota";x.content=it.text||""}else if(x.type==="heading")x.title=it.title||"ENCABEZADO";else if(x.type==="list"){x.title=it.title||"LISTA";x.entries=Array.isArray(it.entries)?it.entries.slice():[]}else if(x.type==="divider"){x.height=32}else if(x.type==="linked"||x.type==="progress"){x.entityType=it.entityType||"goal";if(x.entityType==="goal")x.entityId=g.id;else if(x.entityType==="objective")x.entityId=ids.objectives[it.entityKey]||null;else if(x.entityType==="habit")x.entityId=ids.habits[it.entityKey]||null;else if(x.entityType==="note")x.entityId=ids.notes[it.entityKey]||null;if(!x.entityId)return}b.items.push(x)});state.boards.push(b);boardId=b.id}
  touch();if(boardId&&typeof boardPersist==="function")boardPersist();return {ok:true,goalId:g.id,boardId}
}

window.AGENIK_TEMPLATES=AGENIK_TEMPLATES;
window.canUsePremiumTemplates=canUsePremiumTemplates;
window.viewTemplates=viewTemplates;
window.agenikTemplateWizard=agenikTemplateWizard;
window.__agenikTemplateBuildPlan=agenikTemplateBuildPlan;
})();
