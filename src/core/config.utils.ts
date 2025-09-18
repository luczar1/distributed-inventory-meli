// Utility functions for configuration parsing

/**
 * Parse environment variable with type conversion
 */
export function parseEnvVar<T>(
  key: string,
  defaultValue: T,
  parser: (value: string) => T
): T {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  
  try {
    return parser(value);
  } catch (error) {
    console.warn(`Invalid value for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Parse integer with validation
 */
export function parseIntWithValidation(
  value: string,
  min?: number,
  max?: number
): number {
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer: ${value}`);
  }
  
  if (min !== undefined && parsed < min) {
    throw new Error(`Value ${parsed} is below minimum ${min}`);
  }
  
  if (max !== undefined && parsed > max) {
    throw new Error(`Value ${parsed} is above maximum ${max}`);
  }
  
  return parsed;
}

/**
 * Parse positive integer
 */
export function parsePositiveInt(key: string, defaultValue: number): number {
  return parseEnvVar(key, defaultValue, (value) => 
    parseIntWithValidation(value, 1)
  );
}

/**
 * Parse non-negative integer
 */
export function parseNonNegativeInt(key: string, defaultValue: number): number {
  return parseEnvVar(key, defaultValue, (value) => 
    parseIntWithValidation(value, 0)
  );
}

/**
 * Parse positive float
 */
export function parsePositiveFloat(key: string, defaultValue: number): number {
  return parseEnvVar(key, defaultValue, (value) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid positive float: ${value}`);
    }
    return parsed;
  });
}

/**
 * Parse non-negative float
 */
export function parseNonNegativeFloat(key: string, defaultValue: number): number {
  return parseEnvVar(key, defaultValue, (value) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(`Invalid non-negative float: ${value}`);
    }
    return parsed;
  });
}
