// Keep drag and automatic motion on the same animation timeline.
export function enableBrandMarqueeDrag({track, events, now = () => performance.now(), phaseChanged = () => {}}) {
  let start = null, suppressUntil = 0;
  const animation = () => track?.getAnimations?.()[0];
  const finish = event => {
    if (!start || event.pointerId !== start.id) return;
    if (start.dragging) {
      const motion = animation();
      phaseChanged((Number(motion?.currentTime) || 0) - (Number(motion?.effect.getTiming().delay) || 0));
      motion?.play();
      suppressUntil = now() + 500;
    }
    start = null;
  };
  track?.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    start = {id:event.pointerId,x:event.clientX,y:event.clientY,time:(Number(animation()?.currentTime)||0) - (Number(animation()?.effect.getTiming().delay)||0),dragging:false};
  }, {passive:true});
  events.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.dragging && (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy))) return;
    const motion = animation(), width = track.querySelector('.trusted-brands-group')?.getBoundingClientRect().width;
    if (!motion || !width) return;
    start.dragging = true;
    motion.pause();
    const duration = Number(motion.effect.getTiming().duration) || 130000;
    motion.currentTime = ((start.time - dx * duration / width) % duration + duration) % duration + (Number(motion.effect.getTiming().delay) || 0);
    event.preventDefault();
  }, {passive:false});
  events.addEventListener('pointerup', finish, {passive:true});
  events.addEventListener('pointercancel', finish, {passive:true});
  return {suppressClick:() => now() < suppressUntil};
}
