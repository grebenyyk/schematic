import { describe, test, expect } from 'vitest';
import { handleKeyDown, type KeyEvent, type KeyController } from '../../src/interaction/keyboard';

function makeController() {
  const calls: string[] = [];
  const controller: KeyController = {
    undo: () => { calls.push('undo'); },
    redo: () => { calls.push('redo'); },
    setBondOrder: (n) => { calls.push(`order:${n}`); },
    delete: () => { calls.push('delete'); },
  };
  return { controller, calls };
}

const key = (k: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({
  key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods,
});

describe('handleKeyDown', () => {
  test('1/2/3 set bond order', () => {
    const { controller, calls } = makeController();
    expect(handleKeyDown(key('1'), controller)).toBe(true);
    expect(handleKeyDown(key('2'), controller)).toBe(true);
    expect(handleKeyDown(key('3'), controller)).toBe(true);
    expect(calls).toEqual(['order:1', 'order:2', 'order:3']);
  });

  test('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo', () => {
    const { controller, calls } = makeController();
    handleKeyDown(key('z', { ctrlKey: true }), controller);
    handleKeyDown(key('z', { ctrlKey: true, shiftKey: true }), controller);
    handleKeyDown(key('y', { ctrlKey: true }), controller);
    handleKeyDown(key('z', { metaKey: true }), controller); // mac cmd
    expect(calls).toEqual(['undo', 'redo', 'redo', 'undo']);
  });

  test('Delete and Backspace erase', () => {
    const { controller, calls } = makeController();
    expect(handleKeyDown(key('Delete'), controller)).toBe(true);
    expect(handleKeyDown(key('Backspace'), controller)).toBe(true);
    expect(calls).toEqual(['delete', 'delete']);
  });

  test('unhandled keys return false', () => {
    const { controller } = makeController();
    expect(handleKeyDown(key('x'), controller)).toBe(false);
    expect(handleKeyDown(key('z'), controller)).toBe(false); // no modifier
  });
});
