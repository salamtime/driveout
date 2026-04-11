const e=t=>{if(!t)return"N/A";const r=String(t).trim();return r?r.startsWith("RNT-")?r:r.includes("-")&&r.length>=8?`RNT-${r.slice(0,8).toUpperCase()}`:r:"N/A"};export{e as f};
