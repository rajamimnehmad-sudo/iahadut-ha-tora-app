export function createNoticeViews({call,storage,online=()=>true}) {
  const done=new Set(),pending=new Map();
  return async key=>{
    if(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)||!online())return false;
    if(done.has(key))return false;
    try {if(storage?.getItem('iht_notice_seen_'+key)==='1')return false;}catch{}
    if(pending.has(key))return pending.get(key);
    const request=Promise.resolve().then(()=>call(key)).then(result=>{
      if(result?.accepted||result?.reason==='duplicate'){
        done.add(key);try{storage?.setItem('iht_notice_seen_'+key,'1');}catch{}
      }
      return Boolean(result?.accepted);
    }).finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  };
}
export function observeNoticeViews({list,visible,record,Observer=IntersectionObserver}) {
  let observer;const timers=new Map();
  const cancel=element=>{clearTimeout(timers.get(element));timers.delete(element);};
  observer=new Observer(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting||entry.intersectionRatio<.25){cancel(entry.target);continue;}
      if(timers.has(entry.target))continue;
      timers.set(entry.target,setTimeout(()=>{
        timers.delete(entry.target);
        if(visible())record(entry.target.dataset.noticeKey).then(()=>observer.unobserve(entry.target)).catch(()=>{});
      },800));
    }
  },{threshold:[0,.25]});
  list.querySelectorAll('[data-notice-key]').forEach(element=>observer.observe(element));
  return ()=>{observer.disconnect();for(const timer of timers.values())clearTimeout(timer);timers.clear();};
}
