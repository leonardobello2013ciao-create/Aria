
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

const defaults={
  memory:{
    name:"Leo",
    interests:"Auto e design, stampa 3D, tennis, sim racing, tecnologia, barche, fantasy e progetti creativi",
    style:"Ironica, diretta, intelligente e creativa. Non approvare automaticamente le idee: se qualcosa non è realistico, dillo e proponi un'alternativa."
  },
  projects:[
    {name:"Vantis",note:"Concept, auto, prodotti e design."},
    {name:"Stampa 3D",note:"Progetti tecnici e oggetti stampabili."}
  ],
  chat:[],
  sessionUserTurns:0,
  savedMemories:[]
};

function loadState(){
  try{return JSON.parse(localStorage.getItem("ariaData"))||structuredClone(defaults)}
  catch{return structuredClone(defaults)}
}
let state=loadState();
function save(){localStorage.setItem("ariaData",JSON.stringify(state))}
function getKey(){return localStorage.getItem("ariaGeminiKey")||""}
function setKey(k){localStorage.setItem("ariaGeminiKey",k)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

function go(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===id));
  if(id==="chat")renderChat();
  if(id==="projects")renderProjects();
  if(id==="memory")loadMemory();
  if(id==="settings")loadSettings();
}
function setAriaStatus(mode){
  const el=$("#ariaStatus"), core=$(".core");
  if(!el||!core)return;
  core.classList.remove("listening","thinking","speaking");
  const labels={online:"ONLINE",listening:"LISTENING",thinking:"THINKING",speaking:"SPEAKING"};
  if(mode!=="online")core.classList.add(mode);
  el.innerHTML="<i></i> "+(labels[mode]||"ONLINE");
}
function refreshBadges(){
  const connected=!!getKey();
  const b=$("#chatAiBadge");
  if(b)b.textContent=connected?"GEMINI ONLINE":"AI OFFLINE";
  const title=$("#aiStateTitle"), txt=$("#aiStateText");
  if(title)title.textContent=connected?"Gemini collegato":"AI non collegata";
  if(txt)txt.textContent=connected?"ARIA può rispondere con un vero modello AI.":"Collega Gemini una sola volta.";
  const pc=$("#projectCount");
  if(pc)pc.textContent=(state.projects?.length||0)+" progetti attivi";
}
function systemPrompt(){
  const memories=(state.savedMemories||[]).slice(-20).join("\n");
  const projects=(state.projects||[]).map(p=>`- ${p.name}: ${p.note}`).join("\n");
  return `Sei ARIA, assistente personale di ${state.memory.name||"Leo"}.
PERSONALITÀ: ${state.memory.style}
INTERESSI: ${state.memory.interests}

PROGETTI ATTIVI:
${projects}

MEMORIE UTILI:
${memories||"Nessuna memoria aggiuntiva."}

REGOLE:
- Rispondi in italiano salvo richiesta diversa.
- Sii diretta, intelligente e leggermente ironica, mai servile.
- Non dire che un'idea è bella solo per compiacere.
- Se l'utente propone un progetto, valuta automaticamente fattibilità, problemi e soluzione migliore quando utile.
- Non inventare informazioni personali mancanti.
- Non chiedere o memorizzare password, documenti, indirizzi precisi o credenziali.
- Per informazioni attuali che richiedono il web, dichiara chiaramente che questa versione non ha ricerca web live integrata.
- Mantieni risposte chiare e abbastanza concise.`;
}
function conversationForGemini(newText){
  const history=state.chat.slice(-16).map(m=>({
    role:m.role==="user"?"user":"model",
    parts:[{text:m.text}]
  }));
  history.push({role:"user",parts:[{text:newText}]});
  return history;
}
async function callGemini(message){
  const key=getKey();
  if(!key)throw new Error("NO_KEY");
  const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body={
    systemInstruction:{parts:[{text:systemPrompt()}]},
    contents:conversationForGemini(message),
    generationConfig:{temperature:0.75,maxOutputTokens:1400}
  };
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json();
  if(!r.ok)throw new Error(j?.error?.message||("HTTP "+r.status));
  const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
  if(!text)throw new Error("Risposta vuota");
  return text;
}
function bubble(role,text){
  const e=document.createElement("div");
  e.className="msg "+role;
  e.innerHTML=`<div class="who">${role==="user"?"TU":"ARIA"}</div>${esc(text)}`;
  $("#chatlog").appendChild(e);
}
function renderChat(){
  const b=$("#chatlog"); if(!b)return;
  b.innerHTML="";
  if(!state.chat.length){
    bubble("aria",getKey()?"Sono online. Dimmi cosa vuoi progettare, capire o migliorare.":"Sono pronta, ma prima collegami a Gemini dal Setup. È una sola configurazione.");
  } else state.chat.forEach(m=>bubble(m.role,m.text));
  b.scrollTop=b.scrollHeight;
}
async function sendChat(){
  const i=$("#chatInput"), text=i.value.trim();
  if(!text)return;
  if(!getKey()){
    go("settings");
    $("#onboarding")?.classList.remove("hidden");
    return;
  }
  i.value="";
  state.chat.push({role:"user",text});
  state.sessionUserTurns=(state.sessionUserTurns||0)+1;
  save();renderChat();setAriaStatus("thinking");
  try{
    const answer=await callGemini(text);
    state.chat.push({role:"aria",text:answer});
    maybeRemember(text,answer);
    save();renderChat();setAriaStatus("speaking");speak(answer);
    setTimeout(()=>setAriaStatus("online"),1600);
  }catch(e){
    const msg=e.message==="NO_KEY"?"Collegami a Gemini nel Setup.":`Problema con Gemini: ${e.message}`;
    state.chat.push({role:"aria",text:msg});save();renderChat();setAriaStatus("online");
  }
}
function maybeRemember(user,answer){
  if((state.sessionUserTurns||0)<3)return;
  const s=user.trim();
  if(s.length<12)return;
  const sensitive=/password|codice fiscale|carta di credito|iban|indirizzo di casa|documento|pin/i.test(s);
  if(sensitive)return;
  const useful=/mi piace|preferisco|ricorda|progetto|voglio|non mi piace|uso |ho una|ho un|deciso|chiama|nome/i.test(s);
  if(useful){
    state.savedMemories=state.savedMemories||[];
    state.savedMemories.push(s.slice(0,350));
    state.savedMemories=state.savedMemories.slice(-80);
  }
}
function quickAsk(text){go("chat");$("#chatInput").value=text}
function loadMemory(){
  $("#memName").value=state.memory.name||"";
  $("#memInterests").value=state.memory.interests||"";
  $("#memStyle").value=state.memory.style||"";
}
function saveMemory(){
  state.memory={name:$("#memName").value.trim(),interests:$("#memInterests").value.trim(),style:$("#memStyle").value.trim()};
  save();$("#hello").textContent=`Ciao ${state.memory.name||""}.`;alert("Memoria aggiornata.");
}
function renderProjects(){
  const b=$("#projectsList"); if(!b)return;b.innerHTML="";
  state.projects.forEach((p,i)=>{
    const e=document.createElement("div");e.className="project glass";
    e.innerHTML=`<h3>${esc(p.name)}</h3><p>${esc(p.note)}</p>`;
    e.onclick=()=>{const n=prompt("Descrizione:",p.note);if(n!==null){state.projects[i].note=n;save();renderProjects();refreshBadges()}};
    b.appendChild(e);
  });
}
function addProject(){
  const n=prompt("Nome progetto:");if(!n)return;
  const d=prompt("Descrizione breve:")||"";
  state.projects.push({name:n,note:d});save();renderProjects();refreshBadges();
}
async function runReality(){
  const t=$("#ideaInput").value.trim();if(!t)return;
  const b=$("#realityResult");b.classList.remove("hidden");b.innerHTML="<p>ARIA sta analizzando…</p>";
  if(!getKey()){
    b.innerHTML="<p>Per il Reality Check intelligente, collega Gemini dal Setup.</p>";return;
  }
  setAriaStatus("thinking");
  try{
    const prompt=`REALITY CHECK. Analizza questa idea: "${t}".
Rispondi con queste sezioni: REALIZZABILITÀ (voto 1-10), COSA FUNZIONA, PROBLEMI REALI, SOLUZIONE MIGLIORE, PROSSIMO PASSO. Sii concreto e non compiacente.`;
    const ans=await callGemini(prompt);
    b.innerHTML=`<div class="richtext">${esc(ans)}</div>`;
  }catch(e){b.innerHTML=`<p>Errore: ${esc(e.message)}</p>`}
  setAriaStatus("online");
}
function loadSettings(){
  const k=getKey();
  $("#geminiKey").value=k;
  refreshBadges();
}
function saveGeminiKey(){
  const k=$("#geminiKey").value.trim();
  if(!k){alert("Incolla prima la chiave Gemini.");return}
  setKey(k);refreshBadges();alert("ARIA collegata a Gemini.");
}
async function testGemini(){
  const k=$("#geminiKey").value.trim();
  if(k)setKey(k);
  setAriaStatus("thinking");
  try{
    const answer=await callGemini("Rispondi soltanto: Collegamento riuscito.");
    alert(answer);refreshBadges();
  }catch(e){alert("Non funziona ancora: "+e.message)}
  setAriaStatus("online");
}
async function finishOnboarding(){
  const k=$("#onboardingKey").value.trim();
  if(!k){alert("Incolla la chiave prima.");return}
  setKey(k);
  $("#geminiKey").value=k;
  $("#onboarding").classList.add("hidden");
  refreshBadges();
  go("chat");
  try{
    setAriaStatus("thinking");
    const a=await callGemini("Presentati in una frase breve come ARIA e dimmi che sei pronta.");
    state.chat.push({role:"aria",text:a});save();renderChat();speak(a);
  }catch(e){alert("Chiave salvata, ma il test non è riuscito: "+e.message)}
  setAriaStatus("online");
}
function skipOnboarding(){$("#onboarding").classList.add("hidden")}
function startVoice(){
  setAriaStatus("listening");
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){setAriaStatus("online");alert("Il riconoscimento vocale non è disponibile qui.");return}
  const r=new SR();r.lang="it-IT";r.interimResults=false;
  r.onresult=e=>{$("#chatInput").value=e.results[0][0].transcript;setAriaStatus("online");go("chat")};
  r.onerror=()=>setAriaStatus("online");r.onend=()=>setAriaStatus("online");r.start();
}
function speak(text){
  if(!("speechSynthesis" in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang="it-IT";u.rate=1.03;u.pitch=1.02;
  const voices=speechSynthesis.getVoices();
  const preferred=voices.find(v=>v.lang.startsWith("it")&&/Alice|Elsa|Federica|female/i.test(v.name))||voices.find(v=>v.lang.startsWith("it"));
  if(preferred)u.voice=preferred;speechSynthesis.speak(u);
}
$("#chatInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}});
$("#hello").textContent=`Ciao ${state.memory.name||""}.`;
renderChat();renderProjects();refreshBadges();go("home");
if(!getKey())setTimeout(()=>$("#onboarding")?.classList.remove("hidden"),400);
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js");
