import { expect } from "chai";
import { sqrtBigInt } from "../utils/sqrt";
import { calculateSqrtPrice } from "../utils/amounts";

describe('sqrtBigInt Function its', () => {
  it('Square root of 0n is 0n', () => {
    expect(sqrtBigInt(0n)).to.equal(0n);
  });

  it('Square root of 1n is 1n', () => {
    expect(sqrtBigInt(1n)).to.equal(1n);
  });

  it('Square root of perfect squares', () => {
    expect(sqrtBigInt(4n)).to.equal(2n);
    expect(sqrtBigInt(9n)).to.equal(3n);
    expect(sqrtBigInt(16n)).to.equal(4n);
    expect(sqrtBigInt(144n)).to.equal(12n);
    expect(sqrtBigInt(10000n)).to.equal(100n);
  });

  it('Square root of large perfect square', () => {
    const bigNumber = 1234567890123456789012345678901234567890n;
    const perfectSquare = bigNumber * bigNumber;
    expect(sqrtBigInt(perfectSquare)).to.equal(bigNumber);
  });

  it('Square root of non-perfect squares', () => {
    expect(sqrtBigInt(2n)).to.equal(1n);
    expect(sqrtBigInt(3n)).to.equal(1n);
    expect(sqrtBigInt(5n)).to.equal(2n);
    expect(sqrtBigInt(10n)).to.equal(3n);
    expect(sqrtBigInt(15n)).to.equal(3n);
    expect(sqrtBigInt(17n)).to.equal(4n);
  });

  it('Square root of large non-perfect square', () => {
    const bigNumber = 1234567890123456789012345678901234567890n;
    const nonPerfectSquare = bigNumber * bigNumber + 1n;
    expect(sqrtBigInt(nonPerfectSquare)).to.equal(bigNumber);
  });

  it('Negative input throws RangeError', () => {
    expect(() => sqrtBigInt(-1n)).to.throw(RangeError);
    expect(() => sqrtBigInt(-100n)).to.throw('Square root of negative numbers is not supported for BigInts.');
  });
});

describe("calculateSqrtPrice", () => {
  it('calculates 1:1 ratio correctly', () => {
    let amount0desired = 1n * (10n ** 18n);
    let amount1desired = 1n * (10n ** 18n);
    
    const sqrtPriceX96 = calculateSqrtPrice(amount0desired, amount1desired);
    
    const Q96 = 1n << 96n;
    const sqrtPriceX96Squared = sqrtPriceX96 * sqrtPriceX96;
    const numerator = amount0desired * sqrtPriceX96Squared;
    const denominator = Q96 * Q96;
  
    expect(numerator / denominator).to.equal(amount1desired);
  });
  
  it('calculates 2:1 ratio correctly', () => {
    let amount0desired = 2n * (10n ** 18n);
    let amount1desired = 1n * (10n ** 18n);
    
    const sqrtPriceX96 = calculateSqrtPrice(amount0desired, amount1desired);
    
    const Q96 = 1n << 96n;
    const sqrtPriceX96Squared = sqrtPriceX96 * sqrtPriceX96;
    const numerator = amount0desired * sqrtPriceX96Squared;
    const denominator = Q96 * Q96;
  
    expect(numerator / denominator).to.equal(999999999999999999n);
  });

  it('calculates 70000000:1 ratio', () => {
    let amount0desired = 70000000n * (10n ** 18n);
    let amount1desired = 1n * (10n ** 18n);
  
    const sqrtPriceX96 = calculateSqrtPrice(amount0desired, amount1desired);
    
    const Q96 = 1n << 96n;
    const sqrtPriceX96Squared = sqrtPriceX96 * sqrtPriceX96;
    const numerator = amount0desired * sqrtPriceX96Squared;
    const denominator = Q96 * Q96;
  
    expect(numerator / denominator).to.equal(999999999999999999n);
  });

  it('calculates 1:70000000 ratio', () => {
    let amount0desired = 1n * (10n ** 18n);
    let amount1desired = 70000000n * (10n ** 18n);
  
    const sqrtPriceX96 = calculateSqrtPrice(amount0desired, amount1desired);
    
    const Q96 = 1n << 96n;
    const sqrtPriceX96Squared = sqrtPriceX96 * sqrtPriceX96;
    const numerator = amount0desired * sqrtPriceX96Squared;
    const denominator = Q96 * Q96;
  
    expect(numerator / denominator).to.equal(69999999999999999999999999n);
  });
});