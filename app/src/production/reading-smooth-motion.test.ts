import { describe, expect, it } from 'vitest';
import { createReadingSmoothMotion } from './reading-smooth-motion';

function fixture() {
  let y = 0, max = 4000, id = 0;
  const pending = new Map<number, (now: number) => void>();
  const writes: number[] = [];
  const motion = createReadingSmoothMotion({
    requestFrame: (callback) => { pending.set(++id, callback); return id; },
    cancelFrame: (handle) => { pending.delete(handle); }
  });
  const owner = { ownerKey: {}, readPosition: () => y, readMax: () => max,
    writePosition: (next: number) => { y = next; writes.push(next); } };
  motion.bind(owner);
  return { motion, owner, pending, writes, y: () => y,
    setY: (next: number) => { y = next; }, setMax: (next: number) => { max = next; },
    frame: (now: number) => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((callback) => callback(now)); }
  };
}

describe('desktop reading target chase', () => {
  it.each([60, 120])('settles without a perpetual loop at %i Hz', (hz) => {
    const f = fixture();
    f.motion.push({ deltaPx: 600, now: 0 });
    expect(f.y()).toBe(0);
    for (let i = 1; i <= hz / 4; i++) f.frame(i * 1000 / hz);
    expect(f.y()).toBeGreaterThan(570);
    for (let i = Math.floor(hz / 4) + 1; i <= hz * .6; i++) f.frame(i * 1000 / hz);
    expect(f.y()).toBe(600);
    expect(f.pending.size).toBe(0);
  });

  it('settles when the browser quantizes every write to an integer', () => {
    const f = fixture();
    f.motion.bind({ ...f.owner, ownerKey: {}, writePosition: (next) => f.setY(Math.round(next)) });
    f.motion.push({ deltaPx: 600, now: 0 });
    for (let now = 16; now <= 600; now += 16) f.frame(now);
    expect(f.y()).toBe(600);
    expect(f.pending.size).toBe(0);
  });

  it('combines a long gesture without a one-screen budget or multiple writers', () => {
    const f = fixture();
    for (let i = 0; i < 100; i++) {
      f.motion.bind(f.owner);
      f.motion.push({ deltaPx: 20, now: i * 10 });
      expect(f.pending.size).toBe(1);
      f.frame(i * 10 + 10);
    }
    for (let now = 1010; now <= 1500; now += 10) f.frame(now);
    expect(f.y()).toBe(2000);
    expect(f.pending.size).toBe(0);
  });

  it('reverses from the visible position instead of draining old momentum', () => {
    const f = fixture();
    f.motion.push({ deltaPx: 600, now: 0 }); f.frame(16);
    const before = f.y();
    f.motion.push({ deltaPx: -40, now: 16 }); f.frame(32);
    expect(f.y()).toBeLessThan(before);
    for (let now = 48; now < 650; now += 16) f.frame(now);
    expect(f.y()).toBeCloseTo(before - 40);
  });

  it('does not pull back an external scroll, or catch up a background frame', () => {
    const f = fixture();
    f.motion.push({ deltaPx: 300, now: 0 }); f.setY(1000); f.frame(16);
    expect(f.y()).toBe(1000); expect(f.pending.size).toBe(0);
    f.motion.bind(f.owner); f.motion.push({ deltaPx: 300, now: 20 }); f.frame(2000);
    expect(f.y()).toBe(1000); expect(f.pending.size).toBe(0);
  });

  it('clamps targets and discards callbacks on rebind and dispose', () => {
    const f = fixture(); f.setMax(100);
    f.motion.push({ deltaPx: 500, now: 0 });
    for (let now = 16; now < 650; now += 16) f.frame(now);
    expect(f.y()).toBe(100);
    f.motion.bind(f.owner); f.motion.push({ deltaPx: -100, now: 700 });
    f.motion.bind({ ...f.owner, ownerKey: {} });
    expect(f.pending.size).toBe(0);
    f.motion.push({ deltaPx: -100, now: 710 }); f.motion.dispose(); f.frame(720);
    expect(f.y()).toBe(100); expect(f.pending.size).toBe(0);
  });
});
