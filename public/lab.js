const output=document.querySelector('#output');
async function call(route,data){const r=await fetch('/api/'+route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();output.textContent=JSON.stringify({status:r.status,...v},null,2);return v;}
document.addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target,v=Object.fromEntries(new FormData(f)),button=f.querySelector('button');button.disabled=true;
 try{
 if(f.id==='login'){const s=await call('login',v);if(s.user)document.querySelector('#identity').textContent=`Signed in as ${s.user.name} · ID ${s.user.id} · ${s.user.role}`;}
 if(f.id==='search')await call('lab/search?q='+encodeURIComponent(v.q));
 if(f.id==='profile')await call('lab/profile',JSON.parse(v.json));
 if(f.id==='entry')await call('lab/entry?'+new URLSearchParams(v));
 if(f.id==='payout')await call('lab/payout',{amountCents:Number(v.amountCents)});
 if(f.id==='picks')await call('picks',{weekId:Number(v.weekId),picks:Array.from({length:5},(_,i)=>({gameId:'demo-'+i,side:'home'}))});
 }catch(err){output.textContent=err.message;}finally{button.disabled=false;}
});
