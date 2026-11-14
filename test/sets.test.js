import { describe, expect, it } from 'vitest'
import { chunk, clampSetIndex, questionsInSet, setBounds, setCount, sliderMax } from '../src/lib/sets.js'

const bank = Array.from({ length: 400 }, (_, index) => ({ id: `q${index}`, position: index }))

describe('set slicing', () => {
  it('counts sets, with a partial final set', () => {
    expect(setCount(400, 100)).toBe(4)
    expect(setCount(400, 150)).toBe(3)
    expect(setCount(0, 100)).toBe(0)
  })

  it('slices on position boundaries', () => {
    expect(setBounds(2, 100)).toEqual({ start: 200, end: 300 })
    const third = questionsInSet(bank, 100, 2)
    expect(third).toHaveLength(100)
    expect(third[0].id).toBe('q200')
  })

  it('gives the last set whatever remains', () => {
    expect(questionsInSet(bank, 150, 2)).toHaveLength(100)
  })

  it('covers the bank exactly once at any size', () => {
    for (const size of [10, 25, 60, 100, 150, 400]) {
      const seen = []
      for (let index = 0; index < setCount(bank.length, size); index++) {
        seen.push(...questionsInSet(bank, size, index).map((q) => q.id))
      }
      expect(seen).toHaveLength(bank.length)
      expect(new Set(seen).size).toBe(bank.length)
    }
  })
})

describe('clamping after a resize', () => {
  it('keeps the index inside the new set count', () => {
    // Was on set 4 of 4 at size 100; at size 200 there are only 2 sets.
    expect(clampSetIndex(3, 400, 200)).toBe(1)
    expect(clampSetIndex(0, 400, 200)).toBe(0)
    expect(clampSetIndex(99, 400, 400)).toBe(0)
  })

  it('never returns a negative index for an empty bank', () => {
    expect(clampSetIndex(5, 0, 100)).toBe(0)
  })

  it('offers a slider range that can always cover the bank', () => {
    expect(sliderMax(400)).toBe(400)
    // Rounds up to a whole step so the top of the range can still cover the bank.
    expect(sliderMax(302)).toBe(310)
    expect(sliderMax(4)).toBe(10)
  })
})

describe('sheets', () => {
  it('pages a set into sheets of ten', () => {
    const sheets = chunk(questionsInSet(bank, 100, 0).map((q) => q.id), 10)
    expect(sheets).toHaveLength(10)
    expect(sheets[9]).toHaveLength(10)
  })

  it('leaves a short final sheet', () => {
    expect(chunk(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']])
  })
})
