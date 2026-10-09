import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const begin = source.indexOf('  function startRecentCarousel()');
const end = source.indexOf('  function recentCarouselMetrics(', begin);

function harness(width = 375) {
  const classes = new Set();
  const frames = [];
  const viewport = {
    clientWidth: width, scrollLeft: 0,
    classList: {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)},
    scrollTo({left}) {
      // Mandatory edge snapping reproduces the browser's first-paint failure.
      this.scrollLeft = classes.has('is-autoplaying') ? left : Math.round(left / 115) * 115;
    },
  };
  const track = {parentElement: viewport, children: [{}], dataset: {carouselOriginalCount: '3'}, isConnected: true};
  const state = {
    recentCarouselTimer: null, recentCarouselRebaseTimer: null, recentCarouselOffset: 0,
    $: () => track, document: {hidden: false},
    enableRecentCarouselTouch() {}, fitRecentCarouselCards() {},
    recentCarouselMetrics: () => ({track, step: 115, cycleDistance: 345, carouselStart: 325}),
    scheduleRecentCarouselNormalize() {},
    window: {requestAnimationFrame: fn => frames.push(fn), setInterval: () => 1, clearInterval() {}, clearTimeout() {}},
  };
  const start = vm.runInNewContext(`(${source.slice(begin, end).trim()})`, state);
  return {start, state, viewport, track, frames, classes};
}

test('First paint starts at the centered offset before any gesture or autoplay step', () => {
  const h = harness(); h.start();
  assert.equal(h.viewport.scrollLeft, 325);
  assert.equal(h.track.dataset.carouselPositioned, 'true');
  assert.equal(h.state.recentCarouselOffset, 325);
});

test('A hidden Home does not consume initial positioning; showing it centers the carousel', () => {
  const h = harness(0); h.start();
  assert.equal(h.track.dataset.carouselPositioned, undefined);
  assert.equal(h.state.recentCarouselTimer, null);
  h.viewport.clientWidth = 375; h.start();
  assert.equal(h.viewport.scrollLeft, 325);
});

test('The first layout callback never resets a finger gesture that has already begun', () => {
  const h = harness(); h.start();
  h.classes.add('is-interacting'); h.track.dataset.carouselAutoplay = 'false';
  h.viewport.scrollLeft = 410;
  for (const frame of h.frames) frame();
  assert.equal(h.viewport.scrollLeft, 410);
});
