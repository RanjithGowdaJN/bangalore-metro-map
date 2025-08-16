// src/planner.js  — minimal, works with /data/*.json (fare.json is singular)
async function j(url){const r=await fetch(url);if(!r.ok)throw new Error(`Failed ${url}`);return r.json();}
function qget(){const p=new URLSearchParams(location.search);return{from:p.get("from")||"",to:p.get("to")||""};}
function qset(obj){const p=new URLSearchParams(location.search);for(const[k,v]of Object.entries(obj)){v?p.set(k,v):p.delete(k)}history.pushState(null,"",`${location.pathname}?${p.toString()}#planner`);}
function bfs(g,a,b){if(!a||!b||a===b)return[];const Q=[a],seen=new Set([a]),prev={};while(Q.length){const u=Q.shift();for(const v of(g[u]||[])){if(seen.has(v))continue;seen.add(v);prev[v]=u;if(v===b){const path=[v];let cur=v;while(prev[cur]){cur=prev[cur];path.push(cur)}return path.reverse()}Q.push(v)}}return[]}
function tmin(path,em,head=6){if(!path||path.length<2)return 0;let s=0;for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],k=`${a}__${b}`;s+=em[k]??2}return s+Math.round(head/2)}
function fare(path,slabs=[10,15,20,25,30]){if(!path||path.length<2)return 0;const h=path.length-1;return h<=2?slabs[0]:h<=4?slabs[1]:h<=7?slabs[2]:h<=10?slabs[3]:slabs[4]}

export async function initPlanner(opts){
  // Elements
  const els={from:document.querySelector(opts.fromSelect),to:document.querySelector(opts.toSelect),
             towards:document.querySelector(opts.towardsContainer),out:document.querySelector(opts.results)};
  const root=opts.dataRoot||"./data";

  // Load data
  const [stations,lines,fareCfg,rt]=await Promise.all([
    j(`${root}/stations.json`), j(`${root}/lines.json`),
    j(`${root}/fare.json`).catch(()=>({})), j(`${root}/runtime.json`).catch(()=>({}))
  ]);

  // Lookups + graph
  const byId={}, graph={};
  stations.forEach(s=>{byId[s.id]=s; graph[s.id]=s.neighbors||[]});

  // Populate selects
  const optsHTML = (arr)=>'<option value="">Select station</option>'+arr.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  els.from.innerHTML=optsHTML(stations); els.to.innerHTML=optsHTML(stations);

  // Render “towards” buttons based on selected station lines
  function renderTowards(id){
    els.towards.innerHTML=""; if(!id) return;
    const st=byId[id]; const lineIds=st?.lines||[];
    const btns=[];
    lineIds.forEach(lid=>{
      const L=lines.find(x=>x.id===lid); if(!L) return;
      (L.terminals||[]).forEach(term=>{
        const b=document.createElement("button");
        b.className="towards-btn"; b.textContent=`Towards ${byId[term]?.name||term}`;
        b.onclick=()=>{els.towards.querySelectorAll(".towards-btn").forEach(x=>x.classList.remove("active")); b.classList.add("active"); qset({towards:term});};
        btns.push(b);
      });
    });
    btns.forEach(b=>els.towards.appendChild(b));
  }

  function render(path){
    const mins=tmin(path, rt.edgeMinutes||{}, rt.headwayMin||6);
    const rs=`<div class="row"><div>Stops</div><div>${Math.max(0,(path?.length||1)-1)}</div></div>
              <div class="row"><div>Estimated time</div><div>${mins} min</div></div>
              <div class="row"><div>Transfers</div><div>0</div></div>
              <div class="row"><div>Estimated fare</div><div>₹${fare(path, fareCfg.perHop||[10,15,20,25,30])}</div></div>
              <div class="row"><div>First / Last train</div><div>05:00 / 23:00</div></div>`;
    els.out.innerHTML=rs;
  }

  function compute(){const a=els.from.value,b=els.to.value;if(!a||!b)return; const path=bfs(graph,a,b); render(path); qset({from:a,to:b});}

  // Wire UI
  els.from.addEventListener("change",()=>{const id=els.from.value; renderTowards(id); qset({from:id}); if(opts.scrollTarget&&id) document.querySelector(opts.scrollTarget).scrollIntoView({behavior:"smooth"});});
  els.to.addEventListener("change",compute);
  document.getElementById("planBtn").addEventListener("click",compute);

  // Prefill from URL
  const q=qget(); if(q.from){els.from.value=q.from; renderTowards(q.from)}; if(q.to){els.to.value=q.to}; if(q.from&&q.to) compute();

  // Expose tiny API for the map
  plannerAPI.setFrom=(id,{scroll=true}={})=>{ if(!byId[id]) return; els.from.value=id; renderTowards(id); qset({from:id}); if(scroll&&opts.scrollTarget) document.querySelector(opts.scrollTarget).scrollIntoView({behavior:"smooth"}); };
  plannerAPI.setTo=(id)=>{ if(!byId[id]) return; els.to.value=id; compute(); };
  plannerAPI.setTowards=(id)=> qset({towards:id});
}
export const plannerAPI={ setFrom:()=>{}, setTo:()=>{}, setTowards:()=>{}, compute:()=>{} };

// Make it available globally (so your map can call it). Safe if index also assigns it.
if (typeof window!=="undefined" && !window.MetroPlanner){ window.MetroPlanner = plannerAPI; }
