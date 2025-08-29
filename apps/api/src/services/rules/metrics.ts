/**
 * Metrics collection for rules engine
 */
export class RuleMetrics {
  private metrics: Map<string, any> = new Map();

  constructor() {
    // Initialize metric counters
    this.metrics.set("ruleExecutions", new Map());
    this.metrics.set("executionDurations", new Map());
    this.metrics.set("batchDurations", new Map());
    this.metrics.set("activeRules", new Map());
    this.metrics.set("failures", new Map());
  }

  /**
   * Record a rule execution
   */
  recordRuleExecution(
    ruleId: string,
    durationMs: number,
    success: boolean,
    trigger: string = "unknown",
  ): void {
    const status = success ? "success" : "failure";
    const key = `${ruleId}_${status}_${trigger}`;

    const executions = this.metrics.get("ruleExecutions");
    executions.set(key, (executions.get(key) || 0) + 1);

    const durations = this.metrics.get("executionDurations");
    const durationKey = `${ruleId}_${status}`;
    if (!durations.has(durationKey)) {
      durations.set(durationKey, []);
    }
    durations.get(durationKey).push(durationMs);

    if (!success) {
      const failures = this.metrics.get("failures");
      const failureKey = `${ruleId}_execution_error`;
      failures.set(failureKey, (failures.get(failureKey) || 0) + 1);
    }
  }

  /**
   * Record a batch execution
   */
  recordBatchExecution(batchSize: number, durationMs: number): void {
    const batches = this.metrics.get("batchDurations");
    const key = batchSize.toString();
    if (!batches.has(key)) {
      batches.set(key, []);
    }
    batches.get(key).push(durationMs);
  }

  /**
   * Update active rules count for a user
   */
  updateActiveRulesCount(userId: string, count: number): void {
    const activeRules = this.metrics.get("activeRules");
    activeRules.set(userId, count);
  }

  /**
   * Record a rule execution failure
   */
  recordExecutionFailure(ruleId: string, errorType: string = "unknown"): void {
    const failures = this.metrics.get("failures");
    const key = `${ruleId}_${errorType}`;
    failures.set(key, (failures.get(key) || 0) + 1);
  }

  /**
   * Get current metrics
   */
  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};

    this.metrics.forEach((value, key) => {
      if (value instanceof Map) {
        result[key] = Object.fromEntries(value);
      } else {
        result[key] = value;
      }
    });

    return result;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics.clear();
    this.metrics.set("ruleExecutions", new Map());
    this.metrics.set("executionDurations", new Map());
    this.metrics.set("batchDurations", new Map());
    this.metrics.set("activeRules", new Map());
    this.metrics.set("failures", new Map());
  }
}
