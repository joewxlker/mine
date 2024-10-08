export function sqrtBigInt(value: bigint): bigint {
    if (value < 0n) {
        throw new RangeError('Square root of negative numbers is not supported for BigInts.');
    }

    if (value === 0n || value === 1n) {
        return value;
    }

    let low = 1n;
    let high = value / 2n + 1n;  // The square root of value cannot be more than value / 2 + 1

    while (low <= high) {
        const mid = low + (high - low) / 2n;
        const midSquared = mid * mid;

        if (midSquared === value) {
            return mid;  // Exact square root found
        } else if (midSquared < value) {
            low = mid + 1n;
        } else {
            high = mid - 1n;
        }
    }

    // Return the floor of the square root
    return high;
}