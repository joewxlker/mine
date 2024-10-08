import { sqrtBigInt } from "./sqrt";

/**
 * Calculates the sqrtPriceX96 based on amount0Desired and amount1Desired.
 * 
 * @param amount0Desired The desired amount of Token0.
 * @param amount1Desired The desired amount of Token1.
 * @returns The calculated sqrtPriceX96.
 */
export function calculateSqrtPrice(amount0Desired: bigint, amount1Desired: bigint): bigint {
    const SCALE = 1n << 192n;

    let priceRatio = (amount1Desired * SCALE) / amount0Desired;

    const sqrtPriceX96 = sqrtBigInt(priceRatio);

    return sqrtPriceX96;
}