let chunks1=[],chunks2=[],mediaRecorder1=null,mediaRecorder2=null,blob1=null,blob2=null;

function scoreBadge(label,val){
  if(typeof val!=='number')return'';
  const cls=val>=80?'good':val>=60?'warn':'bad';
  return `<span class="badge ${cls}">${label}: ${Math.round(val)}</span>`;
}
function rubricNote(overall){
  if(overall>=85)return{level:"good",text:"Excellent pronunciation control and consistency."};
  if(overall>=75)return{level:"good",text:"Strong overall. Minor issues with specific sounds or rhythm."};
  if(overall>=65)return{level:"warn",text:"Fair. Work on clarity, stress, and pacing for consistency."};
  if(overall>=55)return{level:"warn",text:"Needs improvement. Practice core sounds and sentence rhythm."};
  return{level:"bad",text:"Weak. Focus on foundational sounds and slow, clear delivery."};
}
function estimateIELTS(overall){
  if(overall>=85)return"≈ IELTS 7.0–7.5 (pronunciation component)";
  if(overall>=75)return"≈ IELTS 6.5–7.0 (pronunciation component)";
  if(overall>=65)return"≈ IELTS 6.0–6.5 (pronunciation component)";
  if(overall>=55)return"≈ IELTS 5.5–6.0 (pronunciation component)";
  return"≈ IELTS ≤5.0–5.5 (pronunciation component)";
}
function estimateEIKEN(overall){
  if(overall>=85)return"≈ EIKEN Pre-1 range (pronunciation)";
  if(overall>=75)return"≈ EIKEN 2–Pre-1 (pronunciation)";
  if(overall>=65)return"≈ EIKEN 2 (pronunciation)";
  if(overall>=55)return"≈ EIKEN Pre-2–2 (pronunciation)";
  return"≈ EIKEN 3–Pre-2 (pronunciation)";
}
function renderRubric(id,overall){
  const el=document.getElementById(id);
  if(!el)return;
  if(typeof overall!=='number'){el.innerHTML='<span class="muted">No overall score.</span>';return;}
  const r=rubricNote(overall),ielts=estimateIELTS(overall),eiken=estimateEIKEN(overall);
  const border=r.level==='good'?'#2e7d32':(r.level==='warn'?'#f9a825':'#c62828');
  el.innerHTML=`<div style="border-left:4px solid ${border};padding-left:10px;">
    <div><strong>Rubric:</strong> ${r.text}</div>
    <div><strong>Estimates:</strong> ${ielts}; ${eiken}</div>
    <div class="muted" style="font-size:0.85em;margin-top:4px;">* Estimates are based on pronunciation score only.</div>
  </div>`;
}
