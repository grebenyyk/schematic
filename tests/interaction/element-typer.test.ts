import { describe, test, expect } from 'vitest';
import { ElementTyper } from '../../src/interaction/element-typer';

function make() {
  const applied: string[] = [];
  let now = 1000;
  const typer = new ElementTyper((el) => applied.push(el), () => now);
  return { typer, applied, advance: (ms: number) => { now += ms; } };
}

describe('ElementTyper', () => {
  test('single-letter elements apply immediately', () => {
    const { typer, applied } = make();
    expect(typer.key('n')).toBe(true);
    expect(typer.key('o')).toBe(true);
    expect(typer.key('s')).toBe(true);
    expect(applied).toEqual(['N', 'O', 'S']);
  });

  test('c then l within the timeout upgrades to Cl', () => {
    const { typer, applied, advance } = make();
    typer.key('c');
    advance(300);
    expect(typer.key('l')).toBe(true);
    expect(applied).toEqual(['C', 'Cl']);
  });

  test('b then r upgrades to Br; s then i upgrades to Si', () => {
    const { typer, applied, advance } = make();
    typer.key('b');
    advance(100);
    typer.key('r');
    typer.key('s');
    advance(100);
    typer.key('i');
    expect(applied).toEqual(['B', 'Br', 'S', 'Si']);
  });

  test('c then l after the timeout does not upgrade', () => {
    const { typer, applied, advance } = make();
    typer.key('c');
    advance(2000);
    expect(typer.key('l')).toBe(false); // 'l' alone is not an element
    expect(applied).toEqual(['C']);
  });

  test('unrecognized letters are not handled', () => {
    const { typer, applied } = make();
    expect(typer.key('x')).toBe(false);
    expect(typer.key('q')).toBe(false);
    expect(applied).toEqual([]);
  });

  test('non-continuation after a two-letter candidate start', () => {
    const { typer, applied, advance } = make();
    typer.key('c');
    advance(100);
    expect(typer.key('n')).toBe(true); // 'n' is its own element
    expect(applied).toEqual(['C', 'N']);
  });
});
