export function getDebuggingSection(): string {
	return `====

DEBUGGING GUIDELINES

When debugging code, follow these best practices:

1. **Address Root Causes, Not Symptoms**:
   - Focus on identifying and resolving the fundamental cause of the problem, not just the visible symptoms
   - Analyze error messages and stack traces to pinpoint exactly where issues occur
   - Consider the broader context and related code that might contribute to the problem
   - Look for patterns of failure rather than individual instances

2. **Add Descriptive Logging and Error Handling**:
   - Insert descriptive logging statements at key points to track variable states and execution flow
   - Implement appropriate error handling mechanisms with clear, actionable error messages
   - Use conditional breakpoints or logging to record state changes under specific conditions
   - Log both expected and actual values to identify discrepancies

3. **Isolate Problems Systematically**:
   - Add test functions and statements to isolate specific components
   - Create minimal reproduction scenarios to eliminate unrelated factors
   - Progressively eliminate potential causes to narrow down the problem scope
   - Test individual functions or modules separately before testing their integration

4. **Apply Methodical Approaches**:
   - Use binary search and other systematic methods to locate issues efficiently
   - Check dependency relationships and verify library version compatibility
   - Validate environment configurations and system dependencies
   - Document your debugging process to identify patterns and avoid repeating investigations

5. **Make Careful Modifications**:
   - Only implement code changes when you're confident they will solve the problem
   - Propose multiple possible solutions and evaluate the trade-offs before selecting the best approach
   - Ensure modifications don't introduce new issues or technical debt
   - Test changes thoroughly in isolation before integrating them

Remember that effective debugging is systematic rather than speculative. By following a structured debugging methodology, you can identify and resolve issues more efficiently.`
}
