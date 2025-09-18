// Concurrency control utility to run N tasks in parallel
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit <= 0) {
    throw new Error('Limit must be greater than 0');
  }

  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];
  let index = 0;

  const executeNext = async (): Promise<void> => {
    if (index >= items.length) {
      return;
    }

    const currentIndex = index++;
    const item = items[currentIndex];
    if (item === undefined) {
      throw new Error(`Item at index ${currentIndex} is undefined`);
    }

    try {
      const result = await fn(item, currentIndex);
      results[currentIndex] = result;
    } catch (error) {
      // Re-throw with context
      throw new Error(`Error processing item at index ${currentIndex}: ${error}`);
    }
  };

  // Start initial batch
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    executing.push(executeNext());
  }

  // Process remaining items as slots become available
  while (executing.length > 0) {
    await Promise.race(executing);
    // Remove completed promises
    executing.splice(0, 1);

    if (index < items.length) {
      executing.push(executeNext());
    }
  }

  return results;
}

// Alternative implementation using Promise.allSettled for better error handling
export async function mapLimitSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (limit <= 0) {
    throw new Error('Limit must be greater than 0');
  }

  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const executing: Promise<void>[] = [];
  let index = 0;

  const executeNext = async (): Promise<void> => {
    if (index >= items.length) {
      return;
    }

    const currentIndex = index++;
    const item = items[currentIndex];
    if (item === undefined) {
      throw new Error(`Item at index ${currentIndex} is undefined`);
    }

    try {
      const result = await fn(item, currentIndex);
      results[currentIndex] = { status: 'fulfilled', value: result };
    } catch (error) {
      results[currentIndex] = { 
        status: 'rejected', 
        reason: new Error(`Error processing item at index ${currentIndex}: ${error}`)
      };
    }
  };

  // Start initial batch
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    executing.push(executeNext());
  }

  // Process remaining items as slots become available
  while (executing.length > 0) {
    await Promise.race(executing);
    // Remove completed promises
    executing.splice(0, 1);

    if (index < items.length) {
      executing.push(executeNext());
    }
  }

  return results;
}
