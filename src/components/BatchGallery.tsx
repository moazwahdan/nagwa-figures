import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBatchStore, switchBatchRow, setBatchReviewed } from '../core/batch';
import { Preview } from './Preview';
import { SceneSvg } from './SceneSvg';
/** Fixed-height cards keep scroll positions stable across different image ratios.
 * Only the visible window plus one card on either side owns SVG trees. */
export function BatchGallery(){
  const rows=useBatchStore(s=>s.rows),active=useBatchStore(s=>s.active);
  const viewport=useRef<HTMLDivElement>(null),clicked=useRef(false);
  const [metrics,setMetrics]=useState({height:600,width:800,top:0});
  const rowHeight=Math.max(450,Math.min(710,metrics.width*.58+130)),gap=20,stride=rowHeight+gap;
  useLayoutEffect(()=>{
    const el=viewport.current!;
    const update=()=>setMetrics({height:el.clientHeight,width:el.clientWidth,top:el.scrollTop});
    const observer=new ResizeObserver(update);observer.observe(el);update();return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    if(clicked.current){clicked.current=false;return;}
    const top=active*stride;
    if(top<el.scrollTop||top+rowHeight>el.scrollTop+el.clientHeight){el.scrollTop=top;setMetrics(m=>({...m,top:el.scrollTop}));}
  },[active,stride,rowHeight]);
  const start=Math.max(0,Math.floor(metrics.top/stride)-1),end=Math.min(rows.length,Math.ceil((metrics.top+metrics.height)/stride)+1);
  const choose=(index:number)=>{if(index===active)return;clicked.current=true;switchBatchRow(index);};
  return <div className="batch-gallery" ref={viewport} aria-label="Image review stream" onScroll={e=>{const top=e.currentTarget.scrollTop;setMetrics(m=>({...m,top}));}}>
    <div className="batch-gallery-space" style={{height:rows.length*stride-gap}}>
      {rows.slice(start,end).map((row,n)=>{const index=start+n,isActive=index===active;return <article key={index} data-batch-index={index} className={`batch-image-card ${isActive?'active':''}`} style={{height:rowHeight,top:index*stride}}>
        <div className="batch-card-heading"><button className="batch-card-select" aria-pressed={isActive} onClick={()=>choose(index)}><span>{String(index+1).padStart(2,'0')}</span><b>{row.project.settings.fileName}</b><em>{isActive?'Editing':row.reviewed?'Reviewed':'Not reviewed'}</em></button><span>{row.project.scene.canvas.w} × {row.project.scene.canvas.h}</span></div>
        <div className="stage-grid batch-card-previews">
          {isActive?<><Preview lang="ar"/><Preview lang="en"/></>:(['ar','en'] as const).map(lang=><div key={lang} className="preview-col"><div className="preview-title"><span className={`badge badge-${lang}`}>{lang.toUpperCase()}</span>{lang==='ar'?'Arabic · عربي':'English'}</div><button className="readonly-preview" onClick={()=>choose(index)} aria-label={`Edit image ${index+1} ${lang}`}><SceneSvg data={row.project.scene} lang={lang}/></button></div>)}
        </div>
        <div className="batch-card-footer"><span>{isActive?'Editing this image · tools and properties apply here':'Select this image to edit'}</span>{isActive?<label className="check tiny"><input type="checkbox" aria-label="Card reviewed" checked={row.reviewed} onChange={e=>setBatchReviewed(e.target.checked)}/>Reviewed</label>:<button className="btn sm" onClick={()=>choose(index)}>Edit image</button>}</div>
      </article>;})}
    </div>
  </div>;
}
