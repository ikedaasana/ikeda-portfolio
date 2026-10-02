const q=(s,c=document)=>c.querySelector(s), qa=(s,c=document)=>[...c.querySelectorAll(s)];

const progress=q('.page-progress span');
const header=q('.site-header');
function onScroll(){
  const max=document.documentElement.scrollHeight-innerHeight;
  progress.style.width=`${max>0?(scrollY/max)*100:0}%`;
  header.classList.toggle('scrolled',scrollY>18);
}
addEventListener('scroll',onScroll,{passive:true}); onScroll();

const io=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})
},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
qa('.reveal').forEach(el=>io.observe(el));

qa('[data-compare]').forEach(compare=>{
  const input=q('input',compare);
  const set=()=>compare.style.setProperty('--pos',`${input.value}%`);
  input.addEventListener('input',set); set();
});

// One continuous row, ordered by genre, with manual browsing.
const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
qa('[data-auto-slider]').forEach(slider=>{
  const originals=qa('.work-card',slider);
  if(!originals.length) return;
  const makeClone=(card)=>{const clone=card.cloneNode(true);clone.dataset.loopClone='true';clone.removeAttribute('id');qa('[id]',clone).forEach(el=>el.removeAttribute('id'));clone.setAttribute('aria-hidden','true');return clone;};
  const before=originals.map(makeClone);
  const after=originals.map(makeClone);
  before.reverse().forEach(card=>slider.prepend(card));
  after.forEach(card=>slider.append(card));
  let segment=0, middleStart=0, raf=0, last=performance.now(), holdUntil=0, position=0;
  const firstAfter=after[0];
  const measure=()=>{
    middleStart=originals[0].offsetLeft-before[0].offsetLeft;
    segment=firstAfter.offsetLeft-middleStart;
    if(segment>0 && (slider.scrollLeft<2 || slider.scrollLeft>middleStart+segment+2)) slider.scrollLeft=middleStart;
  };
  requestAnimationFrame(()=>{measure();slider.scrollLeft=middleStart;position=slider.scrollLeft;});
  const tick=(now)=>{
    const dt=Math.min(now-last,40); last=now;
    if(!reduceMotion && now>holdUntil && segment>0){
      position+=dt*.022;
      slider.scrollLeft=position;
      if(slider.scrollLeft<=middleStart-segment+1) slider.scrollLeft+=segment;
      else if(slider.scrollLeft>=middleStart+segment) slider.scrollLeft-=segment;
      if(Math.abs(slider.scrollLeft-position)>1) position=slider.scrollLeft;
    }
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  addEventListener('resize',measure,{passive:true});
  slider.addEventListener('scroll',()=>{if(performance.now()<=holdUntil) position=slider.scrollLeft;},{passive:true});
  slider.addEventListener('pointerenter',()=>holdUntil=Infinity);
  slider.addEventListener('pointerleave',()=>{position=slider.scrollLeft;holdUntil=performance.now()+500;});
  slider.addEventListener('wheel',()=>{holdUntil=performance.now()+1400;},{passive:true});
  const group=slider.closest('.work-group');
  qa('[data-auto-slide]',group).forEach(btn=>btn.addEventListener('click',()=>{
    const card=q('.work-card:not([data-loop-clone="true"])',slider)||q('.work-card',slider);
    const amount=(card?.getBoundingClientRect().width||216)+parseFloat(getComputedStyle(slider).gap||0);
    holdUntil=performance.now()+900;
    slider.scrollBy({left:btn.dataset.autoSlide==='next'?amount:-amount,behavior:'smooth'});
  }));
});

const parallax=q('[data-parallax]');
if(parallax && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches){
  const hero=q('.hero');
  hero.addEventListener('pointermove',e=>{
    const r=hero.getBoundingClientRect();
    const x=((e.clientX-r.left)/r.width-.5)*12;
    const y=((e.clientY-r.top)/r.height-.5)*10;
    parallax.style.transform=`translate3d(${x}px,${y}px,0) rotate(${x*.04}deg)`;
  });
  hero.addEventListener('pointerleave',()=>parallax.style.transform='translate3d(0,0,0)');
}

// Inline project galleries: thumbnails switch the featured image.
qa('.project-gallery').forEach(gallery=>{
  const main=q('.gallery-main-image',gallery);
  const open=q('[data-gallery-open]',gallery);
  const thumbs=qa('[data-gallery-thumb]',gallery);
  thumbs.forEach((thumb,i)=>thumb.addEventListener('click',()=>{
    main.src=thumb.dataset.src;
    main.alt=`${gallery.dataset.galleryTitle} 完成画像 ${i+1}枚目`;
    open.dataset.index=String(i);
    thumbs.forEach(t=>t.classList.toggle('is-active',t===thumb));
  }));
});

// Full-screen slideshow. Clicking a featured image opens it and autoplay advances to the last image.
const lightbox=q('[data-lightbox]');
const lbImage=q('.lightbox-image',lightbox);
const lbTitle=q('[data-lightbox-title]',lightbox);
const lbCount=q('[data-lightbox-count]',lightbox);
const lbProgress=q('.lightbox-progress span',lightbox);
const lbPlay=q('[data-lightbox-play]',lightbox);
let currentGallery=null, currentImages=[], currentIndex=0, timer=null, playing=false;
const DURATION=3200;

function galleryData(container){
  const items=qa('[data-gallery-thumb],[data-gallery-card]',container).filter(el=>!el.closest('[data-loop-clone=\"true\"]'));
  return {
    title:container.dataset.galleryTitle||'Works',
    images:items.map(el=>({src:el.dataset.src, alt:el.getAttribute('aria-label')||container.dataset.galleryTitle||'作品'}))
  };
}
function resetProgress(){
  lbProgress.classList.remove('is-playing');
  void lbProgress.offsetWidth;
  if(playing) lbProgress.classList.add('is-playing');
}
function renderLightbox(){
  const item=currentImages[currentIndex]; if(!item) return;
  lbImage.src=item.src; lbImage.alt=item.alt;
  lbTitle.textContent=currentGallery?.title||'';
  lbCount.textContent=`${String(currentIndex+1).padStart(2,'0')} / ${String(currentImages.length).padStart(2,'0')}`;
  resetProgress();
}
function clearAuto(){ if(timer){clearTimeout(timer);timer=null;} }
function scheduleAuto(){
  clearAuto();
  if(!playing || currentIndex>=currentImages.length-1){
    if(currentIndex>=currentImages.length-1){playing=false;lbPlay.textContent='REPLAY';lbPlay.setAttribute('aria-label','最初から自動再生');lbProgress.classList.remove('is-playing');}
    return;
  }
  resetProgress();
  timer=setTimeout(()=>{currentIndex+=1;renderLightbox();scheduleAuto();},DURATION);
}
function setPlaying(value){
  playing=value; lbPlay.textContent=playing?'PAUSE':(currentIndex>=currentImages.length-1?'REPLAY':'PLAY');
  lbPlay.setAttribute('aria-label',playing?'自動再生を一時停止':'自動再生を開始');
  if(playing) scheduleAuto(); else {clearAuto();lbProgress.classList.remove('is-playing');}
}
function openLightbox(container,index=0){
  const data=galleryData(container); if(!data.images.length) return;
  currentGallery=data; currentImages=data.images; currentIndex=Math.min(Math.max(index,0),currentImages.length-1);
  lightbox.classList.add('is-open'); lightbox.setAttribute('aria-hidden','false'); document.body.classList.add('lightbox-open');
  renderLightbox(); setPlaying(container.dataset.noAutoplay===undefined && !matchMedia('(prefers-reduced-motion:reduce)').matches);
  q('[data-lightbox-close]',lightbox).focus({preventScroll:true});
}
function closeLightbox(){
  setPlaying(false); lightbox.classList.remove('is-open'); lightbox.setAttribute('aria-hidden','true'); document.body.classList.remove('lightbox-open'); lbImage.src='';
}
function step(delta){
  currentIndex=(currentIndex+delta+currentImages.length)%currentImages.length; renderLightbox();
  if(playing) scheduleAuto();
}
qa('[data-gallery-open]').forEach(btn=>btn.addEventListener('click',()=>{
  const container=btn.closest('[data-gallery-id]'); openLightbox(container,Number(btn.dataset.index||0));
}));
qa('[data-gallery-card]').forEach(btn=>btn.addEventListener('click',()=>{
  const container=btn.closest('[data-gallery-id]'); openLightbox(container,Number(btn.dataset.index||0));
}));
q('[data-lightbox-close]',lightbox).addEventListener('click',closeLightbox);
q('[data-lightbox-prev]',lightbox).addEventListener('click',()=>step(-1));
q('[data-lightbox-next]',lightbox).addEventListener('click',()=>step(1));
lbPlay.addEventListener('click',()=>{
  if(currentIndex>=currentImages.length-1 && !playing){currentIndex=0;renderLightbox();setPlaying(true);return;}
  setPlaying(!playing);
});
lightbox.addEventListener('click',e=>{if(e.target===lightbox) closeLightbox();});
addEventListener('keydown',e=>{
  if(!lightbox.classList.contains('is-open')) return;
  if(e.key==='Escape') closeLightbox();
  if(e.key==='ArrowRight') step(1);
  if(e.key==='ArrowLeft') step(-1);
  if(e.key===' ') {e.preventDefault();lbPlay.click();}
});

// Opening pixel rain. The 12 illustrations are optimized local assets; each one links to a related case.
// v3: fall duration is doubled so the opening motion feels slower and calmer.
const pixelRain=q('[data-pixel-rain]');
if(pixelRain){
  const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const drops=qa('.pixel-drop',pixelRain);
  if(reduceMotion || scrollY>120){
    pixelRain.remove();
  }else{
    const slots=[4,12,20,28,36,44,53,61,69,77,85,93];
    // Shuffle predetermined horizontal slots to avoid heavy overlap while keeping the fall random-looking.
    for(let i=slots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
    let longest=0;
    drops.forEach((drop,i)=>{
      const duration=(4.7+Math.random()*2.4)*2;
      const delay=.1+Math.random()*1.7;
      const size=54+Math.round(Math.random()*30);
      const mobile=42+Math.round(Math.random()*18);
      const drift=Math.round(-55+Math.random()*110);
      const rotStart=Math.round(-22+Math.random()*44);
      const rotEnd=rotStart+Math.round(-95+Math.random()*190);
      const x=`calc(${slots[i%slots.length]}vw - ${Math.round(size/2)}px)`;
      drop.style.setProperty('--x',x);
      drop.style.setProperty('--size',`${size}px`);
      drop.style.setProperty('--mobile-size',`${mobile}px`);
      drop.style.setProperty('--drift',`${drift}px`);
      drop.style.setProperty('--rot-start',`${rotStart}deg`);
      drop.style.setProperty('--rot-end',`${rotEnd}deg`);
      drop.style.setProperty('--duration',`${duration.toFixed(2)}s`);
      drop.style.setProperty('--delay',`${delay.toFixed(2)}s`);
      drop.style.setProperty('--fall-y',`${innerHeight+230}px`);
      longest=Math.max(longest,duration+delay);
      drop.addEventListener('click',()=>pixelRain.classList.add('is-finished'),{once:true});
    });
    const hide=()=>pixelRain.classList.add('is-finished');
    setTimeout(hide,(longest+.3)*1000);
    addEventListener('resize',()=>drops.forEach(drop=>drop.style.setProperty('--fall-y',`${innerHeight+230}px`)),{passive:true});
  }
}
